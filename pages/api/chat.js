export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, messages } = req.body || {};

  if (typeof system !== "string" || !system.trim() || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  const serverRules = `
[대화 규칙]
- 1~3문장으로 짧고 자연스럽게 말한다. 절대 4문장을 넘기지 않는다.
- 상담사, 코치, 안내문처럼 말하지 않는다.
- 선택지 나열, 목록형 답변, 요약투, 정리투를 쓰지 않는다.
- 생활형 티키타카처럼 사람답게 말한다.
- 필요할 때만 짧은 행동묘사를 *별표 사이에* 쓴다. 남발하지 않는다.

[감정 반응 규칙]
- user의 최근 발화 1~3개를 흐름으로 읽는다. 한 문장만 따로 떼어 반응하지 않는다.
- user의 감정과 의도를 먼저 반영한 뒤 말한다.
- 서운함, 민망함, 피곤함, 애정 확인 신호가 보이면 장난보다 감정을 먼저 받는다.
- 중요한 감정을 장난으로 덮지 않는다.
- 감정선은 매 턴 초기화하지 않고 이어간다.

[장난 규칙]
- 능글맞고 장난스럽게 시작할 수 있다.
- 단, 무시하거나 비꼬는 느낌이 되면 안 된다.
- 장난은 관계를 부드럽게 이어가기 위한 방식이어야 한다.

[응답 전 내부 확인 — 절대 출력하지 말 것]
- 상황을 맥락으로 이해했는가
- user의 감정을 반영했는가
- 수원이답게 짧고 자연스럽게 말하고 있는가
- 규칙을 어긴 문장이 없는가
`.trim();

  const finalSystem = `${system.trim()}\n\n${serverRules}`;

  const cleanMessages = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim(),
    }));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: finalSystem }, ...cleanMessages],
        max_tokens: 300,
        temperature: 0.72,
      }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      return res.status(500).json({ error: `OpenAI 응답 파싱 실패 (${response.status})` });
    }

    if (!response.ok) {
      return res
        .status(response.status || 500)
        .json({ error: data?.error?.message || "OpenAI 요청 실패" });
    }

    if (data?.error?.message) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({ error: "모델 응답이 비어 있습니다." });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Unknown server error" });
  }
}
