import {
  getFulfillmentProduct
} from "./fulfillment/providers.js";

import {
  calculatePrintifyShipping
} from "./fulfillment/printify.js";


function prepareShippingItems(
  cartItems
) {

  return cartItems.map(
    function (item) {

      const mapping =
        getFulfillmentProduct(
          item.sku
        );


      if (!mapping) {

        throw new Error(
          `No shipping mapping exists for SKU ${item.sku}.`
        );
      }


      if (
        mapping.provider !==
          "printify"
      ) {

        throw new Error(
          `Shipping provider ${mapping.provider} is not supported yet.`
        );
      }


      return {

        sku:
          item.sku,

        quantity:
          item.quantity,

        provider:
          mapping.provider,

        printifyProductId:
          mapping.productId,

        printifyVariantId:
          mapping.variantId
      };
    }
  );
}


export async function calculateShipping(
  env,
  customer,
  cartItems
) {

  if (
    !Array.isArray(cartItems) ||
    cartItems.length === 0
  ) {

    throw new Error(
      "Cart is empty."
    );
  }


  const items =
    prepareShippingItems(
      cartItems
    );


  const providers =
    new Set(
      items.map(
        item =>
          item.provider
      )
    );


  if (
    providers.size !== 1
  ) {

    throw new Error(
      "Multi-provider shipping is not supported yet."
    );
  }


  const provider =
    items[0].provider;


  if (
    provider !==
      "printify"
  ) {

    throw new Error(
      `Unsupported shipping provider: ${provider}`
    );
  }


  const quote =
    await calculatePrintifyShipping(
      env,
      customer,
      items
    );


  const standard =
    Number(
      quote?.standard
    );


  if (
    !Number.isInteger(
      standard
    ) ||
    standard < 0
  ) {

    throw new Error(
      "Printify did not return a valid standard shipping rate."
    );
  }


  return {

    provider:
      "printify",

    method:
      "standard",

    amount:
      standard,

    availableMethods:
      quote
  };
}