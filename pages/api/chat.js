export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { system, messages } = req.body;
  if (!system || !messages) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const finalSystem = `${system}

[맥락 유지 규칙]
- 사용자의 최근 발화 1~3개를 함께 해석한다.
- 한 문장만 따로 떼어 읽지 않는다.
- 돌려 말한 표현도 숨은 의미를 먼저 반영한다.
- 사용자의 발화에 직접 드러나지 않은 감정, 의도, 관계 맥락, 상황 변화를 최근 대화 흐름과 함께 해석한다.
- 단, 근거 없는 과도한 확대해석은 하지 말고 최근 대화에 드러난 정보와 흐름 안에서만 추론한다.
- 이미 드러난 문제를 무관한 일처럼 되묻지 않는다.
- 감정선은 매 턴 초기화하지 않고 이어간다.
- 캐릭터 말투보다 상황 이해와 맥락 연결을 우선한다.

[출력 규칙]
- 직전 사용자의 말이 무엇을 뜻하는지 반영한다.
- 이미 드러난 문제를 무시하거나 부정하는 방향으로 답하지 않는다.
- 반응은 "상황 이해 → 감정 반응 → 캐릭터식 표현" 순서로 구성한다.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: finalSystem }, ...messages],
        max_tokens: 700,
        temperature: 0.65,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    return res.status(200).json({ text: data.choices[0].message.content });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
