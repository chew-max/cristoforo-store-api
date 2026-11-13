import {
  DEFAULT_STORE_CONFIG,
  getStoreConfig
} from "../src/config/store.js";


function expectFailure(
  label,
  fn,
  expectedMessage
) {
  try {
    fn();
  } catch (error) {
    if (
      !String(error.message).includes(
        expectedMessage
      )
    ) {
      throw new Error(
        `${label} failed with unexpected error: ${error.message}`
      );
    }

    return;
  }

  throw new Error(
    `${label} did not fail as expected.`
  );
}


const requiredEnv = {
  STOREFRONT_ORIGIN:
    "https://example.com",

  STOREFRONT_BASE_PATH:
    "",

  STORE_SUCCESS_URL:
    "https://example.com/checkout/success/",

  STORE_FAILED_URL:
    "https://example.com/checkout/failed/",

  PAYMENT_RETURN_URL:
    "https://api.example.com/api/payment-return"
};


const defaults =
  getStoreConfig(
    requiredEnv
  );


if (
  defaults.name !==
  DEFAULT_STORE_CONFIG.name
) {
  throw new Error(
    "Default store name did not resolve correctly."
  );
}


if (
  defaults.currency !== "USD"
) {
  throw new Error(
    "Default currency did not resolve correctly."
  );
}


if (
  defaults.maxQuantity !== 10
) {
  throw new Error(
    "Default max quantity did not resolve correctly."
  );
}


if (
  defaults.storefrontBasePath !== ""
) {
  throw new Error(
    "Empty storefront base path did not resolve correctly."
  );
}


const custom =
  getStoreConfig({
    ...requiredEnv,

    STORE_NAME:
      "Test Store",

    STORE_CURRENCY:
      "USD",

    STORE_MAX_QUANTITY:
      "7",

    STOREFRONT_BASE_PATH:
      "/store"
  });


if (
  custom.name !==
  "Test Store"
) {
  throw new Error(
    "Custom store name did not resolve."
  );
}


if (
  custom.maxQuantity !== 7
) {
  throw new Error(
    "Custom max quantity did not resolve."
  );
}


if (
  custom.storefrontOrigin !==
  "https://example.com"
) {
  throw new Error(
    "Custom storefront origin did not resolve."
  );
}


if (
  custom.storefrontBasePath !==
  "/store"
) {
  throw new Error(
    "Custom storefront base path did not resolve."
  );
}


expectFailure(
  "Missing storefront origin",
  () =>
    getStoreConfig({
      ...requiredEnv,
      STOREFRONT_ORIGIN:
        undefined
    }),
  "STOREFRONT_ORIGIN"
);


expectFailure(
  "Missing storefront base path",
  () => {
    const env = {
      ...requiredEnv
    };

    delete env.STOREFRONT_BASE_PATH;

    getStoreConfig(env);
  },
  "STOREFRONT_BASE_PATH"
);


expectFailure(
  "Missing success URL",
  () =>
    getStoreConfig({
      ...requiredEnv,
      STORE_SUCCESS_URL:
        ""
    }),
  "STORE_SUCCESS_URL"
);


expectFailure(
  "Missing failed URL",
  () =>
    getStoreConfig({
      ...requiredEnv,
      STORE_FAILED_URL:
        ""
    }),
  "STORE_FAILED_URL"
);


expectFailure(
  "Missing payment return URL",
  () =>
    getStoreConfig({
      ...requiredEnv,
      PAYMENT_RETURN_URL:
        ""
    }),
  "PAYMENT_RETURN_URL"
);


console.log(
  "STORE CONFIG VALIDATION PASSED"
);