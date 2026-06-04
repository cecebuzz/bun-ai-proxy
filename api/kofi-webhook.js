import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const VERIF_TOKEN = process.env.KOFI_VERIFICATION_TOKEN;

// Durée d'accès accordée après un paiement (35 jours = 1 mois + marge)
const ACCESS_DAYS = 35;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Ko-fi envoie les données dans un champ "data" encodé en form-urlencoded
    const raw = req.body?.data;
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!payload) return res.status(400).json({ error: "No data" });

    // Sécurité : on vérifie que la notif vient bien de TON Ko-fi
    if (payload.verification_token !== VERIF_TOKEN) {
      return res.status(401).json({ error: "Bad token" });
    }

    // On ne traite que les abonnements (Subscription)
    const email = (payload.email || "").trim().toLowerCase();
    const tier = payload.tier_name || "";
    const isSub = payload.type === "Subscription" || payload.is_subscription_payment;

    // Accès accordé si abonnement à un de tes tiers Bun AI
    const grants = /bun ai|bunny behaviour/i.test(tier);

    if (email && isSub && grants) {
      const expires = Date.now() + ACCESS_DAYS * 86400000;
      await redis.set(`paid:${email}`, expires);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: true }); // toujours répondre 200 à Ko-fi
  }
}
