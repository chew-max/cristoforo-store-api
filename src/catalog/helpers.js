import {
  catalogProducts
} from "./products.js";


export function buildSkuCatalog() {
  const catalog = {};

  for (
    const product
    of catalogProducts
  ) {

    for (
      const variant
      of product.variants
    ) {

      const options =
        variant.options || {};


      catalog[
        variant.sku
      ] = {
        productId:
          product.id,

        name:
          product.name,

        price:
          variant.price,

        options: {
          ...options
        },

        /*
         * Backward compatibility.
         *
         * Existing backend code still
         * reads color / size directly.
         *
         * These can be removed later
         * once the order pipeline is
         * fully generic.
         */
        color:
          options.color ||
          null,

        size:
          options.size ||
          null
      };

    }

  }

  return catalog;
}


export function buildFulfillmentCatalog() {
  const catalog = {};

  for (
    const product
    of catalogProducts
  ) {

    for (
      const variant
      of product.variants
    ) {

      if (
        !variant.fulfillment
      ) {
        continue;
      }
	if (
	  !variant.sku ||
	  !variant.fulfillment.provider ||
	  !variant.fulfillment.productId ||
	  !variant.fulfillment.variantId
	) {
	  throw new Error(
		`Invalid fulfillment configuration for SKU ${variant.sku || "UNKNOWN"}.`
	  );
	}

if (
  Object.prototype.hasOwnProperty.call(
    catalog,
    variant.sku
  )
) {
  throw new Error(
    `Duplicate fulfillment SKU detected: ${variant.sku}.`
  );
}

      catalog[
        variant.sku
      ] = {
        provider:
          variant.fulfillment.provider,

        productId:
          variant.fulfillment.productId,

        variantId:
          variant.fulfillment.variantId
      };

    }

  }

  return catalog;
}