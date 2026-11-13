import fs from "node:fs";
import path from "node:path";

import {
  catalogProducts
} from "../src/catalog/products.js";


function centsToDollars(
  cents
) {
  return Number(
    (cents / 100).toFixed(2)
  );
}


function unique(
  values
) {
  return [
    ...new Set(values)
  ];
}


/*
 * A variant can explicitly define:
 *
 *   available: true
 *   available: false
 *
 * If no explicit availability is supplied,
 * fulfillment configuration determines whether
 * the variant can currently be sold.
 *
 * This keeps provider-specific fulfillment data
 * private while allowing the storefront to know
 * whether a variant is purchasable.
 */
function isVariantAvailable(
  variant
) {
  if (
    typeof variant.available ===
    "boolean"
  ) {
    return variant.available;
  }

  return Boolean(
    variant.fulfillment
  );
}


function getOptionNames(
  variants
) {
  const names =
    new Set();

  for (
    const variant
    of variants
  ) {
    const options =
      variant.options || {};

    for (
      const optionName
      of Object.keys(options)
    ) {
      names.add(
        optionName
      );
    }
  }

  return [
    ...names
  ];
}


function buildOptionValues(
  variants,
  optionNames
) {
  const optionValues = {};

  for (
    const optionName
    of optionNames
  ) {
    optionValues[
      optionName
    ] = unique(
      variants
        .map(
          (variant) =>
            variant.options?.[
              optionName
            ]
        )
        .filter(
          (value) =>
            value !== undefined &&
            value !== null &&
            value !== ""
        )
    );
  }

  return optionValues;
}


function buildVariantKey(
  variant,
  optionNames
) {
  return optionNames
    .map(
      (optionName) =>
        String(
          variant.options?.[
            optionName
          ] ?? ""
        )
    )
    .join("||");
}


function buildVariantIndex(
  variants,
  optionNames
) {
  const index = {};

  for (
    const variant
    of variants
  ) {
    const key =
      buildVariantKey(
        variant,
        optionNames
      );

    index[key] = {
      sku:
        variant.sku,

      price:
        centsToDollars(
          variant.price
        ),

      price_cents:
        variant.price,

      options:
        variant.options || {},

      available:
        isVariantAvailable(
          variant
        )
    };
  }

  return index;
}


function buildPublicVariants(
  variants
) {
  return variants.map(
    (variant) => ({
      sku:
        variant.sku,

      price:
        centsToDollars(
          variant.price
        ),

      price_cents:
        variant.price,

      options:
        variant.options || {},

      available:
        isVariantAvailable(
          variant
        )
    })
  );
}


function getProductBasePrice(
  variants
) {
  const availableVariants =
    variants.filter(
      (variant) =>
        isVariantAvailable(
          variant
        )
    );

  const priceSource =
    availableVariants.length > 0
      ? availableVariants
      : variants;

  const prices =
    priceSource.map(
      (variant) =>
        variant.price
    );

  return Math.min(
    ...prices
  );
}


function buildStorefrontCatalog() {
  const output = {};

  for (
    const product
    of catalogProducts
  ) {
    const optionNames =
      getOptionNames(
        product.variants
      );

    const minimumPrice =
      getProductBasePrice(
        product.variants
      );

    output[
      product.id
    ] = {
      product_id:
        product.id,

      name:
        product.name,

      price:
        centsToDollars(
          minimumPrice
        ),

      price_cents:
        minimumPrice,

      option_names:
        optionNames,

      option_values:
        buildOptionValues(
          product.variants,
          optionNames
        ),

      variant_index:
        buildVariantIndex(
          product.variants,
          optionNames
        ),

      variants:
        buildPublicVariants(
          product.variants
        )
    };
  }

  return output;
}


const catalog =
  buildStorefrontCatalog();

const outputDirectory =
  path.resolve(
    "dist"
  );

const outputFile =
  path.join(
    outputDirectory,
    "commerce-catalog.json"
  );

fs.mkdirSync(
  outputDirectory,
  {
    recursive: true
  }
);

fs.writeFileSync(
  outputFile,
  JSON.stringify(
    catalog,
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(
  `STOREFRONT CATALOG EXPORTED: ${outputFile}`
);

console.log(
  `PRODUCT COUNT: ${
    Object.keys(
      catalog
    ).length
  }`
);

console.log(
  "STOREFRONT CATALOG EXPORT PASSED"
);