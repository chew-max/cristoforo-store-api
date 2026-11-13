import { listPrintifyProducts } from "./fulfillment/printify.js";
import { getStoreConfig} from "./config/store.js";
import {
  sendOrderConfirmation,
  sendShippingConfirmation,
  sendDeliveryConfirmation,
  sendFulfillmentFailureAlert
} from "./email/index.js";
import { NOTIFICATION_TYPES,claimOrderNotification,markNotificationSent,markNotificationFailed } from "./notifications.js";
import { calculateFloridaTax } from "./tax/florida.js";
import { calculateShipping } from "./shipping.js";
import {
  createHostedPaymentPage,
  verifyTransactionByReference, reverseTransaction, evaluateCardVerification, decideCapturedPaymentAction
} from "./global-payments.js";
import { handleGlobalPaymentsWebhook } from "./payments/global-payments-webhook.js";
import { products } from "./products.js";
import {
  fulfillOrder,
  findExistingFulfillmentOrder,
  reconcileFulfillmentOrder
} from "./fulfillment/index.js";

const PRINTIFY_WEBHOOK_EVENTS = new Set([
  "order:updated",
  "order:sent-to-production",
  "order:shipment:created",
  "order:shipment:delivered"
]);

/* =========================================================
   Response Helpers
   ========================================================= */

function paymentRedirect(destination) {
  const safeDestination = JSON.stringify(destination);

  return new Response(
    `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Cache-Control" content="no-store">
        <meta http-equiv="refresh" content="0;url=${destination}">
        <title>Payment Result</title>
      </head>
      <body>
        <p>Returning to store...</p>
        <script>
          window.location.replace(${safeDestination});
        </script>
        <p><a href="${destination}">Continue</a></p>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}

function jsonResponse(data, status, corsHeaders) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

/* =========================================================
   Order Helpers
   ========================================================= */

async function createOrderWithItems(
  env,
  orderData,
  validatedItems
) {
  const customerStatusToken =
    crypto.randomUUID();

  const orderInsert =
    env.DB.prepare(
      `
        INSERT INTO orders (
          order_reference,
          email,
          customer_name,
          shipping_address1,
          shipping_address2,
          shipping_city,
          shipping_state,
          shipping_postal_code,
          shipping_country,
          phone,
          subtotal,
          merchandise_subtotal,
          shipping_amount,
          tax_amount,
          total,
          currency,
          payment_status,
          fulfillment_status,
          customer_status_token
        )
        VALUES (
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?
        )
      `
    ).bind(
      orderData.reference,
      orderData.email,
      orderData.customerName,
      orderData.address1,
      orderData.address2 || null,
      orderData.city,
      orderData.state,
      orderData.postalCode,
      orderData.country,
      orderData.phone || null,
      orderData.total,
      orderData.merchandiseSubtotal,
      orderData.shippingAmount,
      orderData.taxAmount,
      orderData.total,
      orderData.currency,
      "PENDING",
      "PENDING",
      customerStatusToken
    );

  const itemStatements =
    validatedItems.map((item) => {
      const product =
        products[item.sku];

      return env.DB.prepare(
        `
          INSERT INTO order_items (
            order_id,
            product_id,
            sku,
            product_name,
            color,
            size,
            options_json,
            quantity,
            unit_price
          )
          SELECT
            id,
            ?, ?, ?, ?, ?, ?, ?, ?
          FROM orders
          WHERE order_reference = ?
          LIMIT 1
        `
      ).bind(
        product.productId,
        item.sku,
        product.name,
        product.color || null,
        product.size || null,
        JSON.stringify(
          product.options || {}
        ),
        item.quantity,
        product.price,
        orderData.reference
      );
    });

  const orderLookup =
    env.DB.prepare(
      `
        SELECT id
        FROM orders
        WHERE order_reference = ?
        LIMIT 1
      `
    ).bind(
      orderData.reference
    );

  const results =
    await env.DB.batch([
      orderInsert,
      ...itemStatements,
      orderLookup
    ]);

  const lookupResult =
    results[
      results.length - 1
    ];

  const orderId =
    Number(
      lookupResult
        ?.results
        ?.[0]
        ?.id
    );

  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    throw new Error(
      "Order was created but its ID could not be resolved."
    );
  }

  return {
    orderId,
    customerStatusToken
  };
}

async function loadPaymentState(env, orderId) {
  return env.DB.prepare(
    `
      SELECT
        id,
        payment_status,
        transaction_id,
        fulfillment_status
      FROM orders
      WHERE id = ?
      LIMIT 1
    `
  )
    .bind(orderId)
    .first();
}


/* =========================================================
   Printify Webhook + Reconciliation Helpers
   ========================================================= */

function hexToBytes(value) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

async function verifyPrintifyWebhookSignature(env, rawBody, signatureHeader) {
  if (!env.PRINTIFY_WEBHOOK_SECRET) {
    throw new Error("PRINTIFY_WEBHOOK_SECRET is not configured.");
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const signatureBytes = hexToBytes(signatureHeader.slice(7));

  if (!signatureBytes || signatureBytes.length !== 32) {
    return false;
  }

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.PRINTIFY_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(rawBody)
  );
}

function webhookShipmentFallback(payload) {
  const data = payload?.resource?.data || {};
  const carrier = data?.carrier || {};

  return {
    trackingNumber: carrier?.tracking_number || null,
    trackingUrl: carrier?.tracking_url || null,
    carrier: carrier?.code || null,
    shippedAt: data?.shipped_at || null,
    deliveredAt: data?.delivered_at || null
  };
}

async function loadFulfillmentOrderByProviderId(env, provider, providerOrderId) {
  return env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        payment_status,
        fulfillment_status,
        fulfillment_provider,
        fulfillment_order_id,
        fulfillment_provider_status,
        fulfillment_last_event_id,
        tracking_number,
        tracking_url,
        carrier,
        shipped_at,
        delivered_at,
        fulfilled_at
      FROM orders
      WHERE fulfillment_provider = ?
        AND fulfillment_order_id = ?
      LIMIT 1
    `
  )
    .bind(provider, providerOrderId)
    .first();
}

async function sendShippingConfirmationSafely(
  env,
  orderId
) {
  const type =
    NOTIFICATION_TYPES
      .SHIPPING_CONFIRMATION;

  let claimed = false;

  try {
    const order =
      await env.DB.prepare(
        `
          SELECT
            id,
            order_reference,
            email,
            customer_name,
            shipping_address1,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_postal_code,
            shipping_country,
            fulfillment_status,
            tracking_number,
            tracking_url,
            carrier,
            shipped_at
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
      )
        .bind(orderId)
        .first();

    if (!order) {
      throw new Error(
        "Shipping confirmation order could not be loaded."
      );
    }

    if (
      order.fulfillment_status !==
      "SHIPPED"
    ) {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Order is not SHIPPED"
        }
      );

      return;
    }

    if (!order.tracking_number) {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Tracking number is missing"
        }
      );

      return;
    }

    claimed =
      await claimOrderNotification(
        env,
        {
          orderId,
          type,
          provider:
            env.EMAIL_PROVIDER ||
            "resend"
        }
      );

    if (!claimed) {
      console.log(
        "SHIPPING CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Notification already claimed"
        }
      );

      return;
    }

    const result =
      await sendShippingConfirmation(
        env,
        order
      );

    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId:
          result?.id || null
      }
    );

	console.log(
	  "SHIPPING CONFIRMATION SENT",
	  {
		orderId:
		  order.id,
		reference:
		  order.order_reference
	  }
	);
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (
        notificationError
      ) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message:
              notificationError
                ?.message ||
              String(
                notificationError
              )
          }
        );
      }
    }

    console.error(
      "SHIPPING CONFIRMATION ERROR",
      {
        orderId,
        message:
          error?.message ||
          String(error)
      }
    );
  }
}

async function sendDeliveryConfirmationSafely(
  env,
  orderId
) {
  const type =
    NOTIFICATION_TYPES
      .DELIVERY_CONFIRMATION;

  let claimed = false;

  try {
    const order =
      await env.DB.prepare(
        `
          SELECT
            id,
            order_reference,
            email,
            fulfillment_status,
            delivered_at
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
      )
        .bind(orderId)
        .first();

    if (!order) {
      throw new Error(
        "Delivery confirmation order could not be loaded."
      );
    }

    if (
      order.fulfillment_status !==
      "DELIVERED"
    ) {
      console.log(
        "DELIVERY CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Order is not DELIVERED"
        }
      );

      return;
    }

    claimed =
      await claimOrderNotification(
        env,
        {
          orderId,
          type,
          provider:
            env.EMAIL_PROVIDER ||
            "resend"
        }
      );

    if (!claimed) {
      console.log(
        "DELIVERY CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Notification already claimed"
        }
      );

      return;
    }

    const result =
      await sendDeliveryConfirmation(
        env,
        order
      );

    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId:
          result?.id || null
      }
    );

    console.log(
      "DELIVERY CONFIRMATION SENT",
      {
        orderId:
          order.id,
        reference:
          order.order_reference
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (
        notificationError
      ) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message:
              notificationError
                ?.message ||
              String(
                notificationError
              )
          }
        );
      }
    }

    console.error(
      "DELIVERY CONFIRMATION ERROR",
      {
        orderId,
        message:
          error?.message ||
          String(error)
      }
    );
  }
}


async function sendFulfillmentFailureAlertSafely(
  env,
  orderId
) {
  const type =
    NOTIFICATION_TYPES
      .FULFILLMENT_FAILURE;

  let claimed = false;

  try {
    const order =
      await env.DB.prepare(
        `
          SELECT
            id,
            order_reference,
            email,
            payment_status,
            fulfillment_status,
            fulfillment_provider,
            fulfillment_provider_status,
            fulfillment_order_id,
            fulfillment_error
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
      )
        .bind(orderId)
        .first();

    if (!order) {
      throw new Error(
        "Fulfillment failure alert order could not be loaded."
      );
    }

    if (
      order.payment_status !== "PAID" ||
      order.fulfillment_status !== "FAILED"
    ) {
      console.log(
        "FULFILLMENT FAILURE ALERT SKIPPED",
        {
          orderId,
          reason:
            "Order is not a PAID + FAILED fulfillment"
        }
      );

      return;
    }

    claimed =
      await claimOrderNotification(
        env,
        {
          orderId,
          type,
          provider:
            env.EMAIL_PROVIDER ||
            "resend"
        }
      );

    if (!claimed) {
      console.log(
        "FULFILLMENT FAILURE ALERT SKIPPED",
        {
          orderId,
          reason:
            "Notification already claimed"
        }
      );

      return;
    }

    const result =
      await sendFulfillmentFailureAlert(
        env,
        order
      );

    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId:
          result?.id || null
      }
    );

    console.log(
      "FULFILLMENT FAILURE ALERT SENT",
      {
        orderId:
          order.id,
        reference:
          order.order_reference
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (
        notificationError
      ) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message:
              notificationError
                ?.message ||
              String(
                notificationError
              )
          }
        );
      }
    }

    console.error(
      "FULFILLMENT FAILURE ALERT ERROR",
      {
        orderId,
        message:
          error?.message ||
          String(error)
      }
    );
  }
}


async function reconcileStoredFulfillmentOrder(env, order, options = {}) {
  const reconciliation = await reconcileFulfillmentOrder(env, order);

  const eventFallback = options.eventPayload
    ? webhookShipmentFallback(options.eventPayload)
    : {};

  const status =
    reconciliation.status || "SUBMITTED";

  const providerStatus =
    reconciliation.providerStatus || null;

  const trackingNumber =
    reconciliation.trackingNumber ||
    eventFallback.trackingNumber ||
    null;

  const trackingUrl =
    reconciliation.trackingUrl ||
    eventFallback.trackingUrl ||
    null;

  const carrier =
    reconciliation.carrier ||
    eventFallback.carrier ||
    null;

  const shippedAt =
    reconciliation.shippedAt ||
    eventFallback.shippedAt ||
    null;

  const deliveredAt =
    reconciliation.deliveredAt ||
    eventFallback.deliveredAt ||
    null;

  const fulfilledAt =
    reconciliation.fulfilledAt ||
    null;

  const eventId =
    options.eventId || null;

  const fulfillmentError =
    status === "FAILED"
      ? `Printify reported fulfillment status: ${providerStatus || "failed"}.`
      : null;

  const updateResult = await env.DB.prepare(
    `
      UPDATE orders
      SET
		fulfillment_status =
		  CASE
			WHEN fulfillment_status = 'DELIVERED'
			  AND ? <> 'DELIVERED'
			  THEN fulfillment_status

			WHEN fulfillment_status = 'SHIPPED'
			  AND ? IN (
				'SUBMITTED',
				'ON_HOLD',
				'IN_PRODUCTION'
			  )
			  THEN fulfillment_status

			ELSE ?
		  END,
        fulfillment_provider_status = ?,
        fulfillment_reconciled_at = CURRENT_TIMESTAMP,
        fulfillment_last_event_id = COALESCE(?, fulfillment_last_event_id),
        tracking_number = COALESCE(?, tracking_number),
        tracking_url = COALESCE(?, tracking_url),
        carrier = COALESCE(?, carrier),
        shipped_at = COALESCE(?, shipped_at),
        delivered_at = COALESCE(?, delivered_at),
        fulfilled_at = COALESCE(?, fulfilled_at),
        fulfillment_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND payment_status = 'PAID'
        AND fulfillment_provider = ?
        AND fulfillment_order_id = ?
    `
  )
	.bind(
	  status, // DELIVERED guard
	  status, // SHIPPED regression guard
	  status, // new status
	  providerStatus,
      eventId,
      trackingNumber,
      trackingUrl,
      carrier,
      shippedAt,
      deliveredAt,
      fulfilledAt,
      fulfillmentError,
      order.id,
      order.fulfillment_provider,
      order.fulfillment_order_id
    )
    .run();
	if (
	  !updateResult.meta ||
	  Number(updateResult.meta.changes || 0) === 0
	) {
	  throw new Error(
		"Fulfillment reconciliation state update was not applied."
	  );
	}
	if (
	  status === "SHIPPED" &&
	  trackingNumber
	) {
	  await sendShippingConfirmationSafely(
		env,
		order.id
	  );
	}
	if (status === "DELIVERED") {
	  await sendDeliveryConfirmationSafely(
		env,
		order.id
	  );
	}
	if (status === "FAILED") {
		await sendFulfillmentFailureAlertSafely(
		env,
		order.id
	);
	}
	console.log(
	  "FULFILLMENT RECONCILED",
	  {
		orderId:
		  order.id,
		reference:
		  order.order_reference,
		provider:
		  order.fulfillment_provider,
		providerStatus,
		status
	  }
	);

  return {
    ...reconciliation,
    status,
    providerStatus,
    trackingNumber,
    trackingUrl,
    carrier,
    shippedAt,
    deliveredAt,
    fulfilledAt
  };
}
async function detectStaleSubmittingFulfillmentOrders(env) {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        fulfillment_attempts,
        updated_at
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_status = 'SUBMITTING'
        AND fulfillment_order_id IS NULL
        AND updated_at <= datetime('now', '-30 minutes')
      ORDER BY updated_at ASC
      LIMIT 50
    `
  ).all();

  const orders = result.results || [];

  for (const order of orders) {
    console.error(
      "STALE FULFILLMENT SUBMISSION DETECTED",
      {
        orderId: order.id,
        reference: order.order_reference,
        attempts: order.fulfillment_attempts,
        updatedAt: order.updated_at
      }
    );
  }

  return {
    detected: orders.length
  };
}

async function recoverStaleSubmittingFulfillment(
  env,
  orderId
) {
  const order =
    await env.DB.prepare(
      `
        SELECT
          id,
          order_reference,
          payment_status,
          fulfillment_status,
          fulfillment_provider,
          fulfillment_order_id,
          fulfillment_attempts,
          updated_at
        FROM orders
        WHERE id = ?
        LIMIT 1
      `
    )
      .bind(orderId)
      .first();

  if (!order) {
    throw new Error(
      "Order could not be found."
    );
  }

  if (
    order.payment_status !== "PAID" ||
    order.fulfillment_status !==
      "SUBMITTING" ||
    order.fulfillment_order_id
  ) {
    throw new Error(
      "Only PAID SUBMITTING orders without a provider order ID may use stale recovery."
    );
  }

  const staleCheck =
    await env.DB.prepare(
      `
        SELECT id
        FROM orders
        WHERE id = ?
          AND payment_status = 'PAID'
          AND fulfillment_status = 'SUBMITTING'
          AND fulfillment_order_id IS NULL
          AND updated_at <= datetime('now', '-30 minutes')
        LIMIT 1
      `
    )
      .bind(order.id)
      .first();

  if (!staleCheck) {
    throw new Error(
      "Fulfillment submission is not stale."
    );
  }

  const existing =
    await findExistingFulfillmentOrder(
      env,
      order,
      order.fulfillment_provider ||
        "printify"
    );

  /*
   * The ambiguous submission reached the provider.
   * Adopt it instead of submitting another order.
   */
  if (existing) {
    await persistFulfillmentResult(
      env,
      order.id,
      existing,
      ["SUBMITTING"]
    );

    const adoptedOrder = {
      ...order,
      fulfillment_provider:
        existing.provider,
      fulfillment_order_id:
        String(
          existing.providerOrderId
        )
    };

    await reconcileStoredFulfillmentOrder(
      env,
      adoptedOrder
    );

    return {
      action:
        "ADOPTED_EXISTING",
      providerOrderExists: true
    };
  }

  /*
   * Provider lookup found nothing.
   * Move into FAILED recovery instead of
   * automatically retrying fulfillment.
   */
  const failed =
    await env.DB.prepare(
      `
        UPDATE orders
        SET
          fulfillment_status = 'FAILED',
          fulfillment_error =
            'Stale fulfillment submission requires operator recovery.',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND payment_status = 'PAID'
          AND fulfillment_status = 'SUBMITTING'
          AND fulfillment_order_id IS NULL
          AND updated_at <= datetime('now', '-30 minutes')
      `
    )
      .bind(order.id)
      .run();

  if (
    !failed.meta ||
    Number(
      failed.meta.changes || 0
    ) !== 1
  ) {
    throw new Error(
      "Stale fulfillment recovery could not be applied because the order state changed."
    );
  }

  await sendFulfillmentFailureAlertSafely(
    env,
    order.id
  );

  return {
    action:
      "MOVED_TO_FAILED_RECOVERY",
    providerOrderExists: false
  };
}

function getFulfillmentRecoveryCutoff(env) {
  const value = env.FULFILLMENT_RECOVERY_CUTOFF;

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
  ) {
    return null;
  }

  const parsed = new Date(value);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value.replace("Z", ".000Z")
  ) {
    return null;
  }

  return value.replace("T", " ").replace("Z", "");
}

async function recoverPendingFulfillmentOrders(env) {
  const cutoff = getFulfillmentRecoveryCutoff(env);

  if (!cutoff) {
    console.log("PENDING FULFILLMENT RECOVERY DISABLED", {
      reason: "Missing or invalid cutoff"
    });

    return { total: 0, recovered: 0, failed: 0 };
  }

  const result = await env.DB.prepare(
    `
      SELECT id
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_status IN ('PENDING', 'READY')
        AND fulfillment_order_id IS NULL
        AND created_at >= ?
      ORDER BY id ASC
      LIMIT 50
    `
  ).bind(cutoff).all();

  const orders = result.results || [];

  console.log("PENDING FULFILLMENT RECOVERY START", {
    count: orders.length
  });

  let recovered = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await attemptFulfillment(
        env,
        order.id,
        cutoff
      );

      recovered += 1;
    } catch (error) {
      failed += 1;

      console.error(
        "PENDING FULFILLMENT RECOVERY ERROR",
        {
          orderId: order.id,
          message:
            error?.message ||
            String(error)
        }
      );
    }
  }

  console.log("PENDING FULFILLMENT RECOVERY COMPLETE", {
    total: orders.length,
    recovered,
    failed
  });

  return {
    total: orders.length,
    recovered,
    failed
  };
}

async function reconcileActiveFulfillmentOrders(env) {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        order_reference,
        payment_status,
        fulfillment_status,
        fulfillment_provider,
        fulfillment_order_id,
        fulfillment_provider_status,
        fulfillment_last_event_id,
        tracking_number,
        tracking_url,
        carrier,
        shipped_at,
        delivered_at,
        fulfilled_at
      FROM orders
      WHERE payment_status = 'PAID'
        AND fulfillment_provider = 'printify'
        AND fulfillment_order_id IS NOT NULL
        AND fulfillment_status IN (
          'SUBMITTED',
          'ON_HOLD',
          'IN_PRODUCTION',
          'SHIPPED'
        )
      ORDER BY updated_at ASC
      LIMIT 50
    `
  ).all();

  const orders = result.results || [];

  console.log("FULFILLMENT RECONCILIATION START", {
    count: orders.length
  });

  let reconciled = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await reconcileStoredFulfillmentOrder(
        env,
        order
      );

      reconciled += 1;
    } catch (error) {
      failed += 1;

      console.error(
        "FULFILLMENT RECONCILIATION ERROR",
        {
          orderId: order.id,
          reference:
            order.order_reference,
          message:
            error?.message ||
            String(error)
        }
      );
    }
  }

  console.log("FULFILLMENT RECONCILIATION COMPLETE", {
    total: orders.length,
    reconciled,
    failed
  });

  return {
    total: orders.length,
    reconciled,
    failed
  };
}



/* =========================================================
   Fulfillment
   ========================================================= */
async function sendOrderConfirmationSafely(
  env,
  orderId
) {
	
  if (env.APP_ENV === "sandbox") {
    console.log(
      "ORDER CONFIRMATION SUPPRESSED",
      {
        orderId,
        environment: "sandbox"
      }
    );

    return;
  }
  const type =
    NOTIFICATION_TYPES
      .ORDER_CONFIRMATION;

  let claimed = false;

  try {
    const order =
      await env.DB.prepare(
        `
          SELECT
            id,
            order_reference,
			customer_status_token,
            email,
            customer_name,
            shipping_address1,
            shipping_address2,
            shipping_city,
            shipping_state,
            shipping_postal_code,
            shipping_country,
            merchandise_subtotal,
            subtotal,
            shipping_amount,
            tax_amount,
            total,
            currency,
            payment_status
          FROM orders
          WHERE id = ?
          LIMIT 1
        `
      )
        .bind(orderId)
        .first();

    if (!order) {
      throw new Error(
        "Order confirmation order could not be loaded."
      );
    }

    if (
      order.payment_status !==
      "PAID"
    ) {
      console.log(
        "ORDER CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Order is not PAID"
        }
      );

      return;
    }

    claimed =
      await claimOrderNotification(
        env,
        {
          orderId,
          type,
          provider:
            env.EMAIL_PROVIDER ||
            "resend"
        }
      );

    if (!claimed) {
      console.log(
        "ORDER CONFIRMATION SKIPPED",
        {
          orderId,
          reason:
            "Notification already claimed"
        }
      );

      return;
    }

	const itemResult =
	  await env.DB.prepare(
		`
		  SELECT
			id,
			order_id,
			product_id,
			sku,
			product_name,
			color,
			size,
			options_json,
			quantity,
			unit_price
		  FROM order_items
		  WHERE order_id = ?
		  ORDER BY id ASC
		`
	  )
		.bind(orderId)
		.all();

		const items =
		  (itemResult.results || []).map(
			(item) => {
			  let options = {};

			  if (item.options_json) {
				try {
				  options =
					JSON.parse(
					  item.options_json
					);
				} catch (error) {
				console.error(
				  "INVALID ORDER ITEM OPTIONS JSON",
				  {
					orderItemId:
					  item.id,
					message:
					  error?.message ||
					  String(error)
				  }
				);
				}
			  }

			  /*
			   * Backward compatibility
			   * for orders created before
			   * options_json existed.
			   */
			if (
			  Object.keys(options).length === 0
			) {
			  if (item.color) {
				options.color =
				  item.color;
			  }

			  if (item.size) {
				options.size =
				  item.size;
			  }
			}

			  return {
				...item,
				options
			  };
			}
		  );

    if (items.length === 0) {
      throw new Error(
        "Order confirmation has no order items."
      );
    }

    const result =
      await sendOrderConfirmation(
        env,
        order,
        items
      );

    await markNotificationSent(
      env,
      {
        orderId,
        type,
        providerMessageId:
          result?.id || null
      }
    );

    console.log(
      "ORDER CONFIRMATION SENT",
      {
        orderId:
          order.id,
        reference:
          order.order_reference
      }
    );
  } catch (error) {
    if (claimed) {
      try {
        await markNotificationFailed(
          env,
          {
            orderId,
            type,
            error
          }
        );
      } catch (
        notificationError
      ) {
        console.error(
          "NOTIFICATION FAILURE STATE ERROR",
          {
            orderId,
            type,
            message:
              notificationError
                ?.message ||
              String(
                notificationError
              )
          }
        );
      }
    }

    console.error(
      "ORDER CONFIRMATION ERROR",
      {
        orderId,
        message:
          error?.message ||
          String(error)
      }
    );
  }
}
async function persistFulfillmentResult(
  env,
  orderId,
  fulfillment,
  allowedStatuses
) {
  if (!fulfillment) {
    throw new Error(
      "Fulfillment result is required."
    );
  }

  if (!fulfillment.provider) {
    throw new Error(
      "Fulfillment provider is required."
    );
  }

  if (!fulfillment.providerOrderId) {
    throw new Error(
      "Fulfillment provider order ID is required."
    );
  }

  if (
    !Array.isArray(allowedStatuses) ||
    allowedStatuses.length === 0
  ) {
    throw new Error(
      "Allowed fulfillment statuses are required."
    );
  }

  const placeholders =
    allowedStatuses
      .map(() => "?")
      .join(", ");

  const result =
    await env.DB.prepare(
      `
        UPDATE orders
        SET
          fulfillment_provider = ?,
          fulfillment_order_id = ?,
          fulfillment_status = ?,
          fulfillment_provider_status = ?,
          fulfillment_error = NULL,
          fulfillment_reconciled_at = CURRENT_TIMESTAMP,
          tracking_number = COALESCE(?, tracking_number),
          tracking_url = COALESCE(?, tracking_url),
          carrier = COALESCE(?, carrier),
          shipped_at = COALESCE(?, shipped_at),
          delivered_at = COALESCE(?, delivered_at),
          fulfilled_at = COALESCE(?, fulfilled_at),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND payment_status = 'PAID'
          AND fulfillment_status IN (${placeholders})
      `
    )
      .bind(
        fulfillment.provider,
        String(
          fulfillment.providerOrderId
        ),
        fulfillment.status ||
          "SUBMITTED",
        fulfillment.providerStatus ||
          null,
        fulfillment.trackingNumber ||
          null,
        fulfillment.trackingUrl ||
          null,
        fulfillment.carrier ||
          null,
        fulfillment.shippedAt ||
          null,
        fulfillment.deliveredAt ||
          null,
        fulfillment.fulfilledAt ||
          null,
        orderId,
        ...allowedStatuses
      )
      .run();

  if (
    !result.meta ||
    Number(
      result.meta.changes || 0
    ) !== 1
  ) {
    throw new Error(
      "Fulfillment result could not be persisted because the order state changed."
    );
  }

  return result;
}
async function attemptFulfillment(env, orderId, recoveryCutoff = null) {
  if (env.APP_ENV !== "production" || env.PAYMENT_ENV !== "production") {
    console.log(
      "FULFILLMENT SUPPRESSED",
      {
        orderId,
        environment: "sandbox"
      }
    );

    return;
  }

  const recoveryClause = recoveryCutoff === null ? "" : "AND created_at >= ?";
  const claimSql = [
    "UPDATE orders",
    "SET fulfillment_status = 'SUBMITTING',",
    "fulfillment_attempts = fulfillment_attempts + 1,",
    "fulfillment_error = NULL,",
    "updated_at = CURRENT_TIMESTAMP",
    "WHERE id = ?",
    "AND payment_status = 'PAID'",
    "AND fulfillment_status IN ('PENDING', 'READY')",
    "AND fulfillment_order_id IS NULL",
    recoveryClause
  ].join(" ");
  const claim = await env.DB.prepare(claimSql)
    .bind(...(recoveryCutoff === null ? [orderId] : [orderId, recoveryCutoff]))
    .run();

  if (
    !claim.meta ||
    Number(claim.meta.changes || 0) === 0
  ) {
    console.log(
      "FULFILLMENT NOT CLAIMED",
      { orderId }
    );

    return;
  }

  console.log(
    "FULFILLMENT CLAIMED",
    { orderId }
  );

  try {
    const order = await env.DB.prepare(
      `
        SELECT
          id,
          order_reference,
          email,
          customer_name,
          phone,
          shipping_address1,
          shipping_address2,
          shipping_city,
          shipping_state,
          shipping_postal_code,
          shipping_country,
          merchandise_subtotal,
          shipping_amount,
          tax_amount,
          total,
          currency,
          payment_status,
          transaction_id,
          fulfillment_status
        FROM orders
        WHERE id = ?
        LIMIT 1
      `
    )
      .bind(orderId)
      .first();

    if (!order) {
      throw new Error(
        "Fulfillment order could not be loaded."
      );
    }

    const itemResult = await env.DB.prepare(
      `
        SELECT
          id,
          order_id,
          product_id,
          sku,
          product_name,
          color,
          size,
          quantity,
          unit_price
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `
    )
      .bind(orderId)
      .all();

    const orderItems =
      itemResult.results || [];

    if (orderItems.length === 0) {
      throw new Error(
        "Order has no fulfillment items."
      );
    }

    console.log(
      "SUBMITTING ORDER TO FULFILLMENT",
      {
        orderId: order.id,
        reference:
          order.order_reference,
        itemCount:
          orderItems.length
      }
    );

    const fulfillment =
      await fulfillOrder(
        env,
        order,
        orderItems
      );

	const providerOrderId =
	  fulfillment?.providerOrderId;

    if (!providerOrderId) {
      throw new Error(
        "Fulfillment provider did not return an order ID."
      );
    }

	await persistFulfillmentResult(
	  env,
	  orderId,
	  fulfillment,
	  ["SUBMITTING"]
	);

    console.log(
      "FULFILLMENT ORDER CREATED",
      {
        orderId:
          order.id,

        reference:
          order.order_reference,

        provider:
          fulfillment.provider,

        status:
          fulfillment.status ||
          "SUBMITTED",

		providerStatus:
		  fulfillment.providerStatus ||
		  null
      }
    );
  } catch (error) {
    console.error(
      "FULFILLMENT ERROR",
      {
        orderId,
        message:
          error?.message ||
          String(error)
      }
    );

    const errorMessage =
      String(
        error?.message ||
        "Unknown fulfillment error."
      ).slice(0, 1000);

	await env.DB.prepare(
	  `
		UPDATE orders
		SET
		  fulfillment_status = 'FAILED',
		  fulfillment_error = ?,
		  updated_at = CURRENT_TIMESTAMP
		  WHERE id = ?
			AND payment_status = 'PAID'
			AND fulfillment_status = 'SUBMITTING'
	  `
	)
	  .bind(errorMessage, orderId)
	  .run();

	await sendFulfillmentFailureAlertSafely(
	  env,
	  orderId
	);

  }
}

async function recoverFailedFulfillment(
  env,
  orderId,
  authorizeRetry = false
) {
  const order =
    await env.DB.prepare(
      `
        SELECT
          id,
          order_reference,
          payment_status,
          fulfillment_status,
          fulfillment_provider,
          fulfillment_order_id
        FROM orders
        WHERE id = ?
        LIMIT 1
      `
    )
      .bind(orderId)
      .first();

  if (!order) {
    throw new Error(
      "Order could not be found."
    );
  }

  if (
    order.payment_status !== "PAID" ||
    order.fulfillment_status !== "FAILED"
  ) {
    throw new Error(
      "Only PAID orders in FAILED fulfillment status may be recovered."
    );
  }

  /*
   * If a provider order ID is already stored,
   * never authorize another submission.
   */
	if (order.fulfillment_order_id) {
	  await reconcileStoredFulfillmentOrder(
		env,
		order
	  );

	  return {
		action: "RECONCILED_EXISTING",
		providerOrderExists: true
	  };
	}

  const existing =
    await findExistingFulfillmentOrder(
      env,
      order,
      order.fulfillment_provider ||
        "printify"
    );

  /*
   * The original submission reached the provider.
   * Adopt that existing provider order instead of
   * creating another one.
   */
	if (existing) {
	  await persistFulfillmentResult(
		env,
		order.id,
		existing,
		["FAILED"]
	  );

	  const adoptedOrder = {
		...order,
		fulfillment_provider:
		  existing.provider,
		fulfillment_order_id:
		  String(
			existing.providerOrderId
		  )
	  };

	  await reconcileStoredFulfillmentOrder(
		env,
		adoptedOrder
	  );

	  return {
		action: "ADOPTED_EXISTING",
		providerOrderExists: true
	  };
	}

  /*
   * No provider order was discovered.
   * Discovery alone NEVER authorizes retry.
   */
  if (!authorizeRetry) {
    return {
      action: "RETRY_REQUIRES_AUTHORIZATION",
      providerOrderExists: false
    };
  }

  /*
   * Explicit operator authorization:
   * FAILED -> READY only if the order has not
   * changed since it was inspected.
   */
  const retry =
    await env.DB.prepare(
      `
        UPDATE orders
        SET
          fulfillment_status = 'READY',
          fulfillment_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND payment_status = 'PAID'
          AND fulfillment_status = 'FAILED'
          AND fulfillment_order_id IS NULL
      `
    )
      .bind(order.id)
      .run();

  if (
    !retry.meta ||
    Number(
      retry.meta.changes || 0
    ) !== 1
  ) {
    throw new Error(
      "Fulfillment retry could not be authorized because the order state changed."
    );
  }

  return {
    action: "RETRY_AUTHORIZED",
    providerOrderExists: false
  };
}


/* =========================================================
   Printify Webhook Handler
   ========================================================= */

async function handlePrintifyWebhook(
  request,
  env
) {
  if (env.APP_ENV === "sandbox") {
    console.log(
      "PRINTIFY WEBHOOK SUPPRESSED",
      {
        environment: "sandbox"
      }
    );

    return Response.json(
      {
        received: true,
        suppressed: true
      },
      {
        status: 200
      }
    );
  }
  const rawBody =
    await request.text();

  const signature =
    request.headers.get(
      "X-Pfy-Signature"
    );

  const validSignature =
    await verifyPrintifyWebhookSignature(
      env,
      rawBody,
      signature
    );

  if (!validSignature) {
    console.error(
      "PRINTIFY WEBHOOK SIGNATURE REJECTED"
    );

    return Response.json(
      {
        error:
          "Invalid webhook signature."
      },
      {
        status: 401
      }
    );
  }

  let payload;

  try {
    payload =
      JSON.parse(rawBody);
  } catch {
    return Response.json(
      {
        error:
          "Invalid webhook JSON."
      },
      {
        status: 400
      }
    );
  }

  const eventId =
    cleanString(
      payload?.id,
      200
    );

  const eventType =
    cleanString(
      payload?.type,
      100
    );

  const resourceType =
    cleanString(
      payload?.resource?.type,
      50
    );

  const providerOrderId =
    cleanString(
      payload?.resource?.id,
      200
    );

  const webhookShopId =
    String(
      payload?.resource?.data
        ?.shop_id ?? ""
    ).trim();

  console.log(
    "PRINTIFY WEBHOOK RECEIVED",
    {
      eventId:
        eventId || null,

      eventType:
        eventType || null,

      resourceType:
        resourceType || null
    }
  );

  if (
    !eventId ||
    !eventType ||
    !providerOrderId
  ) {
	console.error(
	  "PRINTIFY WEBHOOK INCOMPLETE",
	  {
		eventId:
		  eventId || null,
		eventType:
		  eventType || null,
		providerOrderIdPresent:
		  Boolean(providerOrderId)
	  }
	);

    return Response.json(
      {
        error:
          "Incomplete webhook payload."
      },
      {
        status: 400
      }
    );
  }

  if (
    !PRINTIFY_WEBHOOK_EVENTS.has(
      eventType
    )
  ) {
    console.log(
      "PRINTIFY WEBHOOK EVENT IGNORED",
      {
        eventId,
        eventType
      }
    );

    return Response.json(
      {
        received: true,
        ignored: true
      },
      {
        status: 200
      }
    );
  }

  if (
    resourceType &&
    resourceType !== "order"
  ) {
    console.log(
      "PRINTIFY NON-ORDER WEBHOOK IGNORED",
      {
        eventId,
        eventType,
        resourceType
      }
    );

    return Response.json(
      {
        received: true,
        ignored: true
      },
      {
        status: 200
      }
    );
  }

  if (
    webhookShopId &&
    String(
      env.PRINTIFY_SHOP_ID || ""
    ) !== webhookShopId
  ) {
    console.error(
      "PRINTIFY WEBHOOK SHOP MISMATCH",
      {
        eventId,
		eventType
      }
    );

    return Response.json(
      {
        error:
          "Webhook shop mismatch."
      },
      {
        status: 403
      }
    );
  }

  const order =
    await loadFulfillmentOrderByProviderId(
      env,
      "printify",
      providerOrderId
    );

  /*
   * A valid Printify event may arrive before our
   * asynchronous fulfillment write has committed
   * fulfillment_order_id to D1.
   *
   * Returning 200 prevents Printify from treating
   * that timing condition as a broken webhook.
   * Our fallback reconciliation mechanism can
   * recover the authoritative provider state later.
   */
  if (!order) {
    console.log(
      "PRINTIFY WEBHOOK ORDER NOT FOUND",
      {
        eventId,
        eventType
      }
    );

    return Response.json(
      {
        received: true,
        orderFound: false
      },
      {
        status: 200
      }
    );
  }

  const eventClaim =
  await env.DB.prepare(
    `
      INSERT OR IGNORE INTO fulfillment_webhook_events (
        provider,
        event_id,
        event_type,
        order_id
      )
      VALUES (?, ?, ?, ?)
    `
  )
    .bind(
      "printify",
      eventId,
      eventType,
      order.id
    )
    .run();

if (
  Number(eventClaim.meta.changes || 0) === 0
) {
  console.log(
    "PRINTIFY WEBHOOK DUPLICATE",
    {
      eventId,
      eventType,
      orderId:
        order.id
    }
  );

  return Response.json(
    {
      received: true,
      duplicate: true
    },
    {
      status: 200
    }
  );
}

  try {
    const reconciliation =
      await reconcileStoredFulfillmentOrder(
        env,
        order,
        {
          eventId,
          eventPayload:
            payload
        }
      );

    console.log(
      "PRINTIFY WEBHOOK PROCESSED",
      {
        eventId,
        eventType,
        orderId:
          order.id,
        reference:
          order.order_reference,
        status:
          reconciliation.status,
        providerStatus:
          reconciliation
            .providerStatus ||
          null
      }
    );

    return Response.json(
      {
        received: true,
        reconciled: true
      },
      {
        status: 200
      }
    );
  } catch (error) {
  try {
    await env.DB.prepare(
      `
        DELETE FROM fulfillment_webhook_events
        WHERE provider = ?
          AND event_id = ?
          AND order_id = ?
      `
    )
      .bind(
        "printify",
        eventId,
        order.id
      )
      .run();
  } catch (releaseError) {
    console.error(
      "PRINTIFY WEBHOOK CLAIM RELEASE ERROR",
      {
        eventId,
        eventType,
        orderId:
          order.id,
        message:
          releaseError?.message ||
          String(releaseError)
      }
    );
  }

  console.error(
    "PRINTIFY WEBHOOK RECONCILIATION ERROR",
    {
      eventId,
      eventType,
      orderId:
        order.id,
      message:
        error?.message ||
        String(error)
    }
  );

  /*
   * A temporary reconciliation/API failure should
   * return 500 so Printify can retry delivery.
   */
  return Response.json(
    {
      error:
        "Fulfillment reconciliation failed."
    },
    {
      status: 500
    }
  );
}

}

/* =========================================================
   Worker
   ========================================================= */

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url = new URL(request.url);
	const storeConfig = getStoreConfig(env);

	const corsHeaders = {
	  "Access-Control-Allow-Origin":
		storeConfig.storefrontOrigin,

	  "Access-Control-Allow-Methods":
		"GET, POST, OPTIONS",

	  "Access-Control-Allow-Headers":
		"Content-Type"
	};

    /* =====================================================
       PRINTIFY WEBHOOK

       This route is intentionally checked BEFORE the
       browser-facing CORS handling. Printify is a
       server-to-server caller and does not require CORS.
       ===================================================== */

    if (
      request.method === "POST" &&
      url.pathname ===
        "/api/webhooks/printify"
    ) {
      return handlePrintifyWebhook(
        request,
        env
      );
    }

    /* =====================================================
       CORS
       ===================================================== */

    if (request.method === "POST" && url.pathname === "/api/webhooks/global-payments") { return handleGlobalPaymentsWebhook(request, env); }

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders
        }
      );
    }


    /* =====================================================
       HEALTH CHECK
       ===================================================== */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse(
        {
          status: "ok",
          service:
            "jekyll-commerce-api"
        },
        200,
        corsHeaders
      );
    }

    /* =====================================================
       CHECKOUT
       ===================================================== */

    if (
      request.method === "POST" &&
      url.pathname ===
        "/api/checkout"
    ) {
	try {
	  let body;

	  try {
		body =
		  await request.json();
	  } catch (error) {
		return jsonResponse(
		  {
			error:
			  "INVALID_CHECKOUT_REQUEST",

			message:
			  "The checkout request contains invalid JSON."
		  },
		  400,
		  corsHeaders
		);
	  }

        /* -----------------------------------------------
           Email
           ----------------------------------------------- */

        const email =
          cleanString(
            body.email,
            254
          );

        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailPattern.test(email)
        ) {
          return jsonResponse(
            {
              error:
                "A valid email address is required."
            },
            400,
            corsHeaders
          );
        }

        /* -----------------------------------------------
           Customer
           ----------------------------------------------- */

        const customer =
          body.customer &&
          typeof body.customer ===
            "object"
            ? body.customer
            : {};

        const shipping =
          customer.shipping &&
          typeof customer.shipping ===
            "object"
            ? customer.shipping
            : {};

        const customerName =
          cleanString(
            customer.name,
            120
          );

        const phone =
          cleanString(
            customer.phone,
            40
          );

        const address1 =
          cleanString(
            shipping.address1,
            160
          );

        const address2 =
          cleanString(
            shipping.address2,
            160
          );

        const city =
          cleanString(
            shipping.city,
            100
          );

        const state =
          cleanString(
            shipping.state,
            2
          ).toUpperCase();

        const postalCode =
          cleanString(
            shipping.postalCode,
            10
          );

        const country =
          cleanString(
            shipping.country,
            2
          ).toUpperCase();

        const zipPattern =
          /^\d{5}(-\d{4})?$/;

        const statePattern =
          /^[A-Z]{2}$/;

        if (!customerName) {
          return jsonResponse(
            {
              error:
                "Customer name is required."
            },
            400,
            corsHeaders
          );
        }

        if (!address1) {
          return jsonResponse(
            {
              error:
                "Shipping address is required."
            },
            400,
            corsHeaders
          );
        }

        if (!city) {
          return jsonResponse(
            {
              error:
                "Shipping city is required."
            },
            400,
            corsHeaders
          );
        }

        if (
          !statePattern.test(state)
        ) {
          return jsonResponse(
            {
              error:
                "A valid shipping state is required."
            },
            400,
            corsHeaders
          );
        }

        if (
          !zipPattern.test(
            postalCode
          )
        ) {
          return jsonResponse(
            {
              error:
                "A valid ZIP code is required."
            },
            400,
            corsHeaders
          );
        }

        if (country !== "US") {
          return jsonResponse(
            {
              error:
                "Only United States shipping is currently supported."
            },
            400,
            corsHeaders
          );
        }
        /* -----------------------------------------------
           Cart
           ----------------------------------------------- */

        const items =
          Array.isArray(body.items)
            ? body.items
            : [];

        if (items.length === 0) {
          return jsonResponse(
            {
              error:
                "Cart is empty."
            },
            400,
            corsHeaders
          );
        }

        let merchandiseSubtotal = 0;

        const validatedItems = [];

        for (const item of items) {
          const product =
            products[item.sku];

          if (!product) {
            return jsonResponse(
              {
                error:
                  `Invalid SKU: ${item.sku}`
              },
              400,
              corsHeaders
            );
          }

          if (
            product.productId !==
            item.productId
          ) {
            return jsonResponse(
              {
                error:
                  "Product ID does not match SKU."
              },
              400,
              corsHeaders
            );
          }

          const quantity =
            Number(item.quantity);

          if (
            !Number.isInteger(
              quantity
            ) ||
            quantity < 1 ||
            quantity > storeConfig.maxQuantity
          ) {
            return jsonResponse(
              {
                error:
                  "Invalid quantity."
              },
              400,
              corsHeaders
            );
          }

          merchandiseSubtotal +=
            product.price *
            quantity;

          validatedItems.push({
            productId:
              product.productId,

            sku:
              item.sku,

            quantity,

            unitPrice:
              product.price,

            name:
              product.name,

            taxCode:
              product.taxCode ||
              null
          });
        }

        /* -----------------------------------------------
           Shipping Quote
           ----------------------------------------------- */

        const shippingCustomer = {
          name:
            customerName,

          email,

          phone,

          address1,

          address2,

          city,

          state,

          postalCode,

          country
        };

        const shippingQuote =
          await calculateShipping(
            env,
            shippingCustomer,
            validatedItems
          );

        const shippingAmount =
          Number(
            shippingQuote.amount
          );

        if (
          !Number.isInteger(
            shippingAmount
          ) ||
          shippingAmount < 0
        ) {
          throw new Error(
            "Invalid shipping amount."
          );
        }

        /* -----------------------------------------------
           Tax
           ----------------------------------------------- */

        const taxQuote =
          await calculateFloridaTax(
            env,
            {
              shipping:
                shippingCustomer,

              merchandiseSubtotal,

              shippingAmount
            }
          );

        const taxAmount =
          Number(
            taxQuote.taxAmount
          );

        if (
          !Number.isInteger(
            taxAmount
          ) ||
          taxAmount < 0
        ) {
          throw new Error(
            "Invalid tax amount."
          );
        }

        const total =
          merchandiseSubtotal +
          shippingAmount +
          taxAmount;

        const displayTaxRate =
          Number(
            Number(
              taxQuote.combinedRate ||
              0
            ).toFixed(6)
          );

        console.log(
          "FLORIDA TAX RESULT",
          {
            taxable:
              taxQuote.taxable,

            county:
              taxQuote
                .jurisdiction
                ?.countyName ||
              null,

            taxableBase:
              taxQuote.taxableBase,

            stateRate:
              taxQuote.stateRate,

            surtaxRate:
              taxQuote.surtaxRate,

            stateTaxAmount:
              taxQuote
                .stateTaxAmount,

            surtaxAmount:
              taxQuote.surtaxAmount,

            taxAmount:
              taxQuote.taxAmount
          }
        );

        console.log(
          "CHECKOUT TOTALS",
          {
            merchandiseSubtotal,

            shippingAmount,

            taxAmount,

            total,

            shippingProvider:
              shippingQuote.provider,

            shippingMethod:
              shippingQuote.method,

            taxProvider:
              "florida-dor",

            taxRate:
              displayTaxRate,

            taxCounty:
              taxQuote
                .jurisdiction
                ?.countyName ||
              null
          }
        );

        /* -----------------------------------------------
           Order + Order Items

           D1 batch() is transactional. The order row,
           every order-item row, and the final ID lookup
           succeed together or the entire batch rolls back.
           ----------------------------------------------- */

        const reference =
          `order-${crypto.randomUUID()}`;

		console.log(
		  "CREATING ORDER",
		  {
			reference,
			merchandiseSubtotal,
			shippingAmount,
			taxAmount,
			total
		  }
		);

			const {
			  orderId,
			  customerStatusToken
			} =
			  await createOrderWithItems(
            env,
            {
              reference,

              email,

              customerName,

              address1,

              address2,

              city,

              state,

              postalCode,

              country,

              phone,
			  
			  currency:storeConfig.currency,

              merchandiseSubtotal,

              shippingAmount,

              taxAmount,

              total
            },
            validatedItems
          );

        console.log(
          "D1 ORDER CREATED",
          {
            orderId,

            reference,

            itemCount:
              validatedItems.length
          }
        );

        /* -----------------------------------------------
           Global Payments HPP
           ----------------------------------------------- */

		const hpp =
		  await createHostedPaymentPage(
			env,
			{
			  amount:
				total,

			  currency:
				storeConfig.currency,

			  reference,

			  email,

			  customerName,

			  paymentReturnUrl:
				storeConfig.paymentReturnUrl
			}
		  );

        if (!hpp?.url) {
          return jsonResponse(
            {
              error:
                "Checkout URL was not returned."
            },
            502,
            corsHeaders
          );
        }

			return jsonResponse(
			  {
				checkoutUrl:
				  hpp.url,

				orderReference:
				  reference,

				statusToken:
				  customerStatusToken,

				totals: {
              merchandiseSubtotal,

              shippingAmount,

              taxAmount,

              total
            }
          },
          200,
          corsHeaders
        );
} catch (error) {
		console.error(
		  "CHECKOUT ERROR",
		  {
			message:
			  error?.message ||
			  String(error)
		  }
		);

		  const errorMessage =
			error?.message ||
			String(error);

		  let status = 500;

		  let code =
			"CHECKOUT_UNAVAILABLE";

		  let message =
			"Checkout is temporarily unavailable. Please try again.";

		  /*
		   * The selected SKU exists in the
		   * catalog but cannot currently be
		   * fulfilled.
		   */
		  if (
			errorMessage.includes(
			  "No shipping mapping exists for SKU"
			)
		  ) {
			status = 400;

			code =
			  "VARIANT_UNAVAILABLE";

			message =
			  "This product option is currently unavailable. Please choose another option.";
		  }

		  return jsonResponse(
			{
			  error: code,
			  message
			},
			status,
			corsHeaders
		  );
		}
    }
/* =========================================================
   Sandbox Printify Catalog Diagnostic
   ========================================================= */

    if (request.method === "GET" && url.pathname === "/api/debug/printify-products") {
      if (env.APP_ENV !== "sandbox") return new Response("Not Found", { status: 404 });
      try {
        const products = await listPrintifyProducts(env);
        return jsonResponse({ products }, 200, corsHeaders);
      } catch (error) {
        console.error("PRINTIFY PRODUCT DIAGNOSTIC ERROR", { message: error?.message || String(error) });
        return jsonResponse({ error: "PRINTIFY_PRODUCT_LOOKUP_FAILED", message: "Unable to retrieve Printify products." }, 500, corsHeaders);
      }
    }

/* =========================================================
   Customer Order Status
   ========================================================= */

	if (
	  request.method === "GET" &&
	  url.pathname ===
		"/api/order-status"
	) {
	  try {
		const token =
		  url.searchParams.get(
			"token"
		  );

		/*
		 * Do not reveal whether an
		 * order exists unless a valid
		 * status token was supplied.
		 */
		if (
		  !token ||
		  token.length < 32 ||
		  token.length > 200
		) {
		  return new Response(
			JSON.stringify({
			  error:
				"ORDER_NOT_FOUND",
			  message:
				"Order status could not be found."
			}),
			{
			  status: 404,
			  headers: {
				...corsHeaders,
				"Content-Type":
				  "application/json; charset=UTF-8",
				"Cache-Control":
				  "no-store"
			  }
			}
		  );
		}

		const order =
		  await env.DB.prepare(
			`
			  SELECT
				id,
				order_reference,
				payment_status,
				fulfillment_status,
				merchandise_subtotal,
				shipping_amount,
				tax_amount,
				total,
				currency,
				tracking_number,
				tracking_url,
				carrier,
				shipped_at,
				delivered_at,
				created_at,
				updated_at
			  FROM orders
			  WHERE customer_status_token = ?
			  LIMIT 1
			`
		  )
			.bind(token)
			.first();

		/*
		 * Return the same response for
		 * an unknown token so the API
		 * does not expose order existence.
		 */
		if (!order) {
		  return new Response(
			JSON.stringify({
			  error:
				"ORDER_NOT_FOUND",
			  message:
				"Order status could not be found."
			}),
			{
			  status: 404,
			  headers: {
				...corsHeaders,
				"Content-Type":
				  "application/json; charset=UTF-8",
				"Cache-Control":
				  "no-store"
			  }
			}
		  );
		}

		const itemResult =
		  await env.DB.prepare(
			`
			  SELECT
				product_name,
				sku,
				quantity,
				unit_price,
				options_json
			  FROM order_items
			  WHERE order_id = ?
			  ORDER BY id ASC
			`
		  )
			.bind(order.id)
			.all();

		const items =
		  (
			itemResult.results ||
			[]
		  ).map((item) => {
			let options = {};

			if (item.options_json) {
			  try {
				options =
				  JSON.parse(
					item.options_json
				  );
			  } catch (error) {
				console.error(
				  "INVALID ORDER STATUS ITEM OPTIONS",
				  {
					sku:
					  item.sku,
					message:
					  error?.message ||
					  String(error)
				  }
				);
			  }
			}

			return {
			  name:
				item.product_name,

			  sku:
				item.sku,

			  quantity:
				item.quantity,

			  unitPrice:
				item.unit_price,

			  options
			};
		  });

		const responseBody = {
		  orderReference:
			order.order_reference,

		  paymentStatus:
			order.payment_status,

		  fulfillmentStatus:
			order.fulfillment_status,

		  totals: {
			merchandise:
			  order.merchandise_subtotal,

			shipping:
			  order.shipping_amount,

			tax:
			  order.tax_amount,

			total:
			  order.total,

			currency:
			  order.currency
		  },

		  items,

		  tracking: {
			carrier:
			  order.carrier ||
			  null,

			number:
			  order.tracking_number ||
			  null,

			url:
			  order.tracking_url ||
			  null
		  },

		  dates: {
			created:
			  order.created_at ||
			  null,

			updated:
			  order.updated_at ||
			  null,

			shipped:
			  order.shipped_at ||
			  null,

			delivered:
			  order.delivered_at ||
			  null
		  }
		};

		return new Response(
		  JSON.stringify(
			responseBody
		  ),
		  {
			status: 200,
			headers: {
			  ...corsHeaders,
			  "Content-Type":
				"application/json; charset=UTF-8",

			  /*
			   * Status URLs contain a
			   * capability token, so do
			   * not allow intermediary
			   * caching.
			   */
			  "Cache-Control":
				"no-store"
			}
		  }
		);
	  } catch (error) {
		console.error(
		  "ORDER STATUS ERROR",
		  {
			message:
			  error?.message ||
			  String(error)
		  }
		);

		return new Response(
		  JSON.stringify({
			error:
			  "ORDER_STATUS_UNAVAILABLE",

			message:
			  "Order status is temporarily unavailable. Please try again."
		  }),
		  {
			status: 500,
			headers: {
			  ...corsHeaders,
			  "Content-Type":
				"application/json; charset=UTF-8",
			  "Cache-Control":
				"no-store"
			}
		  }
		);
	  }
	}
    /* =====================================================
       PAYMENT RETURN
       ===================================================== */

    if (
      url.pathname ===
        "/api/payment-return"
    ) {
      const queryReference =
        url.searchParams.get(
          "reference"
        );

      /* -------------------------------------------------
         POST â€” Global Payments result
         ------------------------------------------------- */

      if (
        request.method === "POST"
      ) {
        try {
          const callback =
            await request.json();

			if (
			  !callback.id ||
			  !callback.reference ||
			  !queryReference
			) throw new Error(
              "Incomplete payment callback."
            );
          

          if (
            queryReference !==
            callback.reference
          ) {
            throw new Error(
              "Callback reference mismatch."
            );
          }

          const order =
            await env.DB.prepare(
              `
				SELECT
				  id,
				  order_reference,
				  customer_status_token,
				  merchandise_subtotal,
				  shipping_amount,
				  tax_amount,
				  total,
				  currency,
				  payment_status,
				  transaction_id,
				  fulfillment_status
				FROM orders
                WHERE order_reference = ?
                LIMIT 1
              `
            )
              .bind(
                callback.reference
              )
              .first();

          if (!order) {
            throw new Error(
              "Order not found."
            );
          }

        
		const verifiedTransaction =
		  await verifyTransactionByReference(
			env,
			order.order_reference,
			callback.id
		  );

		if (!verifiedTransaction) {
		  throw new Error(
			"Payment transaction could not be verified."
		  );
		}

/*
 * From this point forward, payment facts come from the
 * authenticated Global Payments API response, not from
 * the public callback payload.
 */
	const idPresent =
	  Boolean(
		verifiedTransaction.id
	  );

	const referenceMatches =
	  verifiedTransaction.reference ===
	  order.order_reference;

	const amountMatches =
	  Number(
		verifiedTransaction.amount
	  ) ===
	  Number(order.total);

	const currencyMatches =
	  verifiedTransaction.currency ===
	  order.currency;

	const paymentCaptured =
	  verifiedTransaction.status ===
	  "CAPTURED";

	const paymentDeclined =
	  verifiedTransaction.status ===
	  "DECLINED";

	const paymentReversed =
	  verifiedTransaction.status ===
	  "REVERSED";

		console.log(
		  "HPP PAYMENT VALIDATION",
		  {
			orderId: order.id,
			idPresent,
			referenceMatches,
			amountMatches,
			currencyMatches,
			paymentCaptured,
			paymentDeclined,
			paymentReversed
		  }
		);

          const cardVerification =
            evaluateCardVerification(
              verifiedTransaction
            );

          console.log(
            "CARD VERIFICATION",
            {
              orderId:
                order.id,

              cvvResult:
                cardVerification
                  .cvvResult,

              avsAddressResult:
                cardVerification
                  .avsAddressResult,

              avsPostalResult:
                cardVerification
                  .avsPostalResult,

              avsAction:
                cardVerification
                  .avsAction,

              explicitMismatch:
                cardVerification
                  .explicitMismatch
            }
          );

		  const capturedPaymentAction =
		  decideCapturedPaymentAction({
			idPresent,
			referenceMatches,
			amountMatches,
			currencyMatches,
			paymentCaptured,

			explicitCardMismatch:
			  cardVerification
				.explicitMismatch
		  });

			if (
			  capturedPaymentAction ===
			  "REVERSE"
			) {
            console.error(
              "CARD VERIFICATION MISMATCH",
              {
                orderId:
                  order.id,

                cvvMismatch:
                  cardVerification
                    .cvvMismatch,

                avsMismatch:
                  cardVerification
                    .avsMismatch
              }
            );

            try {
              await reverseTransaction(
                env,
                {
                  transactionId:
                    verifiedTransaction.id,

                  reference:
                    order.order_reference
                }
              );
            } catch (error) {
              console.error(
                "PAYMENT REVERSAL FAILED AFTER CARD VERIFICATION MISMATCH",
                {
                  orderId:
                    order.id,

                  message:
                    error?.message ||
                    String(error)
                }
              );

              /*
               * Leave the order PENDING.
               * A captured payment that could not be reversed
               * must never be marked PAID automatically.
               */
              return paymentRedirect(
                storeConfig.failedUrl
              );
            }

            const failedUpdate =
              await env.DB.prepare(
                `
                  UPDATE orders
                  SET
                    payment_status = 'FAILED',
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                    AND payment_status = 'PENDING'
                    AND transaction_id IS NULL
                `
              )
                .bind(
                  order.id
                )
                .run();

            console.log(
              "PAYMENT REVERSED AFTER CARD VERIFICATION MISMATCH",
              {
                orderId:
                  order.id,

                failedChanges:
                  Number(
                    failedUpdate.meta
                      ?.changes ||
                    0
                  )
              }
            );

            return paymentRedirect(
              storeConfig.failedUrl
            );
          }
          /* ---------------------------------------------
             Captured
             --------------------------------------------- */

          if (capturedPaymentAction === "MARK_PAID") {
            const paidUpdate =
              await env.DB.prepare(
                `
                  UPDATE orders
                  SET
                    payment_status = 'PAID',
                    transaction_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                    AND payment_status = 'PENDING'
                    AND transaction_id IS NULL
                `
              )
				.bind(
				  verifiedTransaction.id,
				  order.id
				)
                .run();

            const paidChanges =
              Number(
                paidUpdate.meta
                  ?.changes ||
                0
              );

            if (
              paidChanges === 0
            ) {
              const currentState =
                await loadPaymentState(
                  env,
                  order.id
                );

              if (
                currentState
                  ?.payment_status ===
                  "PAID" &&
				currentState
				  ?.transaction_id ===
				  verifiedTransaction.id
              ) {
                console.log(
                  "DUPLICATE CAPTURE ACCEPTED",
                  {
                    orderId:
                      order.id
                  }
                );

                if (
                  ctx?.waitUntil
                ) {
                  ctx.waitUntil(
                    attemptFulfillment(
                      env,
                      order.id
                    )
                  );
                } else {
                  await attemptFulfillment(
                    env,
                    order.id
                  );
                }
				const successUrl =
				  new URL(
					storeConfig.successUrl
				  );

				successUrl.searchParams.set(
				  "order",
				  order.order_reference
				);

				if (
				  order.customer_status_token
				) {
				  successUrl.searchParams.set(
					"token",
					order.customer_status_token
				  );
				}

				return paymentRedirect(
				  successUrl.toString()
				);
							  }

              console.error(
                "PAYMENT STATE CONFLICT",
                {
                  orderId:
                    order.id,

                  currentPaymentStatus:
                    currentState
                      ?.payment_status ||
                    null
                }
              );

              return paymentRedirect(
                storeConfig.failedUrl
              );
            }

            console.log(
              "ORDER MARKED PAID",
              {
                orderId:
                  order.id,

                reference:
                  order
                    .order_reference,

                total:
                  order.total
              }
            );

			if (ctx?.waitUntil) {
			  ctx.waitUntil(
				attemptFulfillment(
				  env,
				  order.id
				)
			  );

			  ctx.waitUntil(
				sendOrderConfirmationSafely(
				  env,
				  order.id
				)
			  );
			} else {
			  await Promise.allSettled([
				attemptFulfillment(
				  env,
				  order.id
				),
				sendOrderConfirmationSafely(
				  env,
				  order.id
				)
			  ]);
			}

			const successUrl =
			  new URL(
				storeConfig.successUrl
			  );

			successUrl.searchParams.set(
			  "order",
			  order.order_reference
			);

			if (
			  order.customer_status_token
			) {
			  successUrl.searchParams.set(
				"token",
				order.customer_status_token
			  );
			}

			return paymentRedirect(
			  successUrl.toString()
			);
          }		
          /* ---------------------------------------------
             Declined
             --------------------------------------------- */

          if (
            idPresent &&
            referenceMatches &&
            amountMatches &&
            currencyMatches &&
              (
				paymentDeclined ||
				paymentReversed
			  )
          ) {
            const failedUpdate =
              await env.DB.prepare(
                `
                  UPDATE orders
                  SET
                    payment_status = 'FAILED',
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                    AND payment_status = 'PENDING'
                    AND transaction_id IS NULL
                `
              )
                .bind(
                  order.id
                )
                .run();

            const failedChanges =
              Number(
                failedUpdate.meta
                  ?.changes ||
                0
              );

            if (
              failedChanges === 0
            ) {
              const currentState =
                await loadPaymentState(
                  env,
                  order.id
                );

              if (
                currentState
                  ?.payment_status ===
                "PAID"
              ) {
			console.log(
			  "FAILED PAYMENT RESULT IGNORED FOR PAID ORDER",
			  {
				orderId: order.id
			  }
			);

                if (
                  ctx?.waitUntil
                ) {
                  ctx.waitUntil(
                    attemptFulfillment(
                      env,
                      order.id
                    )
                  );
                } else {
                  await attemptFulfillment(
                    env,
                    order.id
                  );
                }

				const successUrl =
				  new URL(
					storeConfig.successUrl
				  );

				successUrl.searchParams.set(
				  "order",
				  order.order_reference
				);

				if (
				  order.customer_status_token
				) {
				  successUrl.searchParams.set(
					"token",
					order.customer_status_token
				  );
				}

				return paymentRedirect(
				  successUrl.toString()
				);
              }

				if (
				  currentState
					?.payment_status ===
				  "FAILED"
				) {
				  const failedUrl =
					new URL(
					  storeConfig.failedUrl
					);

				  failedUrl.searchParams.set(
					"reason",
					"declined"
				  );

				  return paymentRedirect(
					failedUrl.toString()
				  );
				}

              console.error(
                "FAILED PAYMENT STATE CONFLICT",
                {
                  orderId:
                    order.id,

                  currentPaymentStatus:
                    currentState
                      ?.payment_status ||
                    null
                }
              );

				const failedUrl =
				  new URL(
					storeConfig.failedUrl
				  );

				failedUrl.searchParams.set(
				  "reason",
				  "error"
				);

				return paymentRedirect(
				  failedUrl.toString()
				);
            }

            console.log(
              "ORDER MARKED FAILED",
              {
                orderId:
                  order.id,

                reference:
                  order
                    .order_reference,

				gpStatus:
				  verifiedTransaction.status
              }
            );

				const failedUrl =
				  new URL(
					storeConfig.failedUrl
				  );

				failedUrl.searchParams.set(
				  "reason",
				  "declined"
				);

				return paymentRedirect(
				  failedUrl.toString()
				);
          }

		console.error(
		  "PAYMENT RESULT NOT ACCEPTED",
		  {
			orderId:
			  order.id,

			gpStatus:
			  verifiedTransaction.status,

			idPresent,

			referenceMatches,

			amountMatches,

			currencyMatches
		  }
		);

			const failedUrl =
			  new URL(
				storeConfig.failedUrl
			  );

			failedUrl.searchParams.set(
			  "reason",
			  "error"
			);

			return paymentRedirect(
			  failedUrl.toString()
			);
          } catch (error) {
			console.error(
			  "PAYMENT CALLBACK ERROR",
			  {
				message:
				  error?.message ||
				  String(error)
			  }
			);

          const failedUrl =
            new URL(
              storeConfig.failedUrl
            );

          failedUrl.searchParams.set(
            "reason",
            "error"
          );

          return paymentRedirect(
            failedUrl.toString()
          );
        }
      }

      /* -------------------------------------------------
         GET â€” Browser return
         ------------------------------------------------- */

      if (
        request.method === "GET"
      ) {
        try {
          if (!queryReference) {
			const failedUrl =
			  new URL(
				storeConfig.failedUrl
			  );

			failedUrl.searchParams.set(
			  "reason",
			  "error"
			);

			return paymentRedirect(
			  failedUrl.toString()
			);
          }

          const order =
            await env.DB.prepare(
              `
			SELECT
			  payment_status,
			  order_reference,
			  customer_status_token
			FROM orders
			WHERE order_reference = ?
			LIMIT 1
              `
            )
              .bind(
                queryReference
              )
              .first();

          if (
            order?.payment_status ===
            "PAID"
          ) {
			const successUrl =
			  new URL(
				storeConfig.successUrl
			  );

			successUrl.searchParams.set(
			  "order",
			  order.order_reference
			);

			if (
			  order.customer_status_token
			) {
			  successUrl.searchParams.set(
				"token",
				order.customer_status_token
			  );
			}

			return paymentRedirect(
			  successUrl.toString()
			);
          }

			const failedUrl =
			  new URL(
				storeConfig.failedUrl
			  );

			failedUrl.searchParams.set(
			  "reason",
			  "error"
			);

			return paymentRedirect(
			  failedUrl.toString()
			);
        } catch (error) {
		console.error(
		  "PAYMENT RETURN PAGE ERROR",
		  {
			message:
			  error?.message ||
			  String(error)
		  }
		);
		const failedUrl =
		  new URL(
			storeConfig.failedUrl
		  );

		failedUrl.searchParams.set(
		  "reason",
		  "error"
		);

		return paymentRedirect(
		  failedUrl.toString()
		);
        }
      }

      return new Response(
        "Method Not Allowed",
        {
          status: 405
        }
      );
    }

    /* =====================================================
       404
       ===================================================== */

    return new Response(
      "Not Found",
      {
        status: 404,
        headers:
          corsHeaders
      }
    );
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
  if (env.APP_ENV !== "production" || env.PAYMENT_ENV !== "production") {
    console.log(
      "SCHEDULED FULFILLMENT RECONCILIATION SUPPRESSED",
      {
        environment: "sandbox"
      }
    );

    return;
  }
    console.log(
      "SCHEDULED FULFILLMENT RECONCILIATION",
      {
        scheduledTime:
          controller.scheduledTime,
        cron:
          controller.cron
      }
    );

	ctx.waitUntil(
	  Promise.allSettled([
		recoverPendingFulfillmentOrders(
		  env
		),
		detectStaleSubmittingFulfillmentOrders(
		  env
		),
		reconcileActiveFulfillmentOrders(
		  env
		)
	  ])
	);
  }
};
