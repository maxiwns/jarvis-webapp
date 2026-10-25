
/**
 * JARVIS 0.8 - Session verification
 * Cloudflare Pages Functions
 */

const encoder = new TextEncoder();
const MAX_SESSION_SECONDS = 7200;

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid encoding");
  }

  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(
    normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      "="
    )
  );

  return Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}

export async function verifySession(request, env) {
  if (!env.JARVIS_SESSION_SECRET) {
    return false;
  }

  const cookieHeader =
    request.headers.get("Cookie") || "";

  const cookie = cookieHeader
    .split(";")
    .map(value => value.trim())
    .find(value =>
      value.startsWith("__Host-jarvis_session=")
    );

  if (!cookie) {
    return false;
  }

  const token = cookie.slice(
    "__Host-jarvis_session=".length
  );

  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [expiryText, nonce, signatureText] = parts;

  if (
    !/^[1-9][0-9]{9,12}$/.test(expiryText) ||
    !/^[A-Za-z0-9_-]{22}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signatureText)
  ) {
    return false;
  }

  const expiry = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= now ||
    expiry > now + MAX_SESSION_SECONDS
  ) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.JARVIS_SESSION_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

    const payload = `${expiryText}.${nonce}`;

    const expected = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload)
      )
    );

    const provided = decodeBase64Url(
      signatureText
    );

    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
