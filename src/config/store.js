const DEFAULT_STORE_CONFIG = {
  name:
    "Jekyll Commerce",

  currency:
    "USD",

  maxQuantity:
    10,

  fulfillmentProvider:
    "printify",

  emailProvider:
    "resend",

  emailFrom:
    "Jekyll Commerce <onboarding@resend.dev>"
};


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      String(value ?? ""),
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return parsed;
}


function requiredString(
  env,
  key
) {
  const value =
    env[key];

  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    throw new Error(
      `Missing required store configuration: ${key}`
    );
  }

  return value.trim();
}


function storefrontBasePath(
  env
) {
  if (
    !Object.prototype.hasOwnProperty.call(
      env,
      "STOREFRONT_BASE_PATH"
    ) ||
    typeof env.STOREFRONT_BASE_PATH !==
      "string"
  ) {
    throw new Error(
      "Missing required store configuration: STOREFRONT_BASE_PATH"
    );
  }

  return env.STOREFRONT_BASE_PATH.trim();
}


export function getStoreConfig(
  env = {}
) {
  return {
    name:
      env.STORE_NAME ||
      DEFAULT_STORE_CONFIG.name,

    currency:
      env.STORE_CURRENCY ||
      DEFAULT_STORE_CONFIG.currency,

    storefrontOrigin:
      requiredString(
        env,
        "STOREFRONT_ORIGIN"
      ),

    storefrontBasePath:
      storefrontBasePath(
        env
      ),

    successUrl:
      requiredString(
        env,
        "STORE_SUCCESS_URL"
      ),

    failedUrl:
      requiredString(
        env,
        "STORE_FAILED_URL"
      ),

    paymentReturnUrl:
      requiredString(
        env,
        "PAYMENT_RETURN_URL"
      ),

    maxQuantity:
      positiveInteger(
        env.STORE_MAX_QUANTITY,
        DEFAULT_STORE_CONFIG.maxQuantity
      ),

    fulfillmentProvider:
      env.FULFILLMENT_PROVIDER ||
      DEFAULT_STORE_CONFIG.fulfillmentProvider,

    emailProvider:
      env.EMAIL_PROVIDER ||
      DEFAULT_STORE_CONFIG.emailProvider,

    emailFrom:
      env.STORE_EMAIL_FROM ||
      DEFAULT_STORE_CONFIG.emailFrom
  };
}


export {
  DEFAULT_STORE_CONFIG
};