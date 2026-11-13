import { describe, it, expect } from "vitest";
import { fulfillOrder } from "../src/fulfillment/index.js";

describe("Fulfillment environment isolation", () => {
  const invalidEnvironments = [
    { APP_ENV: "sandbox", PAYMENT_ENV: "sandbox" },
    { APP_ENV: "production", PAYMENT_ENV: "sandbox" },
    { APP_ENV: "sandbox", PAYMENT_ENV: "production" },
    { APP_ENV: "production" },
    { PAYMENT_ENV: "production" },
    {}
  ];

  for (const env of invalidEnvironments) {
    it(`rejects unsafe environment ${JSON.stringify(env)}`, async () => {
      await expect(fulfillOrder(env, null, [])).rejects.toThrow("Fulfillment requires production application and payment environments.");
    });
  }

  it("allows matching production environments to reach order validation", async () => {
    await expect(fulfillOrder({ APP_ENV: "production", PAYMENT_ENV: "production" }, null, [])).rejects.toThrow("Order is required.");
  });
});
