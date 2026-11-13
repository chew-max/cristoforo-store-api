import {
  buildFulfillmentCatalog
} from "../catalog/helpers.js";

export const fulfillmentProducts =
  buildFulfillmentCatalog();

export function getFulfillmentProduct(
  sku
) {
  return (
    fulfillmentProducts[
      sku
    ] ||
    null
  );
}