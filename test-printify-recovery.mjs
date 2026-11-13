import {
  findExistingFulfillmentOrder
} from "./src/fulfillment/index.js";

const [
  ,
  ,
  orderReference
] = process.argv;

if (!orderReference) {
  throw new Error(
    "Usage: node test-printify-recovery.mjs <order-reference>"
  );
}

const env = {
  PRINTIFY_API_TOKEN:
    process.env.PRINTIFY_API_TOKEN,

  PRINTIFY_SHOP_ID:
    process.env.PRINTIFY_SHOP_ID
};

const result =
  await findExistingFulfillmentOrder(
    env,
    {
      order_reference:
        orderReference
    }
  );

console.log({
  found: Boolean(result),

  provider:
    result?.provider || null,

  providerStatus:
    result?.providerStatus ||
    result?.status ||
    null,

  hasProviderOrderId:
    Boolean(
      result?.providerOrderId ||
      result?.orderId ||
      result?.id
    )
});