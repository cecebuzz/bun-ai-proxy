import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const GIFT_CODE = (process.env.GIFT_CODE || "").trim().toUpperCase();
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  // ── CORS ───────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-token");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Récupération du token ──────────────────────────────────
  const rawToken = req.headers["x-access-token"];
  if (!rawToken) return res.status(401).json({ error: "No access token" });

  const token = String(rawToken).trim();

  // ── 1. Comparaison code cadeau (casse normalisée des 2 côtés) ──
  let hasAccess = token.toUpperCase() === GIFT_CODE && GIFT_CODE.length > 0;

  // ── 2. Sinon, vérification email dans Redis ────────────────
  if (!hasAccess) {
    const expiry = await redis.get(`paid:${token.toLowerCase()}`);
    if (expiry && Date.now() < Number(expiry)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) return res.status(403).json({ error: "Access denied" });

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
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Proxy error" });
  }
}
