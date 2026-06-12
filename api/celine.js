// v3
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const GIFT_CODE = (process.env.GIFT_CODE || "").trim().toUpperCase();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const FREE_DAILY_LIMIT = 3;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, status, body) {
  setCors(res);
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  // ── Extraire le token du body (plus de header custom) ──────
  const { accessToken: rawToken, ...anthropicBody } = req.body || {};

  if (!rawToken) return send(res, 401, { error: "No access token" });

  const token = String(rawToken).trim();

  // ── 1. Token FREE — utilisateur gratuit ───────────────────
  if (token.toUpperCase() === "FREE") {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.headers["x-real-ip"]
      || "unknown";
    const key = `free:${ip}`;
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, 60 * 60 * 24);
    if (used > FREE_DAILY_LIMIT) {
      return send(res, 403, { error: "Free limit reached" });
    }
  } else {
    // ── 2. Code cadeau ─────────────────────────────────────
    let hasAccess = GIFT_CODE.length > 0 && token.toUpperCase() === GIFT_CODE;

    // ── 3. Email premium dans Redis ────────────────────────
    if (!hasAccess) {
      const expiry = await redis.get(`paid:${token.toLowerCase()}`);
      if (expiry && Date.now() < Number(expiry)) hasAccess = true;
    }

    if (!hasAccess) return send(res, 403, { error: "Access denied" });
  }

  // ── Appel Anthropic (sans le accessToken dans le body) ─────
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
    const data = await r.json();
    return send(res, r.status, data);
  } catch (e) {
    return send(res, 500, { error: "Proxy error" });
  }
}
