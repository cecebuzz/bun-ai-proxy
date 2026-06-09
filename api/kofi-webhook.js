import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const EXPIRY_MS = 35 * 24 * 60 * 60 * 1000; // 35 jours en ms

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── 1. Vérification du token Ko-fi ────────────────────────
  // Ko-fi envoie le payload en application/x-www-form-urlencoded
  // avec un champ "data" contenant un JSON stringifié
  let payload;
  try {
    const raw = req.body?.data;
    if (!raw) return res.status(400).json({ error: "Missing data field" });
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const token = payload.verification_token;
  if (!token || token !== process.env.KOFI_VERIFICATION_TOKEN) {
    return res.status(401).json({ error: "Invalid verification token" });
  }

  // ── 2. Filtrer : uniquement les memberships ───────────────
  // type peut être "Donation", "Subscription", "Shop Order"
  // Ko-fi utilise "Subscription" pour les memberships récurrents
  const type = payload.type;
  if (type !== "Subscription") {
    // Ignorer proprement les dons et commandes shop
    // Ko-fi exige un 200 même pour les événements ignorés, sinon il retry
    return res.status(200).json({ ignored: true, type });
  }

  // ── 3. Récupérer l'email et écrire dans Redis ─────────────
  const email = payload.email?.toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ error: "Missing email in payload" });
  }

  // Expiry = maintenant + 35 jours (timestamp ms)
  // Repousse l'expiry à chaque webhook (premier paiement OU renouvellement)
  const expiry = Date.now() + EXPIRY_MS;

  // Clé Redis : "paid:<email>" — identique à check-access.js et celine.js
  await redis.set(`paid:${email}`, expiry);

  console.log(`[kofi] Access granted: ${email} → expires ${new Date(expiry).toISOString()}`);

  return res.status(200).json({ ok: true, email, expiry });
}
