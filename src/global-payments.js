


function getGpApi(env) {
  if (env.PAYMENT_ENV === "sandbox") {
    return "https://apis.sandbox.globalpay.com/ucp";
  }

  if (env.PAYMENT_ENV === "production") {
    return "https://apis.globalpay.com/ucp";
  }

  throw new Error(
    "PAYMENT_ENV must be either sandbox or production."
  );
}

const GP_VERSION =
  "2021-03-22";


// =================================
// SHA-512 HELPER
// =================================

async function sha512(value) {
  const data =
    new TextEncoder().encode(
      value
    );

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-512",
      data
    );

  return Array.from(
    new Uint8Array(
      hashBuffer
    )
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


// =================================
// ACCESS TOKEN
// =================================

export async function getAccessToken(
  env
) {
  const nonce =
    new Date().toISOString();

  const secret =
    await sha512(
      nonce +
      env.GP_APP_KEY
    );


  const response =
    await fetch(
      `${getGpApi(env)}/accesstoken`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-GP-Version":
            GP_VERSION
        },

		body: JSON.stringify({
		  app_id: env.GP_APP_ID,
		  nonce: nonce,
		  secret: secret,
		  grant_type: "client_credentials",
		  interval_to_expire: "10_MINUTES"
		})
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    console.error(
      "Global Payments authentication failed:",
        {
			httpStatus: response.status
		}
    );

    throw new Error(
      "Unable to authenticate with Global Payments."
    );
  }


  if (!data.token) {
    console.error(
      "Global Payments token missing:",
		{
		  httpStatus: response.status
		}
    );

    throw new Error(
      "Global Payments did not return an access token."
    );
  }

  return data;
}

export function isGpAuthenticationError(
  response,
  data
) {
  if (
    response?.status !== 401
  ) {
    return false;
  }

  if (
    data?.error_code !==
    "NOT_AUTHENTICATED"
  ) {
    return false;
  }

  return (
    data?.detailed_error_code ===
      "40001" ||
    data?.detailed_error_code ===
      "40002"
  );
}


export async function fetchWithGpAuthentication(
  env,
  requestFactory
) {
  let tokenData =
    await getAccessToken(
      env
    );

  let response =
    await requestFactory(
      tokenData.token
    );

  let data =
    await response.json();

  if (
    isGpAuthenticationError(
      response,
      data
    )
  ) {
    tokenData =
      await getAccessToken(
        env
      );

    response =
      await requestFactory(
        tokenData.token
      );

    data =
      await response.json();
  }

  return {
    response,
    data
  };
}


// =================================
// FIND TRANSACTION BY REFERENCE
// =================================

export async function getTransactionByReference(
  env,
  reference
) {
  if (
    !reference ||
    typeof reference !== "string"
  ) {
    throw new Error(
      "A Global Payments transaction reference is required."
    );
  }

  const url =
  new URL(
    `${getGpApi(env)}/transactions`
  );

url.searchParams.set(
  "reference",
  reference
);

const {
  response,
  data
} =
  await fetchWithGpAuthentication(
    env,
    token =>
      fetch(
        url.toString(),
        {
          method: "GET",

          headers: {
            "Accept":
              "application/json",

            "Authorization":
              `Bearer ${token}`,

            "X-GP-Version":
              GP_VERSION
          }
        }
      )
  );
  if (!response.ok) {
    console.error(
      "Unable to retrieve Global Payments transactions:",
      {
        httpStatus:
          response.status
      }
    );

    throw new Error(
      "Unable to verify payment with Global Payments."
    );
  }

  return data;
}

// =================================
// VERIFY TRANSACTION BY REFERENCE
// =================================

export async function verifyTransactionByReference(
  env,
  reference,
  transactionId
) {
  if (
    !transactionId ||
    typeof transactionId !== "string"
  ) {
    throw new Error(
      "A Global Payments transaction ID is required."
    );
  }

	const maxAttempts = 10;
	const retryDelayMs = 1000;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    const result =
      await getTransactionByReference(
        env,
        reference
      );

    const transactions =
      Array.isArray(
        result?.transactions
      )
        ? result.transactions
        : [];

    const transaction =
      transactions.find(
        candidate =>
          candidate?.id ===
          transactionId
      );
	  


    /*
     * Only authenticated GP data determines whether
     * the transaction has reached a terminal state.
     */
    if (
      transaction &&
      (
        transaction.status === "CAPTURED" ||
        transaction.status === "DECLINED" ||
        transaction.status === "REVERSED"
      )
    ) {
      return transaction;
    }

    if (attempt < maxAttempts) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            retryDelayMs
          )
      );
    }
  }

  return null;
}

// =================================
// EVALUATE CARD VERIFICATION
// =================================

export function evaluateCardVerification(
  transaction
) {
  const card =
    transaction
      ?.payment_method
      ?.card ||
    {};

  const cvvResult =
    card.cvv_result ??
    null;

  const avsAddressResult =
    card.avs_address_result ??
    null;

  const avsPostalResult =
    card.avs_postal_code_result ??
    null;

  const avsAction =
    card.avs_action ??
    null;

  const cvvMismatch =
    cvvResult ===
    "NOT_MATCHED";

  const avsMismatch =
    avsAddressResult ===
      "NOT_MATCHED" ||
    avsPostalResult ===
      "NOT_MATCHED" ||
    avsAction ===
      "DECLINE";

  return {
    cvvResult,
    avsAddressResult,
    avsPostalResult,
    avsAction,

    cvvMismatch,
    avsMismatch,

    explicitMismatch:
      cvvMismatch ||
      avsMismatch
  };
}

export function decideCapturedPaymentAction({
  idPresent,
  referenceMatches,
  amountMatches,
  currencyMatches,
  paymentCaptured,
  explicitCardMismatch
}) {
  const corePaymentValid =
    idPresent &&
    referenceMatches &&
    amountMatches &&
    currencyMatches;

  if (
    corePaymentValid &&
    paymentCaptured &&
    explicitCardMismatch
  ) {
    return "REVERSE";
  }

  if (
    corePaymentValid &&
    paymentCaptured
  ) {
    return "MARK_PAID";
  }

  return "REJECT";
}
// =================================
// REVERSE TRANSACTION
// =================================

export async function reverseTransaction(
  env,
  {
    transactionId,
    reference
  }
) {
  if (
    !reference ||
    typeof reference !== "string"
  ) {
    throw new Error(
      "A payment reference is required for reversal."
    );
  }

  const transactionIdentifier =
    transactionId &&
    typeof transactionId === "string"
      ? transactionId
      : reference;

    const {
    response,
    data
  } =
    await fetchWithGpAuthentication(
      env,
      token =>
        fetch(
          `${getGpApi(env)}/transactions/${encodeURIComponent(transactionIdentifier)}/reversal`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Accept":
                "application/json",

              "Authorization":
                `Bearer ${token}`,

              "X-GP-Version":
                GP_VERSION,

              "X-GP-Idempotency":
                `reversal-${reference}`
            },

            body:
              JSON.stringify({
                reference:
                  `${reference}-reversal`
              })
          }
        )
    );
  if (!response.ok) {
    console.error(
      "Unable to reverse Global Payments transaction:",
      {
        httpStatus:
          response.status,

        identifierType:
          transactionId
            ? "transaction_id"
            : "reference",

        reference
      }
    );

    throw new Error(
      "Unable to reverse Global Payments transaction."
    );
  }

  return data;
}

// =================================
// CREATE HOSTED PAYMENT PAGE
// =================================
export function getGpErrorCode(
  data
) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }

  return (
    data.error_code ||
    data.code ||
    data.error?.code ||
    data.errors?.[0]?.code ||
    null
  );
}

export function getGpDuplicateResourceId(
  data
) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }

  const description =
    data.detailed_error_description;

  if (
    typeof description !== "string"
  ) {
    return null;
  }

  const match =
    description.match(
      /\bid:\s*([A-Za-z0-9_-]+)/
    );

  return match
    ? match[1]
    : null;
}

async function getHostedPaymentPageById(
  env,
  linkId
) {
    const {
    response,
    data
  } =
    await fetchWithGpAuthentication(
      env,
      token =>
        fetch(
          `${getGpApi(env)}/links/${encodeURIComponent(linkId)}`,
          {
            method: "GET",

            headers: {
              "Accept":
                "application/json",

              "Authorization":
                `Bearer ${token}`,

              "X-GP-Version":
                GP_VERSION
            }
          }
        )
    );
  if (!response.ok) {
    console.error(
      "Unable to recover existing HPP:",
      {
        httpStatus:
          response.status,

        linkId
      }
    );

    throw new Error(
      "Unable to recover hosted checkout."
    );
  }

  return data;
}

export async function createHostedPaymentPage(
  env,
	{
	  amount,
	  currency,
	  reference,
	  email,
	  customerName,
	  address1,
	  address2,
	  city,
	  state,
	  postalCode,
	  country,
	  paymentReturnUrl
	}
) {
	const returnUrlObject =
	  new URL(
		paymentReturnUrl
	  );

	returnUrlObject.searchParams.set(
	  "reference",
	  reference
	);

	const returnUrl =
	  returnUrlObject.toString();

	const expirationDate = new Date(
	  Date.now() + (4 * 60 + 30) * 60 * 1000
	).toISOString();

    const {
    response,
    data
  } =
    await fetchWithGpAuthentication(
      env,
      token =>
        fetch(
          `${getGpApi(env)}/links`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Accept":
                "application/json",

              "Authorization":
                `Bearer ${token}`,

              "X-GP-Version":
                GP_VERSION,

              "X-GP-Idempotency":
                `hpp-${reference}`
            },


			body: JSON.stringify({
			  account_name: "transaction_processing_pbl",
			  type: "payment",
			  usage_mode: "SINGLE",
			  usage_limit: "1",
			  reference,
			  name: "Jekyll Commerce Checkout",
			  description: "Online store purchase",
			  status: "ACTIVE",
			  shippable: "NO",

			  expiration_date: expirationDate,

			  transactions: {
				allowed_payment_methods: ["CARD"],
				amount: String(amount),
				channel: "CNP",
				country: "US",
				currency
			  },

                          notifications: {
				return_url: returnUrl,

				status_url:
				  `${new URL(paymentReturnUrl).origin}/api/webhooks/global-payments`,

				cancel_url:
				  `${env.STORE_FAILED_URL}?reason=cancelled`
			  }
			})

          }
        )
    );

if (!response.ok) {
  const errorCode =
    getGpErrorCode(
      data
    );

  if (
    response.status === 409 &&
    errorCode ===
      "DUPLICATE_ACTION"
  ) {
    const linkId =
      getGpDuplicateResourceId(
        data
      );

    if (!linkId) {
      console.error(
        "Duplicate HPP response missing resource ID:",
        {
          httpStatus:
            response.status,

          errorCode
        }
      );

      throw new Error(
        "Unable to recover hosted checkout."
      );
    }

	const existingLink =
	  await getHostedPaymentPageById(
		env,
		linkId
	  );

    if (
      existingLink.reference !==
      reference
    ) {
      console.error(
        "Recovered HPP reference mismatch:",
        {
          linkId
        }
      );

      throw new Error(
        "Recovered hosted checkout did not match the order."
      );
    }

    if (!existingLink.url) {
      console.error(
        "Recovered HPP URL missing:",
        {
          linkId
        }
      );

      throw new Error(
        "Global Payments did not return a checkout URL."
      );
    }

    return existingLink;
  }

console.error(
  "Unable to create HPP:",
  {
    httpStatus: response.status,
    errorCode,
    contentType: response.headers.get("content-type"),
    providerError: data?.error,
    providerMessage: data?.message,
    providerDescription: data?.detailed_error_description,
    providerErrorCodes: Array.isArray(data?.errors)
      ? data.errors.map(error => error?.code)
      : undefined
  }
);

  throw new Error(
    "Unable to create hosted checkout."
  );
}


  if (!data.url) {
    console.error(
      "Global Payments HPP URL missing:",
    {
      httpStatus: response.status
    }
    );

    throw new Error(
      "Global Payments did not return a checkout URL."
    );
  }


  return data;
}
