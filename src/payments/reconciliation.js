import { getTransactionByReference, verifyTransactionByReference, evaluateCardVerification, decideCapturedPaymentAction } from "../global-payments.js";

export async function reconcileCapturedPayment(env, { order, transactionId }) {
  if (!order?.id || !order?.order_reference || !transactionId) return { action: "INVALID_INPUT" };
  if (order.payment_status === "PAID") return { action: order.transaction_id === transactionId ? "ALREADY_PAID" : "STATE_CONFLICT" };
  if (order.payment_status !== "PENDING" || order.transaction_id != null) return { action: "STATE_CONFLICT" };
  const transaction = await verifyTransactionByReference(env, order.order_reference, transactionId);
  if (!transaction) return { action: "UNVERIFIED" };
  const cardVerification = evaluateCardVerification(transaction);
  const decision = decideCapturedPaymentAction({ idPresent: transaction.id === transactionId, referenceMatches: transaction.reference === order.order_reference, amountMatches: /^(0|[1-9]\d*)$/.test(String(transaction.amount)) && /^(0|[1-9]\d*)$/.test(String(order.total)) && BigInt(transaction.amount) === BigInt(order.total), currencyMatches: transaction.currency === order.currency, paymentCaptured: transaction.status === "CAPTURED", explicitCardMismatch: cardVerification.explicitMismatch });
  if (decision !== "MARK_PAID") return { action: decision };
  const result = await env.DB.prepare("UPDATE orders SET payment_status = 'PAID', transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'PENDING' AND transaction_id IS NULL").bind(transaction.id, order.id).run();
  if (Number(result.meta?.changes || 0) === 1) return { action: "MARKED_PAID", transactionId: transaction.id };
  const current = await env.DB.prepare("SELECT payment_status, transaction_id FROM orders WHERE id = ? LIMIT 1").bind(order.id).first();
  return { action: current?.payment_status === "PAID" && current.transaction_id === transaction.id ? "ALREADY_PAID" : "STATE_CONFLICT" };
}

export async function discoverPaymentTransaction(env, reference) {
  if (typeof reference !== "string" || !reference.trim()) return { action: "INVALID_INPUT" };
  const result = await getTransactionByReference(env, reference);
  const transactions = Array.isArray(result?.transactions) ? result.transactions : [];
  const matching = transactions.filter(transaction => transaction?.reference === reference && typeof transaction?.id === "string" && transaction.id.length > 0);
  if (matching.length === 0) return { action: "NOT_FOUND" };
  if (matching.length !== 1) return { action: "AMBIGUOUS" };
  return { action: "FOUND", transactionId: matching[0].id };
}
