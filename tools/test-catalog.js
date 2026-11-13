import {
  catalogProducts
} from "../src/catalog/products.js";

import {
  buildSkuCatalog,
  buildFulfillmentCatalog
} from "../src/catalog/helpers.js";


function fail(
  message
) {
  throw new Error(
    message
  );
}


function isPositiveInteger(
  value
) {
  return (
    Number.isInteger(
      value
    ) &&
    value > 0
  );
}


function validateProduct(
  product
) {
  if (
    !product ||
    typeof product !== "object"
  ) {
    fail(
      "Catalog contains an invalid product."
    );
  }


  if (
    !product.id ||
    typeof product.id !== "string"
  ) {
    fail(
      "Every product must have a valid id."
    );
  }


  if (
    !product.name ||
    typeof product.name !== "string"
  ) {
    fail(
      `Product ${product.id} is missing a valid name.`
    );
  }


  if (
    !Array.isArray(
      product.variants
    ) ||
    product.variants.length < 1
  ) {
    fail(
      `Product ${product.id} must have at least one variant.`
    );
  }
}


function validateVariant(
  product,
  variant
) {
  if (
    !variant.sku ||
    typeof variant.sku !== "string"
  ) {
    fail(
      `Product ${product.id} contains a variant without a valid SKU.`
    );
  }


  if (
    !isPositiveInteger(
      variant.price
    )
  ) {
    fail(
      `SKU ${variant.sku} has an invalid price.`
    );
  }


  if (
    !variant.options ||
    typeof variant.options !== "object" ||
    Array.isArray(
      variant.options
    )
  ) {
    fail(
      `SKU ${variant.sku} must contain an options object.`
    );
  }


  const optionEntries =
    Object.entries(
      variant.options
    );


  if (
    optionEntries.length < 1
  ) {
    fail(
      `SKU ${variant.sku} must contain at least one option.`
    );
  }


  for (
    const [
      optionName,
      optionValue
    ]
    of optionEntries
  ) {

    if (
      !optionName ||
      optionValue === undefined ||
      optionValue === null ||
      String(
        optionValue
      ).trim() === ""
    ) {
      fail(
        `SKU ${variant.sku} contains an invalid product option.`
      );
    }

  }


  if (
    variant.fulfillment !== null &&
    variant.fulfillment !== undefined
  ) {

    if (
      !variant.fulfillment.provider
    ) {
      fail(
        `SKU ${variant.sku} fulfillment is missing provider.`
      );
    }


    if (
      !variant.fulfillment.productId
    ) {
      fail(
        `SKU ${variant.sku} fulfillment is missing productId.`
      );
    }


    if (
      variant.fulfillment.variantId ===
        undefined ||
      variant.fulfillment.variantId ===
        null
    ) {
      fail(
        `SKU ${variant.sku} fulfillment is missing variantId.`
      );
    }

  }
}


const productIds =
  new Set();

const skus =
  new Set();

let expectedSkuCount = 0;

let expectedFulfillmentCount = 0;


for (
  const product
  of catalogProducts
) {

  validateProduct(
    product
  );


  if (
    productIds.has(
      product.id
    )
  ) {
    fail(
      `Duplicate product id found: ${product.id}`
    );
  }


  productIds.add(
    product.id
  );


  for (
    const variant
    of product.variants
  ) {

    validateVariant(
      product,
      variant
    );


    if (
      skus.has(
        variant.sku
      )
    ) {
      fail(
        `Duplicate SKU found: ${variant.sku}`
      );
    }


    skus.add(
      variant.sku
    );

    expectedSkuCount += 1;


    if (
      variant.fulfillment
    ) {
      expectedFulfillmentCount += 1;
    }

  }

}


const skuCatalog =
  buildSkuCatalog();

const fulfillmentCatalog =
  buildFulfillmentCatalog();


const actualSkuCount =
  Object.keys(
    skuCatalog
  ).length;

const actualFulfillmentCount =
  Object.keys(
    fulfillmentCatalog
  ).length;


console.log(
  `PRODUCT COUNT: ${catalogProducts.length}`
);

console.log(
  `CATALOG SKU COUNT: ${actualSkuCount}`
);


if (
  actualSkuCount !==
  expectedSkuCount
) {
  fail(
    `Expected ${expectedSkuCount} catalog SKUs, found ${actualSkuCount}.`
  );
}


for (
  const product
  of catalogProducts
) {

  for (
    const variant
    of product.variants
  ) {

    const catalogVariant =
      skuCatalog[
        variant.sku
      ];


    if (
      !catalogVariant
    ) {
      fail(
        `SKU missing from generated catalog: ${variant.sku}`
      );
    }


    if (
      catalogVariant.productId !==
      product.id
    ) {
      fail(
        `SKU ${variant.sku} has incorrect productId.`
      );
    }


    if (
      catalogVariant.price !==
      variant.price
    ) {
      fail(
        `SKU ${variant.sku} has incorrect price.`
      );
    }


    console.log(
      `PRODUCT OK: ${variant.sku}`
    );

  }

}


console.log(
  `FULFILLMENT SKU COUNT: ${actualFulfillmentCount}`
);


if (
  actualFulfillmentCount !==
  expectedFulfillmentCount
) {
  fail(
    `Expected ${expectedFulfillmentCount} fulfillment SKUs, found ${actualFulfillmentCount}.`
  );
}


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


    const fulfillmentVariant =
      fulfillmentCatalog[
        variant.sku
      ];


    if (
      !fulfillmentVariant
    ) {
      fail(
        `Fulfillment SKU missing: ${variant.sku}`
      );
    }


    if (
      fulfillmentVariant.provider !==
      variant.fulfillment.provider
    ) {
      fail(
        `SKU ${variant.sku} has incorrect fulfillment provider.`
      );
    }


    if (
      fulfillmentVariant.productId !==
      variant.fulfillment.productId
    ) {
      fail(
        `SKU ${variant.sku} has incorrect fulfillment productId.`
      );
    }


    if (
      fulfillmentVariant.variantId !==
      variant.fulfillment.variantId
    ) {
      fail(
        `SKU ${variant.sku} has incorrect fulfillment variantId.`
      );
    }


    console.log(
      `FULFILLMENT OK: ${variant.sku}`
    );

  }

}


console.log("");
console.log(
  "CATALOG VALIDATION PASSED"
);