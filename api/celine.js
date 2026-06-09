import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const GIFT_CODE = process.env.GIFT_CODE; // ex: "BUN41BW"
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // ex: "https://bun-ai.vercel.app"

export default async function handler(req, res) {
  // ── CORS : uniquement ton domaine ──────────────────────────
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-token");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Vérification du token d'accès ──────────────────────────
  const token = req.headers["x-access-token"];
  if (!token) return res.status(401).json({ error: "No access token" });

  const isGiftCode = token.toUpperCase() === GIFT_CODE;
  let hasAccess = isGiftCode;

  if (!hasAccess) {
    // Vérifie l'email dans Redis — clé : "paid:<email>", valeur : timestamp d'expiry
    const expiry = await redis.get(`paid:${token.toLowerCase()}`);
    if (expiry && Date.now() < Number(expiry)) {
      hasAccess = true;
    }
  }

  if (!hasAccess) return res.status(403).json({ error: "Access denied" });

  // ── Appel Anthropic ────────────────────────────────────────
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
