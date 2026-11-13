import { describe, it, expect, beforeAll, vi } from "vitest";
import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("Scheduled fulfillment recovery cutoff", () => {
  async function checkRecovery(cutoff, reference) {
    await env.DB.prepare("INSERT INTO orders (order_reference,email,subtotal,total,currency,payment_status,fulfillment_status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(reference,"recovery-test@example.com",2500,2500,"USD","PAID","PENDING","2026-09-08 12:00:00").run();
    const ctx = createExecutionContext();
    const testEnv = { ...env, APP_ENV: "production", PAYMENT_ENV: "production" };
    if (cutoff !== undefined) testEnv.FULFILLMENT_RECOVERY_CUTOFF = cutoff;
    else delete testEnv.FULFILLMENT_RECOVERY_CUTOFF;
    await worker.scheduled({ scheduledTime: Date.now(), cron: "*/30 * * * *" }, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const order = await env.DB.prepare("SELECT fulfillment_status,fulfillment_attempts,fulfillment_order_id FROM orders WHERE order_reference = ?").bind(reference).first();
    expect(order.fulfillment_status).toBe("PENDING");
    expect(order.fulfillment_attempts).toBe(0);
    expect(order.fulfillment_order_id).toBeNull();
  }

  it("does not recover orders when cutoff is missing", async () => {
    await checkRecovery(undefined,"RECOVERY-CUTOFF-MISSING-001");
  });

  it("does not recover orders when cutoff is invalid", async () => {
    await checkRecovery("invalid","RECOVERY-CUTOFF-INVALID-001");
  });

  it("does not recover historical orders before the cutoff", async () => {
    await checkRecovery("2099-01-01T00:00:00Z","RECOVERY-CUTOFF-HISTORICAL-001");
  });

  it("claims an eligible order once without resubmitting", async () => {
    const networkSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Unexpected external network request"); });
    try {
    const reference = "RECOVERY-ELIGIBLE-ONCE-001";
    await env.DB.prepare("INSERT INTO orders (order_reference,email,subtotal,total,currency,payment_status,fulfillment_status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(reference,"recovery-test@example.com",2500,2500,"USD","PAID","PENDING","2026-11-07 03:00:00").run();
    const testEnv = { ...env, APP_ENV: "production", PAYMENT_ENV: "production", FULFILLMENT_RECOVERY_CUTOFF: "2026-11-07T02:00:00Z", EMAIL_PROVIDER: "resend", STORE_ADMIN_EMAIL: "recovery-test@example.com" };
    for (let run = 0; run < 2; run++) {
      const ctx = createExecutionContext();
      await worker.scheduled({ scheduledTime: Date.now(), cron: "*/30 * * * *" }, testEnv, ctx);
      await waitOnExecutionContext(ctx);
    }
    const order = await env.DB.prepare("SELECT fulfillment_status,fulfillment_attempts,fulfillment_order_id,fulfillment_error FROM orders WHERE order_reference = ?").bind(reference).first();
    expect(order.fulfillment_status).toBe("FAILED");
    expect(order.fulfillment_attempts).toBe(1);
    expect(order.fulfillment_order_id).toBeNull();
    expect(order.fulfillment_error).toContain("Order has no fulfillment items.");
    expect(networkSpy).not.toHaveBeenCalled();
    } finally {
      networkSpy.mockRestore();
    }
  });
});
