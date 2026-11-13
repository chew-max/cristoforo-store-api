const API_BASE =
  process.env.PRINTIFY_DIAGNOSTIC_URL;

if (!API_BASE) { console.error("Set PRINTIFY_DIAGNOSTIC_URL to this store sandbox Printify diagnostic endpoint."); process.exit(1); }

const args =
  process.argv.slice(2);

const [
  printifyProductId,
  storeProductId,
  skuPrefix,
  priceArg
] = args;

function fail(message) {
  console.error("");
  console.error("PRINTIFY CATALOG GENERATION FAILED");
  console.error(message);
  process.exit(1);
}

if (
  !printifyProductId ||
  !storeProductId ||
  !skuPrefix ||
  !priceArg
) {
  fail(
    "Usage: node tools/generate-printify-product.js <printify-product-id> <store-product-id> <sku-prefix> <price-cents>"
  );
}

const price =
  Number(priceArg);

if (
  !Number.isInteger(price) ||
  price <= 0
) {
  fail(
    "Price must be a positive integer in cents."
  );
}

function slug(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

let response;

try {
  response =
    await fetch(API_BASE);
} catch (error) {
  fail(
    `Unable to reach Printify diagnostic endpoint: ${error.message}`
  );
}

if (!response.ok) {
  fail(
    `Printify diagnostic returned HTTP ${response.status}.`
  );
}

const data =
  await response.json();

const product =
  data.products?.find(
    (item) =>
      item.id === printifyProductId
  );

if (!product) {
  fail(
    `Printify product not found: ${printifyProductId}`
  );
}

const enabledVariants =
  (product.variants || [])
    .filter(
      (variant) =>
        variant.enabled === true
    );

if (
  enabledVariants.length < 1
) {
  fail(
    "No explicitly enabled Printify variants were found."
  );
}

const optionValues = new Map();

for (const option of product.options || []) {
  for (const value of option.values || []) {
    optionValues.set(value.id, { type: option.type, title: value.title });
  }
}

const variants = enabledVariants.map((variant) => {
  const options = {};
  const skuParts = [];
  for (const optionValueId of variant.options || []) {
    const resolved = optionValues.get(optionValueId);
    if (!resolved) fail(`Unknown Printify option value ${optionValueId} for variant ${variant.id}.`);
    options[resolved.type] = resolved.title;

  }
  skuParts.push(...Object.keys(options).sort((a,b) => (a === "color" ? -1 : b === "color" ? 1 : a === "size" ? 1 : b === "size" ? -1 : a.localeCompare(b))).map((key) => slug(options[key])));
  if (skuParts.length < 1) fail(`No Printify options found for variant ${variant.id}.`);
  return { sku: `${storeProductId}-${skuParts.join("-")}`, price, options, fulfillment: { provider: "printify", productId: printifyProductId, variantId: variant.id } };
});

const output = {
  id:
    storeProductId,

  name:
    product.title,

  variants
};

console.log(
  JSON.stringify(
    output,
    null,
    2
  )
);

console.error("");
console.error(
  `GENERATED VARIANTS: ${variants.length}`
);