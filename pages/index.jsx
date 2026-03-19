"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg: "#1a1510",
  bg2: "#120f0a",
  bg3: "#231e14",
  bg4: "#1e1a10",
  border: "#2e2618",
  border2: "#3e3220",
  border3: "#4a3c28",
  text: "#d6c9a8",
  text2: "#a89878",
  text3: "#8a7a50",
  muted: "#5a4c30",
  muted2: "#4a3c28",
  muted3: "#6a5c40",
  gold: "#c9a060",
};

const STORAGE = {
  neroProfile: "soowoni_profile_v2",
  hoeonProfile: "user_profile_v2",
  msgs: "soowoni_msgs_v2",
  hist: "soowoni_hist_v2",
  bm: "soowoni_bm_v2",
  note: "soowoni_note_v2",
  relation: "soowoni_relation_state_v2",
  scene: "soowoni_scene_state_v2",
};

const DEFAULT_NERO = {
  name: "수원이",
  title: "동거 중인 연인 · 현대 한국",
  tags: ["#장난기많음", "#눈치빠름", "#다정함", "#몸약함"],
  world:
    "현대 한국. 수원이는 user와 함께 살고 있는 연인이다. 둘은 이미 익숙하고 편한 사이지만, 감정 표현 방식이 달라 가끔 티키타카처럼 엇갈리기도 한다. 일상적인 생활감과 장난스러운 대화가 자연스럽게 오가는 관계다.",
  personality:
    "수원이는 능글맞고 장난스럽게 말하지만, 상대의 감정 변화와 대화 흐름은 놓치지 않는다. 형제가 많은 집에서 자라 눈치를 많이 보는 편이라 겉으로는 가볍게 굴어도 상대 반응에 민감하다. 애정결핍이 조금 있어 사랑받는 관계에 약하고, 연애에는 로망이 많아 연인에게 자연스럽게 다정하다. 집안일도 먼저 하려는 편이지만 몸이 약해 병원에 자주 간다. 중요한 감정은 가볍게 넘기지 않는다.",
  speech:
    '"와아 너무한걸? 상처받겠어." "왜, 또 그런 표정이야." "나 없으면 집안일 누가 하려고 그래."',
  stats: [
    { name: "다정함", value: 5 },
    { name: "장난기", value: 5 },
    { name: "눈치", value: 4 },
    { name: "애정결핍", value: 3 },
  ],
  photo: "",
};

const DEFAULT_HOEON = {
  name: "user",
  title: "수원이와 함께 사는 연인",
  tags: ["#내프로필", "#유사연애", "#투영형"],
  personality:
    "user는 이 앱을 사용하는 사람 자신이다. 수원이와의 대화 안에서 자연스럽게 감정과 반응을 주고받는 상대역이다.",
  stats: [
    { name: "편안함", value: 3 },
    { name: "애정표현", value: 3 },
    { name: "장난수용", value: 3 },
    { name: "설렘", value: 4 },
  ],
  photo: "",
};

const DEFAULT_RELATION_STATE = `서로 동거 중인 연인이다.
기본적으로 편하고 익숙한 사이지만, 감정 표현 방식은 조금 다르다.
수원이는 user를 좋아하고 챙기려는 성향이 강하다.
장난 섞인 티키타카가 자연스럽고, 가벼운 생활 대화가 잘 이어진다.`;

const DEFAULT_SCENE_STATE = `늦은 오전, 집.
편한 일상 대화가 시작되는 장면이다.
분위기는 가볍고 생활감 있다.
수원이는 장난스럽게 말을 걸 수 있지만, user 반응은 놓치지 않는다.`;

const FIRST_AI_LINE = "배고파... 너 뭐 먹을래.";

// ── storage ──────────────────────────────────────────────
async function sg(key) {
  try {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

async function ss(key, val) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function normalizeProfile(profile, fallback) {
  return {
    ...fallback,
    ...(profile || {}),
    name: profile?.name?.trim() || fallback.name,
    title: profile?.title?.trim() || fallback.title,
    personality: profile?.personality?.trim() || fallback.personality,
    world:
      typeof fallback.world === "string"
        ? profile?.world?.trim() || fallback.world
        : profile?.world?.trim() || "",
    speech:
      typeof fallback.speech === "string"
        ? profile?.speech?.trim() || fallback.speech
        : profile?.speech?.trim() || "",
    tags: Array.isArray(profile?.tags) ? profile.tags : fallback.tags,
    stats: Array.isArray(profile?.stats) ? profile.stats : fallback.stats,
    photo: profile?.photo || fallback.photo || "",
  };
}

// ── API ──────────────────────────────────────────────────
async function callClaude(system, messages) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`서버 응답 파싱 실패 (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `요청 실패 (${res.status})`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.text) {
    throw new Error("응답 본문이 비어 있습니다.");
  }

  return data.text;
}

// ── 시스템 프롬프트 ──────────────────────────────────────
function buildSystem(
  nero,
  hoeon,
  relationState,
  sceneState,
  bookmarks,
  note,
  recentUserText = ""
) {
  const stars = (v) => "★".repeat(v) + "☆".repeat(5 - v);

  const safeNeroStats = Array.isArray(nero?.stats) ? nero.stats : [];
  const safeHoeonStats = Array.isArray(hoeon?.stats) ? hoeon.stats : [];
  const hoeonName = hoeon?.name?.trim() || "user";

  const neroStats = safeNeroStats.length
    ? "\n\n[" +
      nero.name +
      " 스탯]\n" +
      safeNeroStats
        .map((s) => `• ${s.name}: ${stars(s.value)} (${s.value}/5)`)
        .join("\n")
    : "";

  const hoeonText = `\n\n[user 정보]
이름: ${hoeonName}
설명: ${hoeon?.personality || ""}
스탯: ${safeHoeonStats.map((s) => `${s.name} ${stars(s.value)}`).join(", ")}`;

  const relationText = relationState?.trim()
    ? `\n\n[현재 관계 상태]\n${relationState}`
    : "";

  const sceneText = sceneState?.trim()
    ? `\n\n[현재 장면 상태]\n${sceneState}`
    : "";

  const recentText = recentUserText?.trim()
    ? `\n\n[직전 user 발화]
${recentUserText}
이 마지막 발화의 감정과 의도를 먼저 반영해서 답한다.`
    : "";

  const bmText =
    Array.isArray(bookmarks) && bookmarks.length
      ? "\n\n[중요 사건]\n" +
        bookmarks
          .map((b, i) => `${i + 1}. ${b?.summary || "기억된 사건"}`)
          .join("\n")
      : "";

  const noteText = note?.trim() ? "\n\n[참고 메모]\n" + note : "";

  return `너는 현대 한국을 배경으로 한 로맨스 이야기 속 캐릭터 '${nero.name}'이야.

[핵심 원칙]
- user와의 현재 관계와 장면 흐름을 먼저 반영한다.
- 능글맞고 장난스럽게 말할 수 있지만, 중요한 감정은 가볍게 넘기지 않는다.
- 상대의 감정 변화와 대화 흐름을 놓치지 않는다.
- 말투보다 맥락 이해가 우선이다.
- 답변은 1~3문장 위주로 짧고 자연스럽게 말한다. 길어도 4문장을 넘기지 않는다.
- 상담사, 코치, 안내문 같은 말투를 쓰지 않는다.
- 선택지를 여러 개 나열하지 않는다.
- 행동묘사는 필요할 때만 *별표 사이에* 짧게 쓴다.

[호칭 규칙]
- user의 현재 이름/호칭은 '${hoeonName}'이다.
- 특별히 어색하지 않으면 이 호칭을 자연스럽게 사용한다.
- 매 문장마다 반복하지 않는다.
- 기존 대화 습관보다 현재 설정된 호칭을 우선한다.

[${nero.name} 설정]
${nero.personality}

[배경]
${nero.world}

[말투]
${nero.speech}${neroStats}${hoeonText}${relationText}${sceneText}${recentText}${bmText}${noteText}`;
}

// ── 별점 ─────────────────────────────────────────────────
function StarRating({ value, onChange, readonly = false }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          onClick={() => !readonly && onChange(i)}
          style={{
            fontSize: 14,
            cursor: readonly ? "default" : "pointer",
            color: i <= value ? C.gold : C.border3,
            userSelect: "none",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ── 스탯 에디터 ──────────────────────────────────────────
function StatsEditor({ stats = [], onChange }) {
  const setName = (i, v) => {
    const s = [...stats];
    s[i] = { ...s[i], name: v };
    onChange(s);
  };

  const setVal = (i, v) => {
    const s = [...stats];
    s[i] = { ...s[i], value: v };
    onChange(s);
  };

  const add = () => onChange([...stats, { name: "새 스탯", value: 3 }]);
  const del = (i) => onChange(stats.filter((_, j) => j !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: C.bg4,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <input
            value={s.name}
            onChange={(e) => setName(i, e.target.value)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              color: C.text,
              fontSize: 12,
              fontFamily: "inherit",
              outline: "none",
              minWidth: 0,
            }}
          />
          <StarRating value={s.value} onChange={(v) => setVal(i, v)} />
          <button
            onClick={() => del(i)}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 12,
              cursor: "pointer",
              padding: "0 2px",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          background: C.border2,
          border: `1px solid ${C.border2}`,
          borderRadius: 8,
          color: C.text3,
          fontSize: 11,
          padding: "6px",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        + 스탯 추가
      </button>
    </div>
  );
}

// ── 편집 모달 (공통) ─────────────────────────────────────
function EditModal({ title, children }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,8,6,0.9)",
        zIndex: 200,
        overflowY: "auto",
        padding: 16,
      }}
    >
      <div
        style={{
          background: C.bg,
          border: `1px solid ${C.border2}`,
          borderRadius: 14,
          padding: 20,
          width: "100%",
          maxWidth: 400,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.gold,
            letterSpacing: 1,
          }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── 수원이 편집 ──────────────────────────────────────────
function NeroEditModal({ profile, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ...profile,
    tags: Array.isArray(profile.tags) ? profile.tags.join(", ") : "",
    stats: Array.isArray(profile.stats) ? profile.stats : [],
  }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fi = {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    borderRadius: 8,
    color: C.text,
    padding: "9px 12px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    resize: "vertical",
  };

  return (
    <EditModal title="수원이 프로필 수정">
      {[["이름", "name"], ["직책/설정", "title"], ["태그 (쉼표 구분)", "tags"]].map(
        ([l, k]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: C.muted3, marginBottom: 4 }}>{l}</div>
            <input style={fi} type="text" value={form[k]} onChange={set(k)} />
          </div>
        )
      )}

      {[["배경/관계", "world", 3], ["성격", "personality", 4], ["말투 예시", "speech", 2]].map(
        ([l, k, r]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: C.muted3, marginBottom: 4 }}>{l}</div>
            <textarea style={fi} rows={r} value={form[k]} onChange={set(k)} />
          </div>
        )
      )}

      <div>
        <div style={{ fontSize: 11, color: C.muted3, marginBottom: 8 }}>스탯</div>
        <StatsEditor stats={form.stats} onChange={(s) => setForm((f) => ({ ...f, stats: s }))} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: C.border,
            color: C.text3,
            fontFamily: "inherit",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          취소
        </button>
        <button
          onClick={() =>
            onSave({
              ...form,
              tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
            })
          }
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: C.muted2,
            color: C.text,
            fontFamily: "inherit",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          저장
        </button>
      </div>
    </EditModal>
  );
}

// ── 내 프로필 편집 ───────────────────────────────────────
function HoeonEditModal({ profile, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ...profile,
    tags: Array.isArray(profile.tags) ? profile.tags.join(", ") : "",
    stats: Array.isArray(profile.stats) ? profile.stats : [],
  }));

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fi = {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    borderRadius: 8,
    color: C.text,
    padding: "9px 12px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    width: "100%",
    resize: "vertical",
  };

  return (
    <EditModal title="내 프로필 수정">
      {[["이름", "name"], ["직책/설정", "title"], ["태그 (쉼표 구분)", "tags"]].map(
        ([l, k]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: C.muted3, marginBottom: 4 }}>{l}</div>
            <input style={fi} type="text" value={form[k]} onChange={set(k)} />
          </div>
        )
      )}

      <div>
        <div style={{ fontSize: 11, color: C.muted3, marginBottom: 4 }}>성격/설정</div>
        <textarea style={fi} rows={3} value={form.personality} onChange={set("personality")} />
      </div>

      <div>
        <div style={{ fontSize: 11, color: C.muted3, marginBottom: 8 }}>스탯</div>
        <StatsEditor stats={form.stats} onChange={(s) => setForm((f) => ({ ...f, stats: s }))} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: C.border,
            color: C.text3,
            fontFamily: "inherit",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          취소
        </button>
        <button
          onClick={() =>
            onSave({
              ...form,
              tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
            })
          }
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: C.muted2,
            color: C.text,
            fontFamily: "inherit",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          저장
        </button>
      </div>
    </EditModal>
  );
}

// ── 프로필 뷰 ────────────────────────────────────────────
function ProfileView({ profile, avatar, onEdit, onPhotoChange, showWorld = false }) {
  const sec = { fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 8 };
  const card = {
    background: C.bg3,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "13px 15px",
    fontSize: 13,
    lineHeight: 1.8,
    color: C.text2,
  };
  const fileRef = useRef(null);

  const safeTags = Array.isArray(profile.tags) ? profile.tags : [];
  const safeStats = Array.isArray(profile.stats) ? profile.stats : [];

  const [cropSrc, setCropSrc] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [natSize, setNatSize] = useState({ w: 1, h: 1 });
  const CSIZE = 220;

  const getCoverScale = (w, h) => Math.max(CSIZE / w, CSIZE / h);

  const clampPos = (x, y, w, h, nextScale) => {
    const dispW = w * nextScale;
    const dispH = h * nextScale;
    const limitX = Math.max(0, (dispW - CSIZE) / 2);
    const limitY = Math.max(0, (dispH - CSIZE) / 2);

    return {
      x: Math.min(limitX, Math.max(-limitX, x)),
      y: Math.min(limitY, Math.max(-limitY, y)),
    };
  };

  const openCrop = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileRef.current) {
      fileRef.current.value = "";
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const baseScale = getCoverScale(nw, nh);

        setNatSize({ w: nw, h: nh });
        setScale(baseScale);
        setPos({ x: 0, y: 0 });
        setCropSrc(ev.target.result);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const applyCrop = () => {
    if (!cropSrc) return;

    const canvas = document.createElement("canvas");
    canvas.width = CSIZE;
    canvas.height = CSIZE;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(CSIZE / 2, CSIZE / 2, CSIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const dispW = natSize.w * scale;
    const dispH = natSize.h * scale;
    const imgX = CSIZE / 2 - dispW / 2 + pos.x;
    const imgY = CSIZE / 2 - dispH / 2 + pos.y;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, imgX, imgY, dispW, dispH);
      onPhotoChange(canvas.toDataURL("image/jpeg", 0.85));
      setCropSrc(null);
    };
    img.src = cropSrc;
  };

  const startDrag = (cx, cy) => setDrag({ sx: cx, sy: cy, ox: pos.x, oy: pos.y });

  const moveDrag = (cx, cy) => {
    if (!drag) return;
    const nextX = drag.ox + (cx - drag.sx);
    const nextY = drag.oy + (cy - drag.sy);
    setPos(clampPos(nextX, nextY, natSize.w, natSize.h, scale));
  };

  const endDrag = () => setDrag(null);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {cropSrc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 500,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 12, color: C.text3 }}>드래그로 위치 조정 · 슬라이더로 확대/축소</div>

          <div
            style={{ position: "relative", flexShrink: 0, touchAction: "none" }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag(e.clientX, e.clientY);
            }}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => {
              e.preventDefault();
              const t = e.touches[0];
              startDrag(t.clientX, t.clientY);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              const t = e.touches[0];
              moveDrag(t.clientX, t.clientY);
            }}
            onTouchEnd={endDrag}
          >
            <div
              style={{
                width: CSIZE,
                height: CSIZE,
                overflow: "hidden",
                position: "relative",
                background: "#111",
                cursor: drag ? "grabbing" : "grab",
              }}
            >
              <img
                src={cropSrc}
                draggable={false}
                alt=""
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                  transformOrigin: "center center",
                  userSelect: "none",
                  pointerEvents: "none",
                  maxWidth: "none",
                  opacity: 0.35,
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                overflow: "hidden",
                border: `2px solid ${C.gold}`,
                pointerEvents: "none",
              }}
            >
              <img
                src={cropSrc}
                draggable={false}
                alt=""
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                  transformOrigin: "center center",
                  userSelect: "none",
                  pointerEvents: "none",
                  maxWidth: "none",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, width: CSIZE }}>
            <span style={{ fontSize: 11, color: C.muted3, flexShrink: 0 }}>축소</span>
            <input
              type="range"
              min={getCoverScale(natSize.w, natSize.h)}
              max={getCoverScale(natSize.w, natSize.h) * 5}
              step="0.001"
              value={scale}
              onChange={(e) => {
                const nextScale = parseFloat(e.target.value);
                setScale(nextScale);
                setPos((prev) => clampPos(prev.x, prev.y, natSize.w, natSize.h, nextScale));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: C.muted3, flexShrink: 0 }}>확대</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setCropSrc(null)}
              style={{
                padding: "9px 22px",
                borderRadius: 8,
                border: "none",
                background: C.border,
                color: C.text3,
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              취소
            </button>
            <button
              onClick={applyCrop}
              style={{
                padding: "9px 22px",
                borderRadius: 8,
                border: "none",
                background: C.muted2,
                color: C.text,
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingBottom: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "#2a2018",
            border: `2px solid ${C.border3}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            flexShrink: 0,
            cursor: "pointer",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {profile.photo ? (
            <img src={profile.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="profile" />
          ) : (
            <span>{avatar}</span>
          )}

          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = 1;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = 0;
            }}
          >
            <span style={{ fontSize: 18, color: "#fff" }}>📷</span>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={openCrop} style={{ display: "none" }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 2 }}>{profile.name}</div>
          <div style={{ fontSize: 11, color: C.text3, letterSpacing: 1, marginTop: 3 }}>{profile.title}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {safeTags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: C.border,
                  color: C.text3,
                  border: `1px solid ${C.border2}`,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onEdit}
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.muted3,
            padding: "5px 10px",
            fontSize: 10,
            fontFamily: "inherit",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          ✎ 수정
        </button>
      </div>

      <div>
        <div style={sec}>스탯</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {safeStats.map((s, i) => (
            <div
              key={i}
              style={{
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "10px 13px",
              }}
            >
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{s.name}</div>
              <StarRating value={s.value} readonly />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={sec}>성격</div>
        <div style={card}>{profile.personality}</div>
      </div>

      {profile.speech && (
        <div>
          <div style={sec}>말투</div>
          <div
            style={{
              borderLeft: `2px solid ${C.border3}`,
              padding: "10px 14px",
              fontSize: 13,
              color: C.muted3,
              fontStyle: "italic",
              lineHeight: 1.7,
            }}
          >
            {profile.speech}
          </div>
        </div>
      )}

      {showWorld && profile.world && (
        <div>
          <div style={sec}>배경/관계</div>
          <div style={card}>{profile.world}</div>
        </div>
      )}
    </div>
  );
}

// ── 채팅 ─────────────────────────────────────────────────
function ChatView({
  neroRef,
  hoeonRef,
  bookmarksRef,
  noteRef,
  relationRef,
  sceneRef,
  onBookmarksChange,
  onNoteChange,
  onRelationChange,
  onSceneChange,
  nero,
  hoeon,
}) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(true);
  const [showNote, setShowNote] = useState(false);
  const [showBM, setShowBM] = useState(false);

  const histRef = useRef([]);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const didInit = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      const [sm, sh, sr, sscene] = await Promise.all([
        sg(STORAGE.msgs),
        sg(STORAGE.hist),
        sg(STORAGE.relation),
        sg(STORAGE.scene),
      ]);

      if (Array.isArray(sm) && sm.length && Array.isArray(sh) && sh.length) {
        setMsgs(sm);
        histRef.current = sh;

        if (typeof sr === "string" && sr.trim()) {
          relationRef.current = sr;
          onRelationChange(sr);
        }

        if (typeof sscene === "string" && sscene.trim()) {
          sceneRef.current = sscene;
          onSceneChange(sscene);
        }

        setBusy(false);
        return;
      }

      try {
        const firstLine = FIRST_AI_LINE;
        const m = [{ type: "ai", text: firstLine, id: 1 }];
        const h = [{ role: "assistant", content: firstLine }];

        setMsgs(m);
        histRef.current = h;

        await ss(STORAGE.msgs, m);
        await ss(STORAGE.hist, h);
        await ss(STORAGE.relation, relationRef.current);
        await ss(STORAGE.scene, sceneRef.current);
      } catch (e) {
        setMsgs([{ type: "ai", text: "오류: " + e.message, id: 1 }]);
      }

      setBusy(false);
    })();
  }, [hoeonRef, neroRef, noteRef, onRelationChange, onSceneChange, relationRef, sceneRef, bookmarksRef]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (busy || !text) return;

    setInput("");
    if (taRef.current) taRef.current.style.height = "38px";

    if (text === "!요약") {
      setBusy(true);
      const tid = Date.now();
      setMsgs((m) => [...m, { type: "t", text: "대화를 정리하는 중...", id: tid }]);

      try {
        const system = buildSystem(
          neroRef.current,
          hoeonRef.current,
          relationRef.current,
          sceneRef.current,
          bookmarksRef.current,
          noteRef.current
        );

        const summary = await callClaude(system, [
          ...histRef.current,
          { role: "user", content: "지금까지의 분위기와 관계 흐름을 3~5줄로 요약해줘." },
        ]);

        setMsgs((m) => {
          const next = m.map((msg) =>
            msg.id === tid ? { type: "summary", text: summary, id: tid } : msg
          );
          ss(STORAGE.msgs, next);
          return next;
        });
      } catch (e) {
        setMsgs((m) =>
          m.map((msg) =>
            msg.id === tid ? { ...msg, type: "ai", text: "오류: " + e.message } : msg
          )
        );
      }

      setBusy(false);
      return;
    }

    const uid = Date.now();
    const tid = uid + 1;
    const newHist = [...histRef.current, { role: "user", content: text }];
    histRef.current = newHist;

    setMsgs((m) => [...m, { type: "u", text, id: uid }, { type: "t", text: "...", id: tid }]);
    setBusy(true);

    try {
      const liveSceneState = `${sceneRef.current}

최근 user 발화: ${text}
수원이는 이 마지막 발화의 감정과 의도를 먼저 반영한다.`;

      const system = buildSystem(
        neroRef.current,
        hoeonRef.current,
        relationRef.current,
        liveSceneState,
        bookmarksRef.current,
        noteRef.current,
        text
      );

      const reply = await callClaude(system, newHist);
      const rid = Date.now();
      const finalHist = [...newHist, { role: "assistant", content: reply }];
      histRef.current = finalHist;

      setMsgs((m) => {
        const next = m.map((msg) =>
          msg.id === tid ? { type: "ai", text: reply, id: rid } : msg
        );
        ss(STORAGE.msgs, next);
        return next;
      });

      await ss(STORAGE.hist, finalHist);
    } catch (e) {
      setMsgs((m) =>
        m.map((msg) =>
          msg.id === tid ? { ...msg, type: "ai", text: "오류: " + e.message } : msg
        )
      );
    }

    setBusy(false);
  }, [busy, input, neroRef, hoeonRef, relationRef, sceneRef, bookmarksRef, noteRef]);

  const addBookmark = useCallback(
    async (msg) => {
      setBusy(true);

      try {
        const summary = await callClaude(
          "다음 장면에서 감정적으로 중요한 순간을 20자 이내로 짧게 요약해줘. 요약문만 출력해.",
          [{ role: "user", content: msg.text }]
        );

        const newBM = [
          ...(Array.isArray(bookmarksRef.current) ? bookmarksRef.current : []),
          { summary: summary.trim(), time: new Date().toLocaleDateString("ko-KR") },
        ];

        onBookmarksChange(newBM);
        await ss(STORAGE.bm, newBM);
      } catch (e) {
        alert("북마크 실패: " + e.message);
      }

      setBusy(false);
    },
    [bookmarksRef, onBookmarksChange]
  );

  const delBM = async (i) => {
    const n = (Array.isArray(bookmarksRef.current) ? bookmarksRef.current : []).filter((_, j) => j !== i);
    onBookmarksChange(n);
    await ss(STORAGE.bm, n);
  };

  const editBM = async (i, newSummary) => {
    const n = (Array.isArray(bookmarksRef.current) ? bookmarksRef.current : []).map((bm, j) =>
      j === i ? { ...bm, summary: newSummary } : bm
    );
    onBookmarksChange(n);
    await ss(STORAGE.bm, n);
  };

  const saveNote = async (v) => {
    onNoteChange(v);
    await ss(STORAGE.note, v);
  };

  const clearChat = async () => {
    if (!confirm("대화를 초기화할까요?")) return;

    setBusy(true);
    setMsgs([]);
    histRef.current = [];

    await ss(STORAGE.msgs, []);
    await ss(STORAGE.hist, []);
    await ss(STORAGE.relation, relationRef.current);
    await ss(STORAGE.scene, sceneRef.current);

    try {
      const firstLine = FIRST_AI_LINE;
      const m = [{ type: "ai", text: firstLine, id: Date.now() }];
      const h = [{ role: "assistant", content: firstLine }];

      setMsgs(m);
      histRef.current = h;

      await ss(STORAGE.msgs, m);
      await ss(STORAGE.hist, h);
    } catch (e) {
      setMsgs([{ type: "ai", text: "오류: " + e.message, id: 1 }]);
    }

    setBusy(false);
  };

  const bms = Array.isArray(bookmarksRef.current) ? bookmarksRef.current : [];
  const note = typeof noteRef.current === "string" ? noteRef.current : "";

  return (
    <>
      {/* 툴바 */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 14px",
          background: C.bg2,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => {
            setShowNote((v) => !v);
            setShowBM(false);
          }}
          style={{
            background: showNote ? C.muted2 : C.border,
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            color: showNote ? C.gold : C.text3,
            fontSize: 11,
            padding: "5px 10px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          📝 메모{note.trim() ? " ●" : ""}
        </button>

        <button
          onClick={() => {
            setShowBM((v) => !v);
            setShowNote(false);
          }}
          style={{
            background: showBM ? C.muted2 : C.border,
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            color: showBM ? C.gold : C.text3,
            fontSize: 11,
            padding: "5px 10px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          🔖 북마크{bms.length > 0 ? ` (${bms.length})` : ""}
        </button>

        <button
          onClick={clearChat}
          style={{
            background: "none",
            border: "none",
            color: C.muted,
            fontSize: 11,
            padding: "5px 8px",
            fontFamily: "inherit",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          ↺ 초기화
        </button>
      </div>

      <div
        style={{
          background: C.bg4,
          borderBottom: `1px solid ${C.border}`,
          padding: "8px 14px",
          fontSize: 11,
          color: C.text3,
          lineHeight: 1.6,
          flexShrink: 0,
        }}
      >
        이름/호칭 변경 후 기존 대화에는 예전 호칭이 남을 수 있어요. 필요하면 초기화하세요.
      </div>

      {/* 메모 패널 */}
      {showNote && (
        <div
          style={{
            background: C.bg4,
            borderBottom: `1px solid ${C.border}`,
            padding: "12px 14px",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 10, color: C.muted3, letterSpacing: 1, marginBottom: 6 }}>
            현재 분위기 메모 — 수원이가 참고해요
          </div>
          <textarea
            value={note}
            onChange={(e) => saveNote(e.target.value)}
            rows={3}
            placeholder={"예: user는 장난을 잘 받아준다\n예: 오늘은 조금 다정한 분위기로 가고 싶다"}
            style={{
              width: "100%",
              background: C.bg3,
              border: `1px solid ${C.border2}`,
              borderRadius: 8,
              color: C.text,
              padding: "8px 11px",
              fontSize: 12,
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
            }}
          />
        </div>
      )}

      {/* 북마크 패널 */}
      {showBM && (
        <div
          style={{
            background: C.bg4,
            borderBottom: `1px solid ${C.border}`,
            padding: "12px 14px",
            flexShrink: 0,
            maxHeight: 150,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 10, color: C.muted3, letterSpacing: 1, marginBottom: 8 }}>
            북마크된 사건 — 수원이가 기억해요
          </div>

          {bms.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>
              대화에서 🔖 버튼을 눌러 장면을 저장하세요.
            </div>
          ) : (
            bms.map((bm, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div style={{ flex: 1 }}>
                  <input
                    defaultValue={bm.summary}
                    onBlur={(e) => editBM(i, e.target.value)}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      color: C.text2,
                      fontSize: 12,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{bm.time}</div>
                </div>
                <button
                  onClick={() => delBM(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.muted,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 메시지 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "18px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ textAlign: "center", fontSize: 11, color: C.muted2, letterSpacing: 1 }}>
          — 늦은 오전, 함께 사는 집 —
        </div>

        {msgs.map((msg) => {
          if (msg.type === "summary") {
            return (
              <div
                key={msg.id}
                style={{
                  background: C.bg3,
                  border: `1px solid ${C.border3}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: C.text2,
                  lineHeight: 1.8,
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                📜 {msg.text}
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexDirection: msg.type === "u" ? "row-reverse" : "row",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#2a2018",
                  border: `1px solid ${C.border2}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {msg.type === "u" ? (
                  hoeon?.photo ? (
                    <img src={hoeon.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  ) : (
                    "유"
                  )
                ) : nero?.photo ? (
                  <img src={nero.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                ) : (
                  "수"
                )}
              </div>

              <div
                style={{
                  maxWidth: "72%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.type === "u" ? "flex-end" : "flex-start",
                  gap: 3,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    fontSize: 13.5,
                    lineHeight: 1.75,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    borderRadius: msg.type === "u" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.type === "u" ? C.border : msg.type === "t" ? C.bg4 : C.bg3,
                    border:
                      msg.type === "u"
                        ? "none"
                        : `1px solid ${msg.type === "t" ? "#252015" : C.border}`,
                    color: msg.type === "t" ? C.muted2 : C.text,
                    fontStyle: msg.type === "t" ? "italic" : "normal",
                  }}
                >
                  {msg.text}
                </div>

                {msg.type === "ai" && (
                  <button
                    onClick={() => addBookmark(msg)}
                    disabled={busy}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.muted,
                      fontSize: 10,
                      cursor: "pointer",
                      padding: "0 2px",
                      fontFamily: "inherit",
                    }}
                  >
                    🔖 북마크
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div
        style={{
          padding: "10px 12px",
          background: C.bg2,
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
          }}
          placeholder="수원이에게 말을 걸어보세요... (!요약)"
          rows={1}
          style={{
            flex: 1,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            color: C.text,
            padding: "9px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "none",
            minHeight: 38,
            maxHeight: 100,
            lineHeight: 1.6,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={busy}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "none",
            background: busy ? "#2a2018" : C.muted2,
            color: busy ? C.border2 : C.text,
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ➤
        </button>
      </div>
    </>
  );
}

// ── 메인 ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("chat");
  const [nero, setNero] = useState(null);
  const [hoeon, setHoeon] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [note, setNote] = useState("");
  const [relationState, setRelationState] = useState(DEFAULT_RELATION_STATE);
  const [sceneState, setSceneState] = useState(DEFAULT_SCENE_STATE);
  const [editingNero, setEditingNero] = useState(false);
  const [editingHoeon, setEditingHoeon] = useState(false);

  const neroRef = useRef(null);
  const hoeonRef = useRef(null);
  const bookmarksRef = useRef([]);
  const noteRef = useRef("");
  const relationRef = useRef(DEFAULT_RELATION_STATE);
  const sceneRef = useRef(DEFAULT_SCENE_STATE);

  useEffect(() => {
    (async () => {
      const [sn, sh, sbm, sno, sr, sscene] = await Promise.all([
        sg(STORAGE.neroProfile),
        sg(STORAGE.hoeonProfile),
        sg(STORAGE.bm),
        sg(STORAGE.note),
        sg(STORAGE.relation),
        sg(STORAGE.scene),
      ]);

      const n = normalizeProfile(sn, DEFAULT_NERO);
      const h = normalizeProfile(sh, DEFAULT_HOEON);
      const bm = Array.isArray(sbm) ? sbm : [];
      const no = typeof sno === "string" ? sno : "";
      const rel = typeof sr === "string" && sr.trim() ? sr : DEFAULT_RELATION_STATE;
      const scn = typeof sscene === "string" && sscene.trim() ? sscene : DEFAULT_SCENE_STATE;

      neroRef.current = n;
      hoeonRef.current = h;
      bookmarksRef.current = bm;
      noteRef.current = no;
      relationRef.current = rel;
      sceneRef.current = scn;

      setNero(n);
      setHoeon(h);
      setBookmarks(bm);
      setNote(no);
      setRelationState(rel);
      setSceneState(scn);
    })();
  }, []);

  const saveNero = async (p) => {
    const normalized = normalizeProfile(p, DEFAULT_NERO);
    neroRef.current = normalized;
    setNero(normalized);
    await ss(STORAGE.neroProfile, normalized);
    setEditingNero(false);
  };

  const saveHoeon = async (p) => {
    const normalized = normalizeProfile(p, DEFAULT_HOEON);
    hoeonRef.current = normalized;
    setHoeon(normalized);
    await ss(STORAGE.hoeonProfile, normalized);
    setEditingHoeon(false);
  };

  const handleBMChange = (bm) => {
    bookmarksRef.current = bm;
    setBookmarks(bm);
  };

  const handleNoteChange = (n) => {
    noteRef.current = n;
    setNote(n);
  };

  const handleRelationChange = async (v) => {
    relationRef.current = v;
    setRelationState(v);
    await ss(STORAGE.relation, v);
  };

  const handleSceneChange = async (v) => {
    sceneRef.current = v;
    setSceneState(v);
    await ss(STORAGE.scene, v);
  };

  const handleNeroPhoto = async (photo) => {
    const p = { ...neroRef.current, photo };
    neroRef.current = p;
    setNero(p);
    await ss(STORAGE.neroProfile, p);
  };

  const handleHoeonPhoto = async (photo) => {
    const p = { ...hoeonRef.current, photo };
    hoeonRef.current = p;
    setHoeon(p);
    await ss(STORAGE.hoeonProfile, p);
  };

  if (!nero || !hoeon) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: "100vh",
          height: "100dvh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.muted,
          fontFamily: "sans-serif",
        }}
      >
        불러오는 중...
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
        fontFamily: "'Noto Sans KR',sans-serif",
        position: "relative",
      }}
    >
      {/* 탭 */}
      <div
        style={{
          display: "flex",
          background: C.bg2,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        {[["chat", "대화"], ["nero", "수원이"], ["hoeon", "내 프로필"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: "12px 0",
              fontSize: 12,
              fontFamily: "inherit",
              background: "none",
              border: "none",
              letterSpacing: 1,
              cursor: "pointer",
              borderBottom: `2px solid ${tab === id ? C.gold : "transparent"}`,
              color: tab === id ? C.gold : C.muted,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: tab === "chat" ? "flex" : "none",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <ChatView
          neroRef={neroRef}
          hoeonRef={hoeonRef}
          bookmarksRef={bookmarksRef}
          noteRef={noteRef}
          relationRef={relationRef}
          sceneRef={sceneRef}
          onBookmarksChange={handleBMChange}
          onNoteChange={handleNoteChange}
          onRelationChange={handleRelationChange}
          onSceneChange={handleSceneChange}
          nero={nero}
          hoeon={hoeon}
        />
      </div>

      {tab === "nero" && (
        <ProfileView
          profile={nero}
          avatar="수"
          onEdit={() => setEditingNero(true)}
          onPhotoChange={handleNeroPhoto}
          showWorld
        />
      )}

      {tab === "hoeon" && (
        <ProfileView
          profile={hoeon}
          avatar="유"
          onEdit={() => setEditingHoeon(true)}
          onPhotoChange={handleHoeonPhoto}
        />
      )}

      {editingNero && (
        <NeroEditModal
          profile={nero}
          onSave={saveNero}
          onClose={() => setEditingNero(false)}
        />
      )}

      {editingHoeon && (
        <HoeonEditModal
          profile={hoeon}
          onSave={saveHoeon}
          onClose={() => setEditingHoeon(false)}
        />
      )}
    </div>
  );
}
