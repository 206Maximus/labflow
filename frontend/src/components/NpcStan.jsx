/**
 * NpcStan.jsx — 아인슈타인 캐릭터 (실험실 조언자)
 * 클릭하면 연구실 관련 명언/조언이 나타납니다.
 */

import { useState, useEffect } from "react";

const DIALOGUES = [
  "상상력은 지식보다 중요하다. — Einstein",
  "장비 예약은 미리미리! 준비된 자가 발견도 한다오.",
  "SEM, TEM, XRD... 모두 위대한 도구들이오. 소중히 다루시게.",
  "실험은 철저한 계획에서 시작된다오.",
  "체크인을 잊으면 다음 연구자가 기다린다네!",
  "E = mc² ... 그리고 좋은 데이터 = 좋은 연구!",
  "오늘의 실험이 내일의 발견이 된다오.",
  "혹시 체크아웃은 하셨나요? 다음 사람도 생각해야지!",
  "연구란 호기심이 이끄는 여정이라오.",
  "작은 데이터도 허투루 보지 마시게나.",
];

const EinsteinSVG = () => (
  <svg viewBox="0 0 120 165" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
    {/* 헝클어진 흰 머리카락 */}
    <ellipse cx="60" cy="15" rx="30" ry="16" fill="#EFEFEF" />
    <ellipse cx="30" cy="22" rx="16" ry="10" fill="#E8E8E8" transform="rotate(-25 30 22)" />
    <ellipse cx="90" cy="22" rx="16" ry="10" fill="#E8E8E8" transform="rotate(25 90 22)" />
    <ellipse cx="20" cy="32" rx="12" ry="8"  fill="#F0F0F0" transform="rotate(-15 20 32)" />
    <ellipse cx="100" cy="32" rx="12" ry="8" fill="#F0F0F0" transform="rotate(15 100 32)" />
    <ellipse cx="45" cy="10" rx="14" ry="9"  fill="#E4E4E4" transform="rotate(-10 45 10)" />
    <ellipse cx="75" cy="10" rx="14" ry="9"  fill="#E4E4E4" transform="rotate(10 75 10)" />

    {/* 얼굴 */}
    <ellipse cx="60" cy="52" rx="27" ry="30" fill="#F9C9A0" />

    {/* 귀 */}
    <ellipse cx="33" cy="52" rx="6" ry="9" fill="#F0B888" />
    <ellipse cx="87" cy="52" rx="6" ry="9" fill="#F0B888" />

    {/* 안경 테 */}
    <circle cx="46" cy="50" r="13" fill="none" stroke="#444" strokeWidth="2.5" />
    <circle cx="74" cy="50" r="13" fill="none" stroke="#444" strokeWidth="2.5" />
    <line x1="59" y1="50" x2="61" y2="50" stroke="#444" strokeWidth="2.2" />
    <line x1="20" y1="45" x2="33" y2="47" stroke="#444" strokeWidth="2" />
    <line x1="87" y1="47" x2="100" y2="45" stroke="#444" strokeWidth="2" />
    {/* 렌즈 (하늘색 틴트) */}
    <circle cx="46" cy="50" r="12" fill="rgba(186,225,255,0.25)" />
    <circle cx="74" cy="50" r="12" fill="rgba(186,225,255,0.25)" />
    {/* 눈 */}
    <circle cx="46" cy="50" r="5"  fill="#3D2B1A" />
    <circle cx="74" cy="50" r="5"  fill="#3D2B1A" />
    <circle cx="48" cy="48" r="2"  fill="white" />
    <circle cx="76" cy="48" r="2"  fill="white" />

    {/* 코 */}
    <ellipse cx="60" cy="61" rx="4" ry="5" fill="#E8A882" />

    {/* 콧수염 (아인슈타인 스타일, 두툼) */}
    <ellipse cx="51" cy="70" rx="12" ry="5.5" fill="#C8C8C8" transform="rotate(5 51 70)" />
    <ellipse cx="69" cy="70" rx="12" ry="5.5" fill="#C8C8C8" transform="rotate(-5 69 70)" />
    <ellipse cx="60" cy="71" rx="7"  ry="4"   fill="#D8D8D8" />

    {/* 입 */}
    <path d="M 52 77 Q 60 82 68 77" stroke="#C08060" strokeWidth="2" fill="none" strokeLinecap="round" />

    {/* 흰 가운 몸통 */}
    <rect x="20" y="84" width="80" height="68" rx="10" fill="#F8F8FF" />
    <rect x="22" y="86" width="76" height="64" rx="8"  fill="#FFFFFF" />

    {/* 가운 칼라/라펠 */}
    <path d="M 44 84 L 60 100 L 76 84" fill="#F0F0F8" stroke="#DDE" strokeWidth="1" />

    {/* 넥타이 */}
    <path d="M 57 86 L 54 114 L 60 120 L 66 114 L 63 86 Z" fill="#1E3A8A" />
    <path d="M 57 86 L 60 92 L 63 86 Z" fill="#2563EB" />

    {/* 셔츠 */}
    <rect x="50" y="86" width="20" height="36" fill="#EFF6FF" />

    {/* 가운 버튼 */}
    <circle cx="60" cy="106" r="2.5" fill="#CBD5E1" />
    <circle cx="60" cy="117" r="2.5" fill="#CBD5E1" />
    <circle cx="60" cy="128" r="2.5" fill="#CBD5E1" />

    {/* 가운 주머니 */}
    <rect x="70" y="100" width="20" height="14" rx="3" fill="none" stroke="#DDE" strokeWidth="1.5" />
    <rect x="74" y="98" width="3" height="10" rx="1.5" fill="#1E3A8A" />

    {/* 왼팔 */}
    <rect x="4"  y="86" width="18" height="46" rx="9" fill="#F8F8FF" />
    <rect x="6"  y="88" width="14" height="42" rx="7" fill="#FFFFFF" />
    <ellipse cx="13" cy="134" rx="9" ry="7" fill="#F9C9A0" />

    {/* 오른팔 (칠판 들기) */}
    <rect x="98" y="86" width="18" height="38" rx="9" fill="#F8F8FF" />
    <rect x="100" y="88" width="14" height="34" rx="7" fill="#FFFFFF" />
    <ellipse cx="107" cy="126" rx="9" ry="7" fill="#F9C9A0" />

    {/* 칠판 */}
    <rect x="100" y="92" width="38" height="30" rx="4" fill="#1E3A5F" />
    <rect x="102" y="94" width="34" height="26" rx="3" fill="#1E4D3A" />
    {/* 수식 */}
    <text x="119" y="108" textAnchor="middle" fill="white" fontSize="9" fontFamily="Georgia, serif" fontWeight="bold">E=mc²</text>
    <line x1="105" y1="113" x2="133" y2="113" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
    <text x="119" y="118" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="6" fontFamily="Georgia, serif">ΔS ≥ 0</text>
    {/* 분필 */}
    <rect x="103" y="120" width="12" height="3" rx="1.5" fill="#F0F0F0" />

    {/* 바지 */}
    <rect x="28" y="150" width="24" height="14" rx="7" fill="#6B7280" />
    <rect x="58" y="150" width="24" height="14" rx="7" fill="#6B7280" />

    {/* 구두 */}
    <ellipse cx="40"  cy="163" rx="15" ry="5" fill="#1C1C1C" />
    <ellipse cx="70"  cy="163" rx="15" ry="5" fill="#1C1C1C" />
  </svg>
);

export default function NpcStan() {
  const [dialogue, setDialogue] = useState(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [bounce, setBounce] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setBounce(true);
      setTimeout(() => setBounce(false), 450);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dialogue) {
      const t = setTimeout(() => setDialogue(null), 4500);
      return () => clearTimeout(t);
    }
  }, [dialogue]);

  const handleClick = () => {
    const next = (dialogueIndex + 1) % DIALOGUES.length;
    setDialogueIndex(next);
    setDialogue(DIALOGUES[next]);
  };

  return (
    <div style={styles.wrapper}>
      {dialogue && (
        <div style={styles.bubble}>
          <span style={styles.bubbleText}>{dialogue}</span>
          <div style={styles.bubbleTail} />
        </div>
      )}

      <div onClick={handleClick} style={{
        ...styles.spriteWrap,
        transform: bounce ? "translateY(-7px)" : "translateY(0)",
      }}>
        <EinsteinSVG />
      </div>

      <div style={styles.nameLabel}>🔬 아인슈타인 박사</div>
      <div style={styles.hint}>[ 클릭 ]</div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex", flexDirection: "column", alignItems: "center",
    position: "relative", userSelect: "none",
  },
  bubble: {
    position: "absolute", bottom: "192px", left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#FFFEF5", border: "2px solid #1E3A8A",
    borderRadius: "10px", padding: "10px 14px",
    maxWidth: "210px", minWidth: "160px", textAlign: "center",
    boxShadow: "3px 3px 0 #1E3A8A", zIndex: 10,
    animation: "popIn 0.15s ease-out",
  },
  bubbleText: {
    fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "12px", fontWeight: 600, color: "#1E293B", lineHeight: 1.7,
  },
  bubbleTail: {
    position: "absolute", bottom: "-11px", left: "50%",
    transform: "translateX(-50%)",
    width: 0, height: 0,
    borderLeft: "8px solid transparent",
    borderRight: "8px solid transparent",
    borderTop: "11px solid #1E3A8A",
  },
  spriteWrap: {
    width: "110px", height: "175px", cursor: "pointer",
    transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
    filter: "drop-shadow(2px 4px 3px rgba(0,0,0,0.25))",
  },
  nameLabel: {
    marginTop: "8px",
    fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "12px", fontWeight: 700,
    color: "#1E3A8A", backgroundColor: "rgba(255,255,255,0.92)",
    padding: "4px 12px", borderRadius: "20px",
    border: "1.5px solid #BFDBFE",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  },
  hint: {
    marginTop: "4px",
    fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif",
    fontSize: "10px", fontWeight: 500,
    color: "#64748B", animation: "blink 1.4s step-end infinite",
  },
};
