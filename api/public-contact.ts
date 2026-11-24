interface Request {
  method?: string;
}
interface Response {
  setHeader(name: string, value: string): void;
  status(code: number): Response;
  json(value: unknown): void;
}
export default async function handler(req: Request, res: Response) {
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600",
  );
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const response = await fetch(
      "https://www.n3xra.com/api/contact-card?slug=quentin-nichols",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error("Unavailable");
    const { card } = await response.json();
    if (!card || card.slug !== "quentin-nichols")
      throw new Error("Unavailable");
    const personal = (card.display_sections || []).find(
      (section: { title: string }) =>
        section.title.toLowerCase() === "personal",
    );
    const personalEmail = personal?.urls
      ?.find(
        (url: unknown) => typeof url === "string" && url.startsWith("mailto:"),
      )
      ?.slice(7);
    return res
      .status(200)
      .json({
        card: { email: card.email, personalEmail, phone: card.phone_e164 },
      });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res
      .status(503)
      .json({ error: "Contact details are temporarily unavailable." });
  }
}
