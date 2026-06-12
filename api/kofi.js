import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const EXPIRY_MS = 35 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  if (payload.type !== "Subscription") {
    return res.status(200).json({ ignored: true, type: payload.type });
  }

  const email = payload.email?.toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  const expiry = Date.now() + EXPIRY_MS;
  await redis.set("paid:" + email, expiry);

  return res.status(200).json({ ok: true, email, expiry });
}
