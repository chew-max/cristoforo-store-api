import { it, expect, vi, beforeAll } from "vitest";
import {
  env,
  createExecutionContext,
  applyD1Migrations
} from "cloudflare:test";

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS
  );
});
import worker from "../src";

it("rejects a verified captured payment with an incorrect amount without changing the D1 order", async () => {
  const reference = "TEST-FETCH-DIAGNOSTIC-001";
  const transactionId = "TRN_DIAGNOSTIC_001";
  await env.DB.prepare("INSERT INTO orders (order_reference,email,subtotal,total,currency,payment_status) VALUES (?,?,?,?,?,?)").bind(reference,"test@example.com",2500,2500,"USD","PENDING").run();
  const fetchSpy = vi.spyOn(globalThis,"fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/accesstoken")) return Response.json({token:"test-token"});
    if (url.includes("/transactions?")) return Response.json({transactions:[{id:transactionId,reference,amount:2400,currency:"USD",status:"CAPTURED"}]});
    throw new Error(`Unexpected request: ${url}`);
  });
  try {
    const request = new Request(`http://example.com/api/payment-return?reference=${reference}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:transactionId,reference})});
    const response = await worker.fetch(request,{...env,APP_ENV:"sandbox",PAYMENT_ENV:"sandbox"},createExecutionContext());
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const html = await response.text();
    expect(html).toContain("/checkout/failed/");
    const order = await env.DB.prepare("SELECT payment_status,transaction_id,fulfillment_status FROM orders WHERE order_reference = ?").bind(reference).first();
    expect(order.payment_status).toBe("PENDING");
    expect(order.transaction_id).toBeNull();
    expect(order.fulfillment_status).toBe("PENDING");
  } finally { fetchSpy.mockRestore(); }
});
