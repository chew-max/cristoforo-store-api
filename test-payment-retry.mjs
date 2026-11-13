// Test 1 — Authentication failure
globalThis.fetch = async () => {
  return new Response(
    JSON.stringify({ error: "invalid_credentials" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
};

const {
  getTransaction
} = await import("./src/global-payments.js");

try {
  await getTransaction(
    {
      GP_APP_ID: "test-app",
      GP_APP_KEY: "test-key"
    },
    "test-transaction",
    {
      attempts: 1,
      delayMs: 0
    }
  );

  console.log("UNEXPECTED: authentication accepted");
} catch (error) {
  console.log(
    "AUTH EXPECTED ERROR:",
    error.message
  );
}


// Test 2 — Transaction API failure
let call = 0;

globalThis.fetch = async (url) => {
  call++;

  if (url.endsWith("/accesstoken")) {
    return new Response(
      JSON.stringify({
        token: "test-token"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  if (url.includes("/transactions/")) {
    return new Response(
      JSON.stringify({
        error: "test-api-failure"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  throw new Error(
    "Unexpected URL: " + url
  );
};

try {
  await getTransaction(
    {
      GP_APP_ID: "test-app",
      GP_APP_KEY: "test-key"
    },
    "test-transaction",
    {
      attempts: 1,
      delayMs: 0
    }
  );

  console.log("UNEXPECTED: API failure accepted");
} catch (error) {
  console.log(
    "API EXPECTED ERROR:",
    error.message
  );
}