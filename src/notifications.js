export const NOTIFICATION_TYPES = {
  ORDER_CONFIRMATION:
    "ORDER_CONFIRMATION",

  SHIPPING_CONFIRMATION:
    "SHIPPING_CONFIRMATION",

  DELIVERY_CONFIRMATION:
    "DELIVERY_CONFIRMATION",

  FULFILLMENT_FAILURE:
    "FULFILLMENT_FAILURE"
};

/*
 * Atomically claims the right to send
 * one notification type for one order.
 *
 * UNIQUE(order_id, type) is the durable
 * duplicate-send protection.
 *
 * We intentionally create the record
 * directly as SENDING.
 *
 * If another callback, webhook, or cron
 * tries the same notification later,
 * INSERT OR IGNORE will make that attempt
 * lose the claim.
 */
export async function claimOrderNotification(
  env,
  {
    orderId,
    type,
    provider = "resend"
  }
) {
  const result =
    await env.DB.prepare(
      `
        INSERT OR IGNORE INTO
          order_notifications (
            order_id,
            type,
            provider,
            status,
            attempts,
            created_at,
            updated_at
          )
        VALUES (
          ?,
          ?,
          ?,
          'SENDING',
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `
    )
      .bind(
        orderId,
        type,
        provider
      )
      .run();

  const claimed =
    Number(
      result.meta?.changes || 0
    ) === 1;

  if (claimed) {
    console.log(
      "NOTIFICATION CLAIMED",
      {
        orderId,
        type,
        provider
      }
    );
  } else {
    console.log(
      "NOTIFICATION ALREADY CLAIMED",
      {
        orderId,
        type
      }
    );
  }

  return claimed;
}

/*
 * Marks a successfully delivered request
 * to the email provider.
 */
export async function markNotificationSent(
  env,
  {
    orderId,
    type,
    providerMessageId = null
  }
) {
  await env.DB.prepare(
    `
      UPDATE order_notifications

      SET
        status = 'SENT',
        provider_message_id = ?,
        last_error = NULL,
        sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP

      WHERE order_id = ?
        AND type = ?
    `
  )
    .bind(
      providerMessageId,
      orderId,
      type
    )
    .run();

	console.log(
	  "NOTIFICATION MARKED SENT",
	  {
		orderId,
		type
	  }
	);
}

/*
 * Records a failed notification attempt.
 *
 * We do NOT automatically reclaim FAILED
 * notifications. That is intentional.
 *
 * Automatically retrying an ambiguous
 * provider failure could result in a
 * duplicate customer email.
 */
export async function markNotificationFailed(
  env,
  {
    orderId,
    type,
    error
  }
) {
  const message =
    error?.message ||
    String(error);

  await env.DB.prepare(
    `
      UPDATE order_notifications

      SET
        status = 'FAILED',
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE order_id = ?
        AND type = ?
    `
  )
    .bind(
      message.slice(0, 2000),
      orderId,
      type
    )
    .run();

  console.error(
    "NOTIFICATION MARKED FAILED",
    {
      orderId,
      type,
      message
    }
  );
}