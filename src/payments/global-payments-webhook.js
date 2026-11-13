import { reconcileCapturedPayment } from "./reconciliation.js";
import { verifyGlobalPaymentsSignature } from "./global-payments-signature.js";

export async function handleGlobalPaymentsWebhook(request, env) {
  const headers = { "Cache-Control": "no-store" };
  const respond = (body, status) => Response.json(body, { status, headers });

  if (!((env.APP_ENV === "sandbox" && env.PAYMENT_ENV === "sandbox") || (env.APP_ENV === "production" && env.PAYMENT_ENV === "production"))) return respond({ error: "Not found." }, 404);
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return respond({ error: "Unsupported content type." }, 415);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return respond({ error: "Payload too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "Invalid JSON." }, 400);
  }

  const signature = request.headers.get("X-GP-Signature");
  if (!await verifyGlobalPaymentsSignature(body, signature, env.GP_APP_KEY)) return respond({ error: "Invalid webhook signature." }, 401);

  const reference = body?.reference;
  const transactionId = body?.id;
  if (typeof reference !== "string" || !/^order-[a-f0-9-]{36}$/.test(reference) || typeof transactionId !== "string" || !/^TRN_[A-Za-z0-9_-]{8,100}$/.test(transactionId)) return respond({ error: "Invalid transaction identifiers." }, 400);

  try {
    const order = await env.DB.prepare("SELECT id, order_reference, total, currency, payment_status, transaction_id FROM orders WHERE order_reference = ? LIMIT 1").bind(reference).first();
    if (!order) return respond({ error: "Order not found." }, 404);
    const result = await reconcileCapturedPayment(env, { order, transactionId });
    if (result.action === "MARKED_PAID" || result.action === "ALREADY_PAID") return respond({ received: true, action: result.action }, 200);
    if (result.action === "UNVERIFIED") return respond({ received: false, action: result.action }, 503);
    return respond({ received: false, action: result.action }, 409);
  } catch (error) {
    console.error("GLOBAL PAYMENTS WEBHOOK ERROR", error?.message || String(error));
    return respond({ error: "Payment verification unavailable." }, 503);
  }
}
