export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { system, messages } = req.body;
  if (!system || !messages) return res.status(400).json({ error: "Missing fields" });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 700,
        temperature: 0.92,
      }),
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.status(200).json({ text: data.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
