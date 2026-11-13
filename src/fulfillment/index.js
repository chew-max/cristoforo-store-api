import {
  getFulfillmentProduct
} from "./providers.js";

import {
  createPrintifyOrder,
  findPrintifyOrderByExternalId,
  getPrintifyOrder,
  normalizePrintifyOrder
} from "./printify.js";

export function prepareFulfillmentItems(
  orderItems
) {
  if (!Array.isArray(orderItems)) {
    throw new Error(
      "Order items are required."
    );
  }

  return orderItems.map(
    function (item) {
      const mapping =
        getFulfillmentProduct(
          item.sku
        );

      if (!mapping) {
        throw new Error(
          `No fulfillment mapping exists for SKU ${item.sku}.`
        );
      }

      return {
        ...item,

        fulfillment_provider:
          mapping.provider,

        printify_product_id:
          mapping.productId,

        printify_variant_id:
          mapping.variantId
      };
    }
  );
}


export function mapPrintifyStatus(
  status
) {
  const value =
    String(status || "")
      .trim()
      .toLowerCase();

  switch (value) {
    case "on-hold":
      return "ON_HOLD";

    case "sending-to-production":
    case "in-production":
      return "IN_PRODUCTION";

    case "partially-fulfilled":
    case "fulfilled":
    case "shipped":
      return "SHIPPED";

    case "delivered":
      return "DELIVERED";

    case "canceled":
    case "cancelled":
      return "CANCELED";

    case "payment-not-received":
    case "has-issues":
    case "unfulfillable":
    case "source-check-failed":
      return "FAILED";

    default:
      return "SUBMITTED";
  }
}


export async function fulfillOrder(
  env,
  order,
  orderItems
) {
  if (env.APP_ENV !== "production" || env.PAYMENT_ENV !== "production") {
    throw new Error(
      "Fulfillment requires production application and payment environments."
    );
  }
  if (!order) {
    throw new Error(
      "Order is required."
    );
  }

  if (
    order.payment_status !== "PAID"
  ) {
    throw new Error(
      "Only PAID orders may be fulfilled."
    );
  }

  if (
    order.fulfillment_status !==
      "SUBMITTING"
  ) {
    throw new Error(
      `Order cannot be fulfilled from status ${order.fulfillment_status}.`
    );
  }

  const items =
    prepareFulfillmentItems(
      orderItems
    );

  const providers =
    new Set(
      items.map(function (item) {
        return item
          .fulfillment_provider;
      })
    );

  if (providers.size !== 1) {
    throw new Error(
      "Multi-provider orders are not supported yet."
    );
  }

  const provider =
    items[0]
      .fulfillment_provider;

  switch (provider) {
    case "printify": {
      const data =
        await createPrintifyOrder(
          env,
          order,
          items
        );

      const normalized =
        normalizePrintifyOrder(data);

      return {
        provider:
          "printify",

        ...normalized
      };
    }

    default:
      throw new Error(
        `Unsupported fulfillment provider: ${provider}`
      );
  }
}

export async function findExistingFulfillmentOrder(
  env,
  order,
  provider = "printify"
) {
  if (!order) {
    throw new Error(
      "Order is required."
    );
  }

  if (!order.order_reference) {
    throw new Error(
      "Order reference is required."
    );
  }

  switch (provider) {
    case "printify": {
      const data =
        await findPrintifyOrderByExternalId(
          env,
          order.order_reference
        );

      if (!data) {
        return null;
      }

      const normalized =
        normalizePrintifyOrder(data);

      return {
        provider:
          "printify",

        ...normalized
      };
    }

    default:
      throw new Error(
        `Unsupported fulfillment provider: ${provider}`
      );
  }
}

export async function reconcileFulfillmentOrder(
  env,
  order
) {
  if (!order) {
    throw new Error(
      "Order is required."
    );
  }

  if (!order.fulfillment_provider) {
    throw new Error(
      "Order has no fulfillment provider."
    );
  }

  if (!order.fulfillment_order_id) {
    throw new Error(
      "Order has no fulfillment order ID."
    );
  }

  switch (
    order.fulfillment_provider
  ) {
    case "printify": {
      const data =
        await getPrintifyOrder(
          env,
          order.fulfillment_order_id
        );

      const normalized =
        normalizePrintifyOrder(data);

      return {
        provider:
          "printify",

        ...normalized
      };
    }

    default:
      throw new Error(
        `Unsupported fulfillment provider: ${order.fulfillment_provider}`
      );
  }
}