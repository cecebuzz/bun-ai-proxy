import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const GIFT_CODE = (process.env.GIFT_CODE || "").trim().toUpperCase();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-token");
}

function send(res, status, body) {
  setCors(res);
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  // ── Token d'accès ──────────────────────────────────────────
  const rawToken = req.headers["x-access-token"];
  if (!rawToken) {
    // DEBUG TEMPORAIRE — montre ce que le proxy reçoit réellement
    return send(res, 401, {
      error: "No access token",
      debug: {
        receivedHeaders: Object.keys(req.headers),
        hasToken: "x-access-token" in req.headers,
        tokenValue: req.headers["x-access-token"] || null,
        method: req.method,
        giftCodeSet: GIFT_CODE.length > 0,
      },
    });
  }

  const token = String(rawToken).trim();

  // ── 1. Code cadeau ─────────────────────────────────────────
  let hasAccess = GIFT_CODE.length > 0 && token.toUpperCase() === GIFT_CODE;

  // ── 2. Sinon, email dans Redis ─────────────────────────────
  if (!hasAccess) {
    const expiry = await redis.get(`paid:${token.toLowerCase()}`);
    if (expiry && Date.now() < Number(expiry)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    // DEBUG TEMPORAIRE — token reçu mais refusé
    return send(res, 403, {
      error: "Access denied",
      debug: {
        tokenReceived: token,
        tokenUpper: token.toUpperCase(),
        giftCode: GIFT_CODE,
        giftCodeSet: GIFT_CODE.length > 0,
        match: token.toUpperCase() === GIFT_CODE,
      },
    });
  }

  // ── 3. Appel Anthropic ─────────────────────────────────────
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    return send(res, r.status, data);
  } catch (e) {
    return send(res, 500, { error: "Proxy error" });
  }
}
