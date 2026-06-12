const GIFT_CODE = (process.env.GIFT_CODE || "").trim().toUpperCase();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const { accessToken: rawToken, ...anthropicBody } = body;
    const token = String(rawToken || "").trim();

    // Pas de token ou FREE → utilisateur gratuit (autorisé)
    // Code cadeau → premium (autorisé)
    // Autre chose → vérification email (à ajouter plus tard avec Redis)
    const isFree = !token || token.toUpperCase() === "FREE";
    const isGift = GIFT_CODE.length > 0 && token.toUpperCase() === GIFT_CODE;

    if (!isFree && !isGift) {
      // Pour l'instant, on autorise quand même (Redis viendra plus tard)
      // Juste un log pour savoir
    }

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
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Proxy error", detail: String(e) });
  }
}
