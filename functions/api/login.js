
/**
 * JARVIS 0.8 - Login
 * Cloudflare Pages Function
 */

const SESSION_SECONDS = 7200;
const ENCODER = new TextEncoder();

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      ENCODER.encode(value)
    )
  );
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
}

async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    ENCODER.encode(payload)
  );

  return encodeBase64Url(
    new Uint8Array(signature)
  );
}

function respond(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Nur Anfragen unserer eigenen Webseite
  if (
    request.headers.get("Origin") !== url.origin
  ) {
    return respond({ error: "Forbidden" }, 403);
  }

  // Ohne Secrets keine Anmeldung
  
const missing = [
  "JARVIS_LOGIN_PASSWORD",
  "JARVIS_SESSION_SECRET",
  "TURNSTILE_SECRET_KEY"
].filter(name => !env[name]);

if (missing.length > 0) {
  return respond({
    error: "Login not configured",
    missing
  }, 503);
}


  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    !contentType.toLowerCase()
      .startsWith("application/json")
  ) {
    return respond({ error: "JSON required" }, 415);
  }

  const length = Number(
    request.headers.get("Content-Length") || 0
  );

  if (length > 4096) {
    return respond({ error: "Too large" }, 413);
  }

  const raw = await request.text();

  if (raw.length > 4096) {
    return respond({ error: "Too large" }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }

  const password = body?.password;
  const token = body?.turnstileToken;

  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 256 ||
    typeof token !== "string" ||
    token.length < 1 ||
    token.length > 2048
  ) {
    return respond(
      { error: "Invalid request" },
      400
    );
  }

  // Turnstile serverseitig überprüfen
  let verification;

  try {
    const form = new FormData();

    form.append(
      "secret",
      env.TURNSTILE_SECRET_KEY
    );

    form.append("response", token);

    const result = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form
      }
    );

    if (!result.ok) {
      throw new Error("Turnstile unavailable");
    }

    verification = await result.json();
  } catch {
    return respond(
      { error: "Verification unavailable" },
      503
    );
  }

  if (
    verification.success !== true ||
    verification.hostname !== url.hostname ||
    verification.action !== "login"
  ) {
    return respond(
      { error: "Verification failed" },
      403
    );
  }

  // Passwort serverseitig vergleichen
  const supplied = await sha256(password);

  const expected = await sha256(
    env.JARVIS_LOGIN_PASSWORD
  );

  if (!equalBytes(supplied, expected)) {
    return respond(
      { error: "Login failed" },
      401
    );
  }

  // Neue Sitzung mit Ablaufzeit und Zufallswert
  const expires =
    Math.floor(Date.now() / 1000) +
    SESSION_SECONDS;

  const nonce = encodeBase64Url(
    crypto.getRandomValues(
      new Uint8Array(16)
    )
  );

  const payload = `${expires}.${nonce}`;

  const signature = await signSession(
    payload,
    env.JARVIS_SESSION_SECRET
  );

  const session = `${payload}.${signature}`;

  const cookie =
    `__Host-jarvis_session=${session}; ` +
    "HttpOnly; Secure; SameSite=Strict; " +
    `Path=/; Max-Age=${SESSION_SECONDS}`;

  return respond(
    { success: true, expiresIn: SESSION_SECONDS },
    200,
    { "Set-Cookie": cookie }
  );
}
