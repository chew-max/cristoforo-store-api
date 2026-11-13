import {
  sendShippingConfirmation
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
      "/test-shipping-email"
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
              shipping_country
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

      /*
       * Test-only tracking data.
       *
       * Nothing is written to the
       * orders table.
       */
      const testOrder = {
        ...order,

        fulfillment_status:
          "SHIPPED",

        tracking_number:
          "TEST-TRACKING-12345",

        tracking_url:
          "https://example.com/track/TEST-TRACKING-12345",

        carrier:
          "Test Carrier",

        shipped_at:
          new Date()
            .toISOString()
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
              "SHIPPING_CONFIRMATION already claimed",
            orderId
          }
        );
      }

      const result =
        await sendShippingConfirmation(
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
        "SHIPPING EMAIL TEST ERROR",
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