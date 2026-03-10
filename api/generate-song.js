export default async function handler(req, res) {
  const { prompt, tags, lyrics, instrumental } = req.body;

  const response = await fetch("https://api.sonauto.ai/v1/generations/v3", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SONAUTO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      tags,
      lyrics,
      instrumental,
    }),
  });

  const data = await response.json();

  res.status(200).json(data);
}
