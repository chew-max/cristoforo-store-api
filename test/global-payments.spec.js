import {
  describe,
  it,
  expect,
  vi,
  afterEach
} from "vitest";

import {
  reverseTransaction,
  evaluateCardVerification,
  decideCapturedPaymentAction,
  getGpErrorCode,
  getGpDuplicateResourceId,
  createHostedPaymentPage,
  isGpAuthenticationError,
  fetchWithGpAuthentication,
  verifyTransactionByReference
} from "../src/global-payments.js";


describe(
  "Global Payments",
  () => {

    afterEach(
      () => {
        vi.restoreAllMocks();
      }
    );


    it(
      "reverses by transaction ID when available",
      async () => {
        const env = {
          PAYMENT_ENV:
            "sandbox",

          GP_APP_ID:
            "test-app",

          GP_APP_KEY:
            "test-key"
        };

        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch"
          );

        fetchMock
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                token:
                  "test-token"
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json"
                }
              }
            )
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                status:
                  "REVERSED"
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json"
                }
              }
            )
          );

        await reverseTransaction(
          env,
          {
            transactionId:
              "TRN_test123",

            reference:
              "order-test123"
          }
        );

        const reversalCall =
          fetchMock.mock.calls[1];

        expect(
          reversalCall[0]
        ).toBe(
          "https://apis.sandbox.globalpay.com/ucp/transactions/TRN_test123/reversal"
        );

        expect(
          reversalCall[1].headers[
            "X-GP-Idempotency"
          ]
        ).toBe(
          "reversal-order-test123"
        );
      }
    );


    it(
      "reverses by merchant reference when transaction ID is unavailable",
      async () => {
        const env = {
          PAYMENT_ENV:
            "sandbox",

          GP_APP_ID:
            "test-app",

          GP_APP_KEY:
            "test-key"
        };

        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch"
          );

        fetchMock
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                token:
                  "test-token"
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json"
                }
              }
            )
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                status:
                  "REVERSED"
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json"
                }
              }
            )
          );

        await reverseTransaction(
          env,
          {
            reference:
              "order-test456"
          }
        );

        const reversalCall =
          fetchMock.mock.calls[1];

        expect(
          reversalCall[0]
        ).toBe(
          "https://apis.sandbox.globalpay.com/ucp/transactions/order-test456/reversal"
        );

        expect(
          reversalCall[1].headers[
            "X-GP-Idempotency"
          ]
        ).toBe(
          "reversal-order-test456"
        );
      }
    );
	it(
  "accepts matched card verification results",
  () => {
    const result =
      evaluateCardVerification({
        payment_method: {
          card: {
            cvv_result:
              "MATCHED",

            avs_address_result:
              "MATCHED",

            avs_postal_code_result:
              "MATCHED",

            avs_action:
              "ACCEPT"
          }
        }
      });

    expect(
      result.explicitMismatch
    ).toBe(false);

    expect(
      result.cvvMismatch
    ).toBe(false);

    expect(
      result.avsMismatch
    ).toBe(false);
  }
);


it(
  "detects an explicit CVV mismatch",
  () => {
    const result =
      evaluateCardVerification({
        payment_method: {
          card: {
            cvv_result:
              "NOT_MATCHED",

            avs_address_result:
              "MATCHED",

            avs_postal_code_result:
              "MATCHED",

            avs_action:
              "ACCEPT"
          }
        }
      });

    expect(
      result.explicitMismatch
    ).toBe(true);

    expect(
      result.cvvMismatch
    ).toBe(true);
  }
);


it(
  "detects an explicit AVS mismatch",
  () => {
    const result =
      evaluateCardVerification({
        payment_method: {
          card: {
            cvv_result:
              "MATCHED",

            avs_address_result:
              "NOT_MATCHED",

            avs_postal_code_result:
              "MATCHED",

            avs_action:
              "DECLINE"
          }
        }
      });

    expect(
      result.explicitMismatch
    ).toBe(true);

    expect(
      result.avsMismatch
    ).toBe(true);
  }
);


it(
  "does not treat unavailable verification results as mismatches",
  () => {
    const result =
      evaluateCardVerification({
        payment_method: {
          card: {
            cvv_result:
              null,

            avs_address_result:
              null,

            avs_postal_code_result:
              null,

            avs_action:
              null
          }
        }
      });

    expect(
      result.explicitMismatch
    ).toBe(false);
  }
);
it(
  "retries HPP creation with a fresh token and preserves idempotency",
  async () => {
    const env = {
      PAYMENT_ENV:
        "sandbox",

      GP_APP_ID:
        "test-app",

      GP_APP_KEY:
        "test-key"
    };

    const fetchMock =
      vi.spyOn(
        globalThis,
        "fetch"
      );

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "token-one"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "NOT_AUTHENTICATED",

            detailed_error_code:
              "40002"
          }),
          {
            status: 401,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "token-two"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id:
              "LNK_auth_retry",

            reference:
              "order-auth-retry",

            url:
              "https://pay.example.com/auth-retry"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      );

    const result =
      await createHostedPaymentPage(
        env,
        {
          amount:
            2999,

          currency:
            "USD",

          reference:
            "order-auth-retry",

          email:
            "customer@example.com",

          customerName:
            "Test Customer",

          address1:
            "123 Test Street",

          address2:
            "",

          city:
            "Test City",

          state:
            "FL",

          postalCode:
            "33543",

          country:
            "US",

          paymentReturnUrl:
            "https://example.com/api/payment-return"
        }
      );

    expect(
      fetchMock
    ).toHaveBeenCalledTimes(
      4
    );

    const firstHppCall =
      fetchMock.mock.calls[1];

    const retriedHppCall =
      fetchMock.mock.calls[3];


const firstPayload = JSON.parse(
  firstHppCall[1].body
);

const retriedPayload = JSON.parse(
  retriedHppCall[1].body
);

expect(firstPayload).toMatchObject({
  account_name: "transaction_processing_pbl",
  type: "payment",
  usage_mode: "SINGLE",
  usage_limit: "1",
  reference: "order-auth-retry",
  status: "ACTIVE",
  shippable: "NO",
  transactions: {
    allowed_payment_methods: ["CARD"],
    amount: "2999",
    channel: "CNP",
    country: "US",
    currency: "USD"
  },
  notifications: {
    return_url:
      "https://example.com/api/payment-return?reference=order-auth-retry"
  }
});

expect(firstPayload).not.toHaveProperty("order");
expect(firstPayload).not.toHaveProperty("payer");

expect(
  Number.isNaN(
    Date.parse(firstPayload.expiration_date)
  )
).toBe(false);

expect(retriedPayload).toEqual(firstPayload);


    expect(
      firstHppCall[1]
        .headers.Authorization
    ).toBe(
      "Bearer token-one"
    );

    expect(
      retriedHppCall[1]
        .headers.Authorization
    ).toBe(
      "Bearer token-two"
    );

    expect(
      firstHppCall[1].headers[
        "X-GP-Idempotency"
      ]
    ).toBe(
      "hpp-order-auth-retry"
    );

    expect(
      retriedHppCall[1].headers[
        "X-GP-Idempotency"
      ]
    ).toBe(
      "hpp-order-auth-retry"
    );

    expect(
      result.reference
    ).toBe(
      "order-auth-retry"
    );

    expect(
      result.url
    ).toBe(
      "https://pay.example.com/auth-retry"
    );
  }
);
it(
  "recovers the existing HPP after DUPLICATE_ACTION",
  async () => {
    const env = {
      PAYMENT_ENV:
        "sandbox",

      GP_APP_ID:
        "test-app",

      GP_APP_KEY:
        "test-key"
    };

    const fetchMock =
      vi.spyOn(
        globalThis,
        "fetch"
      );

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "test-token"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "DUPLICATE_ACTION",

            detailed_error_description:
              "Status Code: 409 - id: LNK_test123 - DUPLICATE_ACTION"
          }),
          {
            status: 409,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
	    .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "recovery-token"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id:
              "LNK_test123",

            reference:
              "order-test123",

            url:
              "https://pay.example.com/test123"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      );

    const result =
      await createHostedPaymentPage(
        env,
        {
          amount:
            2999,

          currency:
            "USD",

          reference:
            "order-test123",

          email:
            "customer@example.com",

          customerName:
            "Test Customer",

          address1:
            "123 Test Street",

          address2:
            "",

          city:
            "Test City",

          state:
            "FL",

          postalCode:
            "33543",

          country:
            "US",

          paymentReturnUrl:
            "https://example.com/api/payment-return"
        }
      );

    expect(
      fetchMock
    ).toHaveBeenCalledTimes(
      4
    );

    const createCall =
      fetchMock.mock.calls[1];

    expect(
      createCall[0]
    ).toBe(
      "https://apis.sandbox.globalpay.com/ucp/links"
    );

    expect(
      createCall[1].headers[
        "X-GP-Idempotency"
      ]
    ).toBe(
      "hpp-order-test123"
    );

    const recoveryCall =
      fetchMock.mock.calls[3];

    expect(
      recoveryCall[0]
    ).toBe(
      "https://apis.sandbox.globalpay.com/ucp/links/LNK_test123"
    );

    expect(
      result.reference
    ).toBe(
      "order-test123"
    );

    expect(
      result.url
    ).toBe(
      "https://pay.example.com/test123"
    );
  }
);


it(
  "rejects a recovered HPP belonging to a different order",
  async () => {
    const env = {
      PAYMENT_ENV:
        "sandbox",

      GP_APP_ID:
        "test-app",

      GP_APP_KEY:
        "test-key"
    };

    const fetchMock =
      vi.spyOn(
        globalThis,
        "fetch"
      );

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "test-token"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "DUPLICATE_ACTION",

            detailed_error_description:
              "Status Code: 409 - id: LNK_test456 - DUPLICATE_ACTION"
          }),
          {
            status: 409,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
	  .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token:
              "recovery-token"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id:
              "LNK_test456",

            reference:
              "order-SOMEONE-ELSE",

            url:
              "https://pay.example.com/wrong-order"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      );

    await expect(
      createHostedPaymentPage(
        env,
        {
          amount:
            2999,

          currency:
            "USD",

          reference:
            "order-test456",

          email:
            "customer@example.com",

          customerName:
            "Test Customer",

          address1:
            "123 Test Street",

          address2:
            "",

          city:
            "Test City",

          state:
            "FL",

          postalCode:
            "33543",

          country:
            "US",

          paymentReturnUrl:
            "https://example.com/api/payment-return"
        }
      )
    ).rejects.toThrow(
      "Recovered hosted checkout did not match the order."
    );

    expect(
      fetchMock
    ).toHaveBeenCalledTimes(
      4
    );
  }
  );
	it("verifies a captured transaction by reference and ID", async () => {
	  const env = {
		PAYMENT_ENV: "sandbox",
		GP_APP_ID: "test-app",
		GP_APP_KEY: "test-key"
	  };

	  const reference = "TEST-CAPTURED-VERIFY-001";
	  const transactionId = "TRN_CAPTURED_001";

	  const fetchMock = vi.spyOn(
		globalThis,
		"fetch"
	  );

	  fetchMock
		.mockResolvedValueOnce(
		  new Response(
			JSON.stringify({
			  token: "test-token"
			}),
			{
			  status: 200,
			  headers: {
				"Content-Type": "application/json"
			  }
			}
		  )
		)
		.mockResolvedValueOnce(
		  new Response(
			JSON.stringify({
			  transactions: [
				{
				  id: transactionId,
				  reference,
				  amount: 2500,
				  currency: "USD",
				  status: "CAPTURED"
				}
			  ]
			}),
			{
			  status: 200,
			  headers: {
				"Content-Type": "application/json"
			  }
			}
		  )
		);

	  const transaction =
		await verifyTransactionByReference(
		  env,
		  reference,
		  transactionId
		);

	  expect(transaction).toMatchObject({
		id: transactionId,
		reference,
		amount: 2500,
		currency: "USD",
		status: "CAPTURED"
	  });

	  expect(fetchMock).toHaveBeenCalledTimes(2);

	  const lookupUrl = new URL(
		fetchMock.mock.calls[1][0]
	  );

	  expect(lookupUrl.pathname).toBe(
		"/ucp/transactions"
	  );

	  expect(
		lookupUrl.searchParams.get("reference")
	  ).toBe(reference);
  });
it("verifies a declined transaction by reference and ID", async () => {
  const env = {
    PAYMENT_ENV: "sandbox",
    GP_APP_ID: "test-app",
    GP_APP_KEY: "test-key"
  };

  const reference = "TEST-DECLINED-VERIFY-001";
  const transactionId = "TRN_DECLINED_001";

  const fetchMock = vi.spyOn(globalThis, "fetch");

  fetchMock
    .mockResolvedValueOnce(
      Response.json({ token: "test-token" })
    )
    .mockResolvedValueOnce(
      Response.json({
        transactions: [{
          id: transactionId,
          reference,
          amount: 2500,
          currency: "USD",
          status: "DECLINED"
        }]
      })
    );

  const transaction = await verifyTransactionByReference(
    env,
    reference,
    transactionId
  );

  expect(transaction).toMatchObject({
    id: transactionId,
    reference,
    amount: 2500,
    currency: "USD",
    status: "DECLINED"
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("rejects verification without a transaction ID", async () => {
  const env = {
    PAYMENT_ENV: "sandbox",
    GP_APP_ID: "test-app",
    GP_APP_KEY: "test-key"
  };

  const fetchMock = vi.spyOn(globalThis, "fetch");

  await expect(
    verifyTransactionByReference(
      env,
      "TEST-MISSING-ID-001",
      null
    )
  ).rejects.toThrow(
    "A Global Payments transaction ID is required."
  );

  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects transactions with a different transaction ID", async () => {
  const env = {
    PAYMENT_ENV: "sandbox",
    GP_APP_ID: "test-app",
    GP_APP_KEY: "test-key"
  };

  const reference = "TEST-ID-MISMATCH-001";

  const fetchMock = vi.spyOn(globalThis, "fetch");

  fetchMock.mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes("/accesstoken")) {
      return Response.json({
        token: "test-token"
      });
    }

    if (url.includes("/transactions?")) {
      return Response.json({
        transactions: [{
          id: "TRN_DIFFERENT",
          reference,
          amount: 2500,
          currency: "USD",
          status: "CAPTURED"
        }]
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  vi.useFakeTimers();

  try {
    const verification =
      verifyTransactionByReference(
        env,
        reference,
        "TRN_EXPECTED"
      );

    const expectation = expect(
      verification
    ).resolves.toBeNull();

    await vi.runAllTimersAsync();
    await expectation;

    const transactionLookups =
	  fetchMock.mock.calls.filter(([url]) =>
		String(url).includes("/transactions?")
	  );

	const authenticationRequests =
	  fetchMock.mock.calls.filter(([url]) =>
		String(url).includes("/accesstoken")
	  );

	expect(transactionLookups).toHaveLength(10);
	expect(authenticationRequests).toHaveLength(10);
  } finally {
    vi.useRealTimers();
  }
});

    }
);

describe(
  "decideCapturedPaymentAction",
  () => {

    const validCapturedPayment = {
      idPresent: true,
      referenceMatches: true,
      amountMatches: true,
      currencyMatches: true,
      paymentCaptured: true
    };

    it(
      "allows a valid captured payment to be marked paid",
      () => {
        expect(
          decideCapturedPaymentAction({
            ...validCapturedPayment,
            explicitCardMismatch: false
          })
        ).toBe("MARK_PAID");
      }
    );

    it(
      "requires reversal when a captured payment has an explicit card verification mismatch",
      () => {
        expect(
          decideCapturedPaymentAction({
            ...validCapturedPayment,
            explicitCardMismatch: true
          })
        ).toBe("REVERSE");
      }
    );

    it(
      "rejects a payment when core payment validation fails",
      () => {
        expect(
          decideCapturedPaymentAction({
            ...validCapturedPayment,
            referenceMatches: false,
            explicitCardMismatch: false
          })
        ).toBe("REJECT");
      }
    );

    it(
      "rejects a payment that is not captured",
      () => {
        expect(
          decideCapturedPaymentAction({
            ...validCapturedPayment,
            paymentCaptured: false,
            explicitCardMismatch: false
          })
        ).toBe("REJECT");
      }
    );

    it(
      "never marks an explicit card verification mismatch as paid",
      () => {
        const action =
          decideCapturedPaymentAction({
            ...validCapturedPayment,
            explicitCardMismatch: true
          });

        expect(
          action
        ).not.toBe("MARK_PAID");

        expect(
          action
        ).toBe("REVERSE");
      }
    );
it("rejects a captured payment when the amount does not match", () => {
  const action = decideCapturedPaymentAction({
    idPresent: true,
    referenceMatches: true,
    amountMatches: false,
    currencyMatches: true,
    paymentCaptured: true,
    explicitCardMismatch: false
  });

  expect(action).not.toBe("MARK_PAID");
  expect(action).toBe("REJECT");
});
  }
);
describe(
  "getGpErrorCode",
  () => {

    it(
      "reads a top-level error_code",
      () => {
        expect(
          getGpErrorCode({
            error_code:
              "DUPLICATE_ACTION"
          })
        ).toBe(
          "DUPLICATE_ACTION"
        );
      }
    );

    it(
      "reads a top-level code",
      () => {
        expect(
          getGpErrorCode({
            code:
              "DUPLICATE_ACTION"
          })
        ).toBe(
          "DUPLICATE_ACTION"
        );
      }
    );

    it(
      "reads a nested error code",
      () => {
        expect(
          getGpErrorCode({
            error: {
              code:
                "DUPLICATE_ACTION"
            }
          })
        ).toBe(
          "DUPLICATE_ACTION"
        );
      }
    );

    it(
      "reads the first errors array code",
      () => {
        expect(
          getGpErrorCode({
            errors: [
              {
                code:
                  "DUPLICATE_ACTION"
              }
            ]
          })
        ).toBe(
          "DUPLICATE_ACTION"
        );
      }
    );

    it(
      "returns null when no error code exists",
      () => {
        expect(
          getGpErrorCode({})
        ).toBeNull();
      }
    );

  }
);
describe(
  "getGpDuplicateResourceId",
  () => {

    it(
      "extracts the original resource ID from a duplicate response",
      () => {
        expect(
          getGpDuplicateResourceId({
            detailed_error_description:
              "Status Code: 409 - id: LNK_test123 - DUPLICATE_ACTION"
          })
        ).toBe(
          "LNK_test123"
        );
      }
    );

    it(
      "supports hyphens and underscores in resource IDs",
      () => {
        expect(
          getGpDuplicateResourceId({
            detailed_error_description:
              "Duplicate action - id: LNK_test-123_ABC"
          })
        ).toBe(
          "LNK_test-123_ABC"
        );
      }
    );

    it(
      "returns null when the duplicate response contains no resource ID",
      () => {
        expect(
          getGpDuplicateResourceId({
            detailed_error_description:
              "DUPLICATE_ACTION"
          })
        ).toBeNull();
      }
    );

    it(
      "returns null when detailed_error_description is missing",
      () => {
        expect(
          getGpDuplicateResourceId({
            code:
              "DUPLICATE_ACTION"
          })
        ).toBeNull();
      }
    );

    it(
      "returns null for invalid input",
      () => {
        expect(
          getGpDuplicateResourceId(
            null
          )
        ).toBeNull();
      }
    );

  }
);

describe(
  "Global Payments authentication recovery",
  () => {
    afterEach(
      () => {
        vi.restoreAllMocks();
      }
    );
    it(
      "recognizes invalid and expired access tokens",
      () => {
        const response = {
          status: 401
        };

        expect(
          isGpAuthenticationError(
            response,
            {
              error_code:
                "NOT_AUTHENTICATED",

              detailed_error_code:
                "40001"
            }
          )
        ).toBe(true);

        expect(
          isGpAuthenticationError(
            response,
            {
              error_code:
                "NOT_AUTHENTICATED",

              detailed_error_code:
                "40002"
            }
          )
        ).toBe(true);
      }
    );


    it(
      "does not retry unrelated authentication errors",
      () => {
        expect(
          isGpAuthenticationError(
            {
              status: 403
            },
            {
              error_code:
                "ACTION_NOT_AUTHORIZED",

              detailed_error_code:
                "40003"
            }
          )
        ).toBe(false);

        expect(
          isGpAuthenticationError(
            {
              status: 401
            },
            {
              error_code:
                "NOT_AUTHENTICATED",

              detailed_error_code:
                "40142"
            }
          )
        ).toBe(false);
      }
    );


  it(
  "regenerates an expired access token and retries once",
  async () => {
    const fetchSpy =
      vi.spyOn(
        globalThis,
        "fetch"
      );

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-one"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "NOT_AUTHENTICATED",
            detailed_error_code:
              "40002"
          }),
          {
            status: 401,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-two"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "CAPTURED"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      );

    const requestFactory =
      token =>
        fetch(
          "https://example.test/resource",
          {
            headers: {
              "Authorization":
                `Bearer ${token}`
            }
          }
        );

    const result =
      await fetchWithGpAuthentication(
        {
          PAYMENT_ENV:
            "sandbox",
          GP_APP_ID:
            "test-app",
          GP_APP_KEY:
            "test-key"
        },
        requestFactory
      );

    expect(
      result.response.status
    ).toBe(200);

    expect(
      result.data.status
    ).toBe("CAPTURED");

    expect(
      fetchSpy
    ).toHaveBeenCalledTimes(4);

    expect(
      fetchSpy.mock.calls[1][1]
        .headers.Authorization
    ).toBe(
      "Bearer token-one"
    );

    expect(
      fetchSpy.mock.calls[3][1]
        .headers.Authorization
    ).toBe(
      "Bearer token-two"
    );
  }
);


it(
  "retries an expired access token only once",
  async () => {
    const fetchSpy =
      vi.spyOn(
        globalThis,
        "fetch"
      );

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-one"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "NOT_AUTHENTICATED",
            detailed_error_code:
              "40002"
          }),
          {
            status: 401,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-two"
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error_code:
              "NOT_AUTHENTICATED",
            detailed_error_code:
              "40002"
          }),
          {
            status: 401,
            headers: {
              "Content-Type":
                "application/json"
            }
          }
        )
      );

    const requestFactory =
      token =>
        fetch(
          "https://example.test/resource",
          {
            headers: {
              "Authorization":
                `Bearer ${token}`
            }
          }
        );

    const result =
      await fetchWithGpAuthentication(
        {
          PAYMENT_ENV:
            "sandbox",
          GP_APP_ID:
            "test-app",
          GP_APP_KEY:
            "test-key"
        },
        requestFactory
      );

    expect(
      result.response.status
    ).toBe(401);

    expect(
      result.data
        .detailed_error_code
    ).toBe("40002");

    expect(
      fetchSpy
    ).toHaveBeenCalledTimes(4);
  }

);

  }
);
