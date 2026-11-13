import {
  sendFulfillmentFailureAlert
} from "../src/email/index.js";

import {
  NOTIFICATION_TYPES,
  claimOrderNotification,
  markNotificationSent,
  markNotificationFailed
} from "../src/notifications.js";

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    if (
      url.pathname !==
      "/test-fulfillment-failure-email"
    ) {
      return new Response(
        "Not Found",
        {
          status: 404
        }
      );
    }

    const orderId = 34;

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
          `Order ${orderId} was not found`
        );
      }

      const testOrder = {
        ...order,

        payment_status:
          "PAID",

        fulfillment_status:
          "FAILED",

        fulfillment_provider:
          order.fulfillment_provider ||
          "printify",

        fulfillment_provider_status:
          "has-issues",

        fulfillment_error:
          "TEST ONLY: simulated fulfillment failure for admin notification testing."
      };

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
        return Response.json(
          {
            ok: true,
            sent: false,
            reason:
              "FULFILLMENT_FAILURE already claimed",
            orderId
          }
        );
      }

      const result =
        await sendFulfillmentFailureAlert(
          env,
          testOrder
        );

      await markNotificationSent(
        env,
        {
          orderId,
          type,
          providerMessageId:
            result?.id ||
            null
        }
      );

      return Response.json(
        {
          ok: true,
          sent: true,
          orderId,
          type,
          providerMessageId:
            result?.id ||
            null
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
            "TEST NOTIFICATION STATE ERROR",
            notificationError
          );
        }
      }

      console.error(
        "FULFILLMENT FAILURE EMAIL TEST ERROR",
        error
      );

      return Response.json(
        {
          ok: false,
          orderId,
          error:
            error?.message ||
            String(error)
        },
        {
          status: 500
        }
      );
    }
  }
};