export async function verifyGlobalPaymentsSignature(body, signature, appKey) {
  if (typeof appKey !== "string" || !appKey || typeof signature !== "string" || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
  const message = JSON.stringify(body) + appKey;
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(message));
  const expected = new Uint8Array(digest);
  const supplied = new Uint8Array(64);
  for (let i = 0; i < 64; i++) supplied[i] = Number.parseInt(signature.slice(i * 2, i * 2 + 2), 16);
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= expected[i] ^ supplied[i];
  return difference === 0;
}
