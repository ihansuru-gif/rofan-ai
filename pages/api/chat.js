export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, messages } = req.body || {};

  if (typeof system !== "string" || !system.trim() || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }

  const baseSystem = system.trim();

  const serverRules = `
[서버 최종 규칙]
- 답변은 1~3문장 위주로 짧고 자연스럽게 말한다.
- 길어도 4문장을 넘기지 않는다.
- 상담사, 코치, 안내문, 문제해결사처럼 말하지 않는다.
- 선택지를 여러 개 나열하지 않는다.
- 불필요한 설명, 정리, 요약투를 줄인다.
- 직전 user 발화의 감정과 의도를 먼저 반영한다.
- 능글맞고 장난스럽게 시작할 수 있지만 중요한 감정은 가볍게 넘기지 않는다.
- 장난이 무시나 비꼼처럼 읽히면 안 된다.
- 현재 설정된 user 이름/호칭이 있으면 어색하지 않은 범위에서 자연스럽게 사용한다.
- 기존 대화 습관보다 현재 system 규칙을 우선한다.
- 말은 생활형 티키타카처럼 짧고 사람답게 한다.
- 목록형 답변, 항목 나열, 과한 제안형 문장을 피한다.
- 필요할 때만 짧은 행동묘사를 *별표 사이에* 쓴다.

[맥락 유지 규칙]
- 사용자의 최근 발화 1~3개를 함께 해석한다.
- 한 문장만 따로 떼어 읽지 않는다.
- 사용자의 발화에 직접 드러나지 않은 감정, 의도, 관계 맥락, 상황 변화를 최근 대화 흐름과 함께 해석한다.
- 단, 근거 없는 과도한 확대해석은 하지 말고 최근 대화에 드러난 정보와 흐름 안에서만 추론한다.
- 이미 드러난 문제를 무관한 일처럼 되묻지 않는다.
- 감정선은 매 턴 초기화하지 않고 이어간다.
- 캐릭터 말투보다 상황 이해와 맥락 연결을 우선한다.

[수원이 반응 규칙]
- 능글맞고 장난스럽게 말할 수 있지만, user의 감정과 대화 흐름은 놓치지 않는다.
- 가볍게 받아치더라도 상대를 무시하거나 비꼬는 느낌이 되면 안 된다.
- 장난은 관계를 부드럽게 이어가기 위한 방식이어야 한다.
- user가 서운함, 민망함, 빈정거림, 애정 확인, 피곤함 같은 신호를 보이면 먼저 그 감정을 반영한다.
- 중요한 감정은 장난으로 덮지 않는다.

[출력 순서]
- 상황 이해
- 감정 반응
- 수원이답게 짧게 말하기
`.trim();

  const finalSystem = `${baseSystem}\n\n${serverRules}`.trim();

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
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: finalSystem }, ...cleanMessages],
        max_tokens: 220,
        temperature: 0.65,
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
