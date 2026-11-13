import {
  getEmailProvider
} from "./providers.js";
import {
  getStoreConfig
} from "../config/store.js";

/* =========================================================
   Shared Helpers
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatMoney(
  cents,
  currency = "USD"
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency
    }
  ).format(
    (Number(cents) || 0) / 100
  );
}


function formatOptionLabel(
  key
) {
  return String(key || "")
    .replace(
      /[_-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}


function getItemOptions(
  item
) {
  if (
    item.options &&
    Object.keys(
      item.options
    ).length > 0
  ) {
    return item.options;
  }

  const options = {};

  if (item.color) {
    options.color =
      item.color;
  }

  if (item.size) {
    options.size =
      item.size;
  }

  return options;
}


function buildOptionText(
  options = {}
) {
  return Object.entries(
    options
  )
    .filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    )
    .map(
      ([key, value]) =>
        `${formatOptionLabel(
          key
        )}: ${value}`
    )
    .join(" / ");
}


function buildShippingAddressHtml(
  order
) {
  const cityStatePostal = [
    order.shipping_city,
    order.shipping_state
  ]
    .filter(Boolean)
    .join(", ");

  const locality = [
    cityStatePostal,
    order.shipping_postal_code
  ]
    .filter(Boolean)
    .join(" ");

  return [
    order.customer_name,
    order.shipping_address1,
    order.shipping_address2,
    locality,
    order.shipping_country
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");
}


function buildShippingAddressText(
  order
) {
  const cityStatePostal = [
    order.shipping_city,
    order.shipping_state
  ]
    .filter(Boolean)
    .join(", ");

  const locality = [
    cityStatePostal,
    order.shipping_postal_code
  ]
    .filter(Boolean)
    .join(" ");

  return [
    order.customer_name,
    order.shipping_address1,
    order.shipping_address2,
    locality,
    order.shipping_country
  ]
    .filter(Boolean)
    .join("\n");
}


function buildButton(
  url,
  label
) {
  if (!url) {
    return "";
  }

  return `
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      style="
        margin:28px auto;
      "
    >
      <tr>
        <td
          align="center"
          style="
            border-radius:8px;
            background:#111827;
          "
        >
          <a
            href="${escapeHtml(
              url
            )}"
            style="
              display:inline-block;
              padding:14px 24px;
              color:#ffffff;
              text-decoration:none;
              font-size:15px;
              font-weight:700;
              line-height:1.2;
              border-radius:8px;
            "
          >
            ${escapeHtml(
              label
            )}
          </a>
        </td>
      </tr>
    </table>
  `;
}


function buildEmailShell({
  storeName,
  eyebrow,
  title,
  intro,
  content,
  footerText
}) {
  return `
<!doctype html>
<html>
  <head>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    >
    <meta
      http-equiv="Content-Type"
      content="text/html; charset=UTF-8"
    >
  </head>

  <body
    style="
      margin:0;
      padding:0;
      background:#f3f4f6;
      font-family:
        Arial,
        Helvetica,
        sans-serif;
      color:#111827;
    "
  >
    <div
      style="
        display:none;
        max-height:0;
        overflow:hidden;
        opacity:0;
      "
    >
      ${escapeHtml(intro)}
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        width:100%;
        background:#f3f4f6;
      "
    >
      <tr>
        <td
          align="center"
          style="
            padding:32px 16px;
          "
        >
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            role="presentation"
            style="
              width:100%;
              max-width:620px;
            "
          >
            <tr>
              <td
                align="center"
                style="
                  padding:0 16px 20px;
                  font-size:20px;
                  line-height:1.3;
                  font-weight:800;
                  color:#111827;
                "
              >
                ${escapeHtml(
                  storeName
                )}
              </td>
            </tr>

            <tr>
              <td
                style="
                  background:#ffffff;
                  border-radius:14px;
                  overflow:hidden;
                  box-shadow:
                    0 1px 3px
                    rgba(0,0,0,0.06);
                "
              >
                <div
                  style="
                    height:5px;
                    background:#111827;
                    line-height:5px;
                    font-size:5px;
                  "
                >
                  &nbsp;
                </div>

                <div
                  style="
                    padding:36px 32px;
                  "
                >
                  ${
                    eyebrow
                      ? `
                        <div
                          style="
                            margin:0 0 10px;
                            font-size:12px;
                            line-height:1.4;
                            font-weight:700;
                            letter-spacing:1.2px;
                            text-transform:uppercase;
                            color:#6b7280;
                          "
                        >
                          ${escapeHtml(
                            eyebrow
                          )}
                        </div>
                      `
                      : ""
                  }

                  <h1
                    style="
                      margin:0 0 12px;
                      font-size:28px;
                      line-height:1.25;
                      color:#111827;
                    "
                  >
                    ${escapeHtml(
                      title
                    )}
                  </h1>

                  <p
                    style="
                      margin:0 0 28px;
                      font-size:16px;
                      line-height:1.65;
                      color:#4b5563;
                    "
                  >
                    ${escapeHtml(
                      intro
                    )}
                  </p>

                  ${content}
                </div>
              </td>
            </tr>

            <tr>
              <td
                align="center"
                style="
                  padding:20px 24px 0;
                  font-size:12px;
                  line-height:1.6;
                  color:#6b7280;
                "
              >
                ${escapeHtml(
                  footerText
                )}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}


/* =========================================================
   Order Items
   ========================================================= */

function buildOrderItemsHtml(
  items = [],
  currency = "USD"
) {
  return items
    .map(
      (item) => {
        const options =
          getItemOptions(
            item
          );

        const details =
          buildOptionText(
            options
          );

        const quantity =
          Number(
            item.quantity
          ) || 0;

        const unitPrice =
          Number(
            item.unit_price
          ) || 0;

        return `
          <tr>
            <td
              style="
                padding:16px 0;
                border-bottom:
                  1px solid #e5e7eb;
                vertical-align:top;
              "
            >
              <div
                style="
                  font-size:15px;
                  line-height:1.4;
                  font-weight:700;
                  color:#111827;
                "
              >
                ${escapeHtml(
                  item.product_name
                )}
              </div>

              ${
                details
                  ? `
                    <div
                      style="
                        margin-top:4px;
                        font-size:13px;
                        line-height:1.5;
                        color:#6b7280;
                      "
                    >
                      ${escapeHtml(
                        details
                      )}
                    </div>
                  `
                  : ""
              }

              <div
                style="
                  margin-top:4px;
                  font-size:13px;
                  color:#6b7280;
                "
              >
                Qty:
                ${escapeHtml(
                  quantity
                )}
              </div>
            </td>

            <td
              align="right"
              style="
                padding:16px 0 16px 16px;
                border-bottom:
                  1px solid #e5e7eb;
                vertical-align:top;
                white-space:nowrap;
                font-size:15px;
                font-weight:600;
                color:#111827;
              "
            >
              ${formatMoney(
                unitPrice *
                  quantity,
                currency
              )}
            </td>
          </tr>
        `;
      }
    )
    .join("");
}


function buildOrderItemsText(
  items = [],
  currency = "USD"
) {
  return items
    .map(
      (item) => {
        const options =
          buildOptionText(
            getItemOptions(
              item
            )
          );

        const quantity =
          Number(
            item.quantity
          ) || 0;

        const unitPrice =
          Number(
            item.unit_price
          ) || 0;

        const parts = [
          item.product_name,
          options || null,
          `Qty: ${quantity}`,
          formatMoney(
            unitPrice *
              quantity,
            currency
          )
        ].filter(Boolean);

        return parts.join(
          " | "
        );
      }
    )
    .join("\n");
}


/* =========================================================
   Order Confirmation
   ========================================================= */

function orderConfirmationTemplate(
  order,
  items,
  config
) {
const storeName =
  config.storeName;

  const currency =
    order.currency ||
    "USD";

  const subtotal =
    order.merchandise_subtotal ??
    order.subtotal ??
    0;

  const shipping =
    order.shipping_amount || 0;

  const tax =
    order.tax_amount || 0;

  const total =
    order.total ??
    subtotal +
      shipping +
      tax;

  const statusUrl =
    order.customer_status_token &&
    config.orderStatusUrl
      ? `${
          config.orderStatusUrl
        }?token=${encodeURIComponent(
          order.customer_status_token
        )}`
      : null;

  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:16px 18px;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:5px;
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.7px;
          color:#6b7280;
        "
      >
        Order reference
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
          color:#111827;
        "
      >
        ${escapeHtml(
          order.order_reference
        )}
      </div>
    </div>

    ${buildButton(
      statusUrl,
      "View Order Status"
    )}

    <div
      style="
        margin-top:30px;
      "
    >
      <h2
        style="
          margin:0 0 6px;
          font-size:18px;
          color:#111827;
        "
      >
        Order summary
      </h2>

      <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        role="presentation"
      >
        ${buildOrderItemsHtml(
          items,
          currency
        )}
      </table>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        margin-top:22px;
      "
    >
      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Merchandise
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
            subtotal,
            currency
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Shipping
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
            shipping,
            currency
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:5px 0;
            color:#4b5563;
          "
        >
          Tax
        </td>

        <td
          align="right"
          style="
            padding:5px 0;
            color:#111827;
          "
        >
          ${formatMoney(
            tax,
            currency
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding-top:14px;
            border-top:
              1px solid #e5e7eb;
            font-size:18px;
            font-weight:800;
          "
        >
          Total
        </td>

        <td
          align="right"
          style="
            padding-top:14px;
            border-top:
              1px solid #e5e7eb;
            font-size:18px;
            font-weight:800;
          "
        >
          ${formatMoney(
            total,
            currency
          )}
        </td>
      </tr>
    </table>

    <div
      style="
        margin-top:30px;
        padding-top:24px;
        border-top:
          1px solid #e5e7eb;
      "
    >
      <h2
        style="
          margin:0 0 10px;
          font-size:16px;
          color:#111827;
        "
      >
        Shipping to
      </h2>

      <div
        style="
          font-size:14px;
          line-height:1.7;
          color:#4b5563;
        "
      >
        ${buildShippingAddressHtml(
          order
        )}
      </div>
    </div>
  `;

  return buildEmailShell({
    storeName,
    eyebrow:
      "Order confirmed",
    title:
      "Thanks for your order",
    intro:
      "Your payment was received successfully. We'll send you another email when your order ships.",
    content,
    footerText:
      `This order confirmation was sent by ${storeName}.`
  });
}


function orderConfirmationText(
  order,
  items,
  config
) {
  const currency =
    order.currency ||
    "USD";

  const subtotal =
    order.merchandise_subtotal ??
    order.subtotal ??
    0;

  const shipping =
    order.shipping_amount || 0;

  const tax =
    order.tax_amount || 0;

  const total =
    order.total ??
    subtotal +
      shipping +
      tax;

  const statusUrl =
    order.customer_status_token &&
    config.orderStatusUrl
      ? `${
          config.orderStatusUrl
        }?token=${encodeURIComponent(
          order.customer_status_token
        )}`
      : null;

  return [
    config.storeName,
    "",
    "Thanks for your order.",
    "Your payment was received successfully.",
    "",
    `Order: ${order.order_reference}`,
    "",
    "ORDER SUMMARY",
    buildOrderItemsText(
      items,
      currency
    ),
    "",
    `Merchandise: ${formatMoney(
      subtotal,
      currency
    )}`,
    `Shipping: ${formatMoney(
      shipping,
      currency
    )}`,
    `Tax: ${formatMoney(
      tax,
      currency
    )}`,
    `Total: ${formatMoney(
      total,
      currency
    )}`,
    "",
    "SHIPPING TO",
    buildShippingAddressText(
      order
    ),
    statusUrl
      ? ""
      : null,
    statusUrl
      ? `View order status: ${statusUrl}`
      : null
  ]
    .filter(
      (value) =>
        value !== null
    )
    .join("\n");
}


export async function sendOrderConfirmation(
  env,
  order,
  items
) {
  if (!order?.email) {
    throw new Error(
      "Cannot send order confirmation without customer email"
    );
  }

	const provider =
	  getEmailProvider(env);

	const storeConfig =
	  getStoreConfig(env);

	const config = {
	  storeName:
		storeConfig.name,

	  from:
		storeConfig.emailFrom,

	  orderStatusUrl:
		`${storeConfig.storefrontOrigin}${storeConfig.storefrontBasePath}/order-status/`
	};

  const message = {
    from:
      config.from,

    to:
      order.email,

    subject:
      `Order confirmed - ${order.order_reference}`,

    html:
      orderConfirmationTemplate(
        order,
        items,
        config
      ),

    text:
      orderConfirmationText(
        order,
        items,
        config
      )
  };

  return provider.send(
    message,
    {
      idempotencyKey:
        `order-confirmation/${order.order_reference}`
    }
  );
}


/* =========================================================
   Shipping Confirmation
   ========================================================= */

function shippingConfirmationTemplate(
  order,
  config
) {
const storeName =
  config.storeName;

  const carrier =
    order.carrier ||
    "Shipping carrier";

  const trackingNumber =
    order.tracking_number ||
    "";

  const trackingUrl =
    order.tracking_url ||
    "";

  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:16px 18px;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:5px;
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.7px;
          color:#6b7280;
        "
      >
        Order reference
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
        "
      >
        ${escapeHtml(
          order.order_reference
        )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
    >
      <tr>
        <td
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            color:#6b7280;
          "
        >
          Carrier
        </td>

        <td
          align="right"
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            font-weight:700;
          "
        >
          ${escapeHtml(
            carrier
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            color:#6b7280;
          "
        >
          Tracking number
        </td>

        <td
          align="right"
          style="
            padding:10px 0;
            border-bottom:
              1px solid #e5e7eb;
            font-weight:700;
          "
        >
          ${escapeHtml(
            trackingNumber
          )}
        </td>
      </tr>
    </table>

    ${buildButton(
      trackingUrl,
      "Track Your Package"
    )}

    <div
      style="
        margin-top:30px;
        padding-top:24px;
        border-top:
          1px solid #e5e7eb;
      "
    >
      <h2
        style="
          margin:0 0 10px;
          font-size:16px;
        "
      >
        Shipping to
      </h2>

      <div
        style="
          font-size:14px;
          line-height:1.7;
          color:#4b5563;
        "
      >
        ${buildShippingAddressHtml(
          order
        )}
      </div>
    </div>
  `;

  return buildEmailShell({
    storeName,
    eyebrow:
      "Shipping update",
    title:
      "Your order has shipped",
    intro:
      "Good news - your package is on the way.",
    content,
    footerText:
      `This shipping update was sent by ${storeName}.`
  });
}


function shippingConfirmationText(
  order,
  config
) {
  return [
    config.storeName,
    "",
    "Your order has shipped.",
    "Good news - your package is on the way.",
    "",
    `Order: ${order.order_reference}`,
    `Carrier: ${
      order.carrier ||
      "Shipping carrier"
    }`,
    `Tracking number: ${
      order.tracking_number ||
      ""
    }`,
    order.tracking_url
      ? `Track your package: ${order.tracking_url}`
      : null,
    "",
    "SHIPPING TO",
    buildShippingAddressText(
      order
    )
  ]
    .filter(
      (value) =>
        value !== null
    )
    .join("\n");
}


export async function sendShippingConfirmation(
  env,
  order
) {
  if (!order?.email) {
    throw new Error(
      "Cannot send shipping confirmation without customer email"
    );
  }

  if (!order?.tracking_number) {
    throw new Error(
      "Cannot send shipping confirmation without tracking number"
    );
  }

	const provider =
	  getEmailProvider(env);

	const storeConfig =
	  getStoreConfig(env);

	const config = {
	  storeName:
		storeConfig.name,

	  from:
		storeConfig.emailFrom
	};

  const message = {
    from:
      config.from,

    to:
      order.email,

    subject:
      `Your order has shipped - ${order.order_reference}`,

    html:
      shippingConfirmationTemplate(
        order,
        config
      ),

    text:
      shippingConfirmationText(
        order,
        config
      )
  };

  return provider.send(
    message,
    {
      idempotencyKey:
        `shipping-confirmation/${order.order_reference}`
    }
  );
}

/* =========================================================
   Delivery Confirmation
   ========================================================= */

function deliveryConfirmationTemplate(
  order,
  config
) {
  const storeName =
    config.storeName;

  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:16px 18px;
        background:#f9fafb;
        border:1px solid #e5e7eb;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:5px;
          font-size:12px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.7px;
          color:#6b7280;
        "
      >
        Order reference
      </div>

      <div
        style="
          font-size:16px;
          font-weight:700;
        "
      >
        ${escapeHtml(
          order.order_reference
        )}
      </div>
    </div>

    <p
      style="
        margin:0;
        font-size:15px;
        line-height:1.7;
        color:#4b5563;
      "
    >
      Your order has been marked as delivered.
      We hope you enjoy your purchase.
    </p>
  `;

  return buildEmailShell({
    storeName,
    eyebrow:
      "Delivery update",
    title:
      "Your order has been delivered",
    intro:
      "Your package has arrived.",
    content,
    footerText:
      `This delivery update was sent by ${storeName}.`
  });
}


function deliveryConfirmationText(
  order,
  config
) {
  return [
    config.storeName,
    "",
    "Your order has been delivered.",
    "Your package has arrived.",
    "",
    `Order: ${order.order_reference}`,
    "",
    "We hope you enjoy your purchase."
  ].join("\n");
}


export async function sendDeliveryConfirmation(
  env,
  order
) {
  if (!order?.email) {
    throw new Error(
      "Cannot send delivery confirmation without customer email"
    );
  }

  const provider =
    getEmailProvider(env);

  const storeConfig =
    getStoreConfig(env);

  const config = {
    storeName:
      storeConfig.name,

    from:
      storeConfig.emailFrom
  };

  const message = {
    from:
      config.from,

    to:
      order.email,

    subject:
      `Your order has been delivered - ${order.order_reference}`,

    html:
      deliveryConfirmationTemplate(
        order,
        config
      ),

    text:
      deliveryConfirmationText(
        order,
        config
      )
  };

  return provider.send(
    message,
    {
      idempotencyKey:
        `delivery-confirmation/${order.order_reference}`
    }
  );
}

/* =========================================================
   Fulfillment Failure Admin Alert
   ========================================================= */

function fulfillmentFailureTemplate(
  order,
  config
) {
const storeName =
  config.storeName;
  
  const failureMessage =
    order.fulfillment_error ||
    "Unknown fulfillment failure";

  const content = `
    <div
      style="
        margin-bottom:24px;
        padding:18px;
        background:#fff7ed;
        border:1px solid #fed7aa;
        border-radius:10px;
      "
    >
      <div
        style="
          margin-bottom:6px;
          font-size:13px;
          font-weight:700;
          color:#9a3412;
        "
      >
        Manual attention required
      </div>

      <div
        style="
          font-size:14px;
          line-height:1.6;
          color:#7c2d12;
        "
      >
        ${escapeHtml(
          failureMessage
        )}
      </div>
    </div>

    <table
      width="100%"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
    >
      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Order
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.order_reference
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Order ID
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.id
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Customer email
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.email
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.fulfillment_provider ||
            "Not assigned"
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider status
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order
              .fulfillment_provider_status ||
            order
              .fulfillment_status ||
            "FAILED"
          )}
        </td>
      </tr>

      <tr>
        <td
          style="
            padding:8px 0;
            color:#6b7280;
          "
        >
          Provider order ID
        </td>

        <td
          align="right"
          style="
            padding:8px 0;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.fulfillment_order_id ||
            "Not available"
          )}
        </td>
      </tr>
    </table>

    <p
      style="
        margin:28px 0 0;
        font-size:14px;
        line-height:1.6;
        color:#4b5563;
      "
    >
      Review the order and fulfillment provider
      before attempting any manual retry.
    </p>
  `;

  return buildEmailShell({
    storeName,
    eyebrow:
      "Operational alert",
    title:
      "Fulfillment failure",
    intro:
      "A paid order could not be submitted or updated successfully with the fulfillment provider.",
    content,
    footerText:
      `Automated operational alert from ${storeName}.`
  });
}


function fulfillmentFailureText(
  order,
  config
) {
  return [
    config.storeName,
    "",
    "FULFILLMENT FAILURE",
    "",
    "A paid order requires manual attention.",
    "",
    `Order: ${order.order_reference}`,
    `Order ID: ${order.id}`,
    `Customer email: ${order.email || ""}`,
    `Provider: ${
      order.fulfillment_provider ||
      "Not assigned"
    }`,
    `Provider status: ${
      order.fulfillment_provider_status ||
      order.fulfillment_status ||
      "FAILED"
    }`,
    `Provider order ID: ${
      order.fulfillment_order_id ||
      "Not available"
    }`,
    "",
    "Failure details:",
    order.fulfillment_error ||
      "Unknown fulfillment failure",
    "",
    "Review the order and fulfillment provider before attempting any manual retry."
  ].join("\n");
}


export async function sendFulfillmentFailureAlert(
  env,
  order
) {
  if (!env.STORE_ADMIN_EMAIL) {
    throw new Error(
      "STORE_ADMIN_EMAIL is not configured"
    );
  }

	const provider =
	  getEmailProvider(env);

	const storeConfig =
	  getStoreConfig(env);

	const config = {
	  storeName:
		storeConfig.name,

	  from:
		storeConfig.emailFrom
	};

  const message = {
    from:
      config.from,

    to:
      env.STORE_ADMIN_EMAIL,

    subject:
      `Fulfillment failed - ${order.order_reference}`,

    html:
      fulfillmentFailureTemplate(
        order,
        config
      ),

    text:
      fulfillmentFailureText(
        order,
        config
      )
  };

  return provider.send(
    message,
    {
      idempotencyKey:
        `fulfillment-failure/${order.order_reference}`
    }
  );
}