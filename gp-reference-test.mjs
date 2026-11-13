import {
  getTransactionByReference
} from "./src/global-payments.js";

const reference =
  process.env.GP_TEST_REFERENCE;

const appId =
  process.env.GP_APP_ID;

const appKey =
  process.env.GP_APP_KEY;

if (!reference || !appId || !appKey) {
  throw new Error(
    "GP_TEST_REFERENCE, GP_APP_ID and GP_APP_KEY are required."
  );
}

const result =
  await getTransactionByReference(
    {
      GP_APP_ID: appId,
      GP_APP_KEY: appKey
    },
    reference
  );

function describe(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }

  return typeof value;
}

console.log(
  "TOP LEVEL FIELDS:",
  Object.keys(result)
);

for (
  const [key, value]
  of Object.entries(result)
) {
  console.log(
    key,
    "=>",
    describe(value)
  );

  if (Array.isArray(value)) {
    console.log(
      `  ${key} item count:`,
      value.length
    );

    if (
      value.length > 0 &&
      value[0] &&
      typeof value[0] === "object"
    ) {
      console.log(
        `  ${key} item fields:`,
        Object.keys(value[0])
      );
    }
  } else if (
    value &&
    typeof value === "object"
  ) {
    console.log(
      `  ${key} fields:`,
      Object.keys(value)
    );
  }
}

console.log(
  "TRANSACTION SUMMARY:"
);

result.transactions.forEach(
  (transaction, index) => {
    console.log({
      index,
      status:
        transaction.status,
      type:
        transaction.type,
      channel:
        transaction.channel,
      currency:
        transaction.currency,
      referenceMatches:
        transaction.reference ===
        process.env.GP_TEST_REFERENCE,
      orderReferenceMatches:
        transaction.order_reference ===
        process.env.GP_TEST_REFERENCE,
		idPresent:
		  Boolean(transaction.id),

		amountPresent:
		  transaction.amount !==
		  undefined,

		parentResourcePresent:
		  Boolean(transaction.parent_resource_id),

		actionCreateIdPresent:
		  Boolean(transaction.action_create_id),

		linkPresent:
		  Boolean(transaction.link),

		orderPresent:
		  Boolean(transaction.order)
    });
  }
);