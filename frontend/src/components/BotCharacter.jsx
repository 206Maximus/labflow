/**
 * BotCharacter.jsx — 예약 챗봇 로봇 캐릭터
 * 클릭 시 챗봇 예약 탭으로 이동합니다.
 */

import { useState, useEffect } from "react";

const BOT_HINTS = [
  "저를 클릭하면 예약할 수 있어요!",
  "장비 예약은 저한테 맡겨주세요 🤖",
  "자연어로 말해주시면 바로 예약해드려요!",
  "내일 오후 2시에 XRD 예약해줘~ 이렇게요!",
];

/* ── 심플 대칭 로봇 SVG ──────────────────────────────────────────────────── */
const RobotSVG = () => (
  <svg
    viewBox="0 0 100 150"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: "100%", height: "100%" }}
  >
    {/* 안테나 줄기 */}
    <line x1="50" y1="6" x2="50" y2="20" stroke="#90CAF9" strokeWidth="2.5" strokeLinecap="round"/>
    {/* 안테나 구슬 */}
    <circle cx="50" cy="5" r="5" fill="#29B6F6"/>
    <circle cx="50" cy="5" r="2.5" fill="#E3F2FD"/>

    {/* 머리 */}
    <rect x="18" y="20" width="64" height="44" rx="16" fill="white"/>
    <rect x="20" y="22" width="60" height="40" rx="14" fill="#F0F7FF"/>
    {/* 머리 테두리 */}
    <rect x="18" y="20" width="64" height="44" rx="16" fill="none" stroke="#90CAF9" strokeWidth="1.5"/>

    {/* 눈 (왼쪽) */}
    <circle cx="36" cy="42" r="11" fill="#E3F2FD"/>
    <circle cx="36" cy="42" r="8" fill="#29B6F6"/>
    <circle cx="36" cy="42" r="4.5" fill="#0277BD"/>
    <circle cx="38.5" cy="39.5" r="2" fill="white"/>

    {/* 눈 (오른쪽) */}
    <circle cx="64" cy="42" r="11" fill="#E3F2FD"/>
    <circle cx="64" cy="42" r="8" fill="#29B6F6"/>
    <circle cx="64" cy="42" r="4.5" fill="#0277BD"/>
    <circle cx="66.5" cy="39.5" r="2" fill="white"/>

    {/* 입 */}
    <path d="M 38 56 Q 50 64 62 56" stroke="#90CAF9" strokeWidth="2.5" fill="none" strokeLinecap="round"/>

    {/* 귀 (왼쪽) */}
    <rect x="8" y="32" width="10" height="16" rx="5" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="1.5"/>
    <circle cx="13" cy="40" r="3" fill="#29B6F6"/>

    {/* 귀 (오른쪽) */}
    <rect x="82" y="32" width="10" height="16" rx="5" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="1.5"/>
    <circle cx="87" cy="40" r="3" fill="#29B6F6"/>

    {/* 목 */}
    <rect x="42" y="64" width="16" height="8" rx="4" fill="#BBDEFB"/>

    {/* 몸통 */}
    <rect x="16" y="72" width="68" height="52" rx="14" fill="white"/>
    <rect x="18" y="74" width="64" height="48" rx="12" fill="#F0F7FF"/>
    {/* 몸통 테두리 */}
    <rect x="16" y="72" width="68" height="52" rx="14" fill="none" stroke="#90CAF9" strokeWidth="1.5"/>

    {/* 가슴 패널 */}
    <rect x="28" y="82" width="44" height="30" rx="8" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="1"/>
    {/* 버튼 3개 (중앙 정렬) */}
    <circle cx="38" cy="93" r="5" fill="#29B6F6"/>
    <circle cx="50" cy="93" r="5" fill="#4CAF50"/>
    <circle cx="62" cy="93" r="5" fill="#EF5350"/>
    {/* 슬롯 */}
    <rect x="32" y="104" width="36" height="4" rx="2" fill="#90CAF9"/>

    {/* 왼쪽 팔 (대칭) */}
    <rect x="2" y="74" width="14" height="40" rx="7" fill="white" stroke="#90CAF9" strokeWidth="1.5"/>
    <rect x="4" y="76" width="10" height="36" rx="5" fill="#F0F7FF"/>
    {/* 왼쪽 손 */}
    <circle cx="9" cy="116" r="7" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="1.5"/>
    <circle cx="9" cy="116" r="3.5" fill="#29B6F6"/>

    {/* 오른쪽 팔 (대칭) */}
    <rect x="84" y="74" width="14" height="40" rx="7" fill="white" stroke="#90CAF9" strokeWidth="1.5"/>
    <rect x="86" y="76" width="10" height="36" rx="5" fill="#F0F7FF"/>
    {/* 오른쪽 손 */}
    <circle cx="91" cy="116" r="7" fill="#E3F2FD" stroke="#90CAF9" strokeWidth="1.5"/>
    <circle cx="91" cy="116" r="3.5" fill="#29B6F6"/>

    {/* 다리 (왼쪽) */}
    <rect x="24" y="124" width="20" height="20" rx="7" fill="white" stroke="#90CAF9" strokeWidth="1.5"/>
    <rect x="26" y="126" width="16" height="16" rx="5" fill="#F0F7FF"/>

    {/* 다리 (오른쪽) */}
    <rect x="56" y="124" width="20" height="20" rx="7" fill="white" stroke="#90CAF9" strokeWidth="1.5"/>
    <rect x="58" y="126" width="16" height="16" rx="5" fill="#F0F7FF"/>

    {/* 발 (왼쪽) */}
    <rect x="20" y="140" width="26" height="8" rx="4" fill="#BBDEFB" stroke="#90CAF9" strokeWidth="1"/>

    {/* 발 (오른쪽) */}
    <rect x="54" y="140" width="26" height="8" rx="4" fill="#BBDEFB" stroke="#90CAF9" strokeWidth="1"/>
  </svg>
);

export default function BotCharacter({ onOpenChat }) {
  const [hint, setHint] = useState(null);
  const [bounce, setBounce] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);

  // idle 애니메이션
  useEffect(() => {
    const interval = setInterval(() => {
      setBounce(true);
      setTimeout(() => setBounce(false), 500);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // 힌트 자동 닫기
  useEffect(() => {
    if (hint) {
      const t = setTimeout(() => setHint(null), 3500);
      return () => clearTimeout(t);
    }
  }, [hint]);

  const handleClick = () => {
    const next = (hintIdx + 1) % BOT_HINTS.length;
    setHintIdx(next);
    setHint(BOT_HINTS[next]);
    setTimeout(() => onOpenChat(), 400);
  };

  return (
    <div style={styles.wrapper}>
      {/* 말풍선 */}
      {hint && (
        <div style={styles.speechBubble}>
          <span style={styles.speechText}>{hint}</span>
          <div style={styles.bubbleTail} />
        </div>
      )}

      {/* 로봇 본체 */}
      <div
        onClick={handleClick}
        title="예약 챗봇 열기"
        style={{
          ...styles.botWrap,
          transform: bounce
            ? "translateY(-8px) scale(1.02)"
            : "translateY(0) scale(1)",
        }}
      >
        <RobotSVG />
      </div>

      {/* 명찰 */}
      <div style={styles.nameLabel}>🤖 예약 챗봇</div>
      <div style={styles.clickHint}>[ 클릭하여 예약 ]</div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex", flexDirection: "column",
    alignItems: "center", position: "relative",
    userSelect: "none",
  },
  speechBubble: {
    position: "absolute",
    bottom: "190px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#E3F2FD",
    border: "2px solid #29B6F6",
    borderRadius: "12px",
    padding: "10px 14px",
    maxWidth: "200px",
    minWidth: "160px",
    textAlign: "center",
    boxShadow: "0 4px 12px rgba(41,182,246,0.2)",
    zIndex: 10,
    animation: "popIn 0.15s ease-out",
  },
  speechText: {
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "13px",
    fontWeight: 600,
    color: "#0277BD",
    lineHeight: 1.6,
  },
  bubbleTail: {
    position: "absolute",
    bottom: "-11px",
    left: "50%",
    transform: "translateX(-50%)",
    width: 0, height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderTop: "11px solid #29B6F6",
  },
  botWrap: {
    width: "130px",
    height: "180px",
    cursor: "pointer",
    transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    filter: "drop-shadow(0 6px 12px rgba(41,182,246,0.3))",
  },
  nameLabel: {
    marginTop: "8px",
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "13px",
    fontWeight: 700,
    color: "#0277BD",
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: "4px 14px",
    borderRadius: "20px",
    border: "1.5px solid #BBDEFB",
    boxShadow: "0 2px 8px rgba(41,182,246,0.15)",
  },
  clickHint: {
    marginTop: "4px",
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "11px",
    fontWeight: 500,
    color: "#64748B",
    opacity: 0.9,
    animation: "blink 1.2s step-end infinite",
  },
};
