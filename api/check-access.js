import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(200).json({ access: false });

    const expires = await redis.get(`paid:${email}`);
    // accès valide si une date existe ET qu'elle n'est pas dépassée
    const access = expires && Number(expires) > Date.now();

    return res.status(200).json({ access: !!access });
  } catch (e) {
    return res.status(200).json({ access: false });
  }
}
