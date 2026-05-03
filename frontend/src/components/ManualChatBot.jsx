/**
 * ManualChatBot.jsx — 장비 매뉴얼 챗봇 UI (프론트 인터페이스 전용)
 * 백엔드: RAG (FAISS + LangChain) — 추후 연결 예정
 */

import { useState, useRef, useEffect } from "react";

const EQUIPMENT_OPTIONS = [
  { id: "xrd",     label: "XRD",       desc: "X-Ray Diffractometer" },
  { id: "sem",     label: "SEM",       desc: "Scanning Electron Microscope" },
  { id: "ebeam",   label: "E-beam",    desc: "E-beam Evaporator" },
  { id: "afm",     label: "AFM",       desc: "Atomic Force Microscope" },
  { id: "furnace", label: "Furnace",   desc: "전기로" },
];

const WELCOME_MSG = {
  id: 0,
  role: "assistant",
  content: "안녕하세요! 장비 매뉴얼 챗봇입니다.\n\n장비를 선택하고 궁금한 점을 물어보세요.\n예) 'XRD 시료 준비 방법이 뭐야?'\n예) 'SEM 진공 펌프 켜는 순서 알려줘'",
};

export default function ManualChatBot() {
  const [selectedEquip, setSelectedEquip] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectEquip = (eq) => {
    setSelectedEquip(eq);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "assistant",
        content: `'${eq.label}' (${eq.desc}) 매뉴얼이 로드되었습니다.\n이 장비에 대해 궁금한 것을 물어보세요!`,
      },
    ]);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg = { id: Date.now(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // 백엔드 미연결 → 데모 응답
    setTimeout(() => {
      const equipName = selectedEquip?.label || "장비";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `[RAG 엔진 미연결] ${equipName} 관련 질문을 받았습니다.\n\n실제 구현 시 FAISS 벡터 DB에서 관련 매뉴얼 문서를 검색하여 답변을 생성합니다.\n\n검색 쿼리: "${trimmed}"\n대상 장비: ${equipName}`,
        },
      ]);
      setLoading(false);
    }, 1200);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.container} className="manual-chatbot-container">
      {/* 헤더 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>📖</span>
          <span style={styles.headerTitle}>장비 매뉴얼 챗봇</span>
        </div>
        <div style={styles.headerTag}>RAG + FAISS</div>
      </div>

      {/* 장비 선택 바 */}
      <div style={styles.equipBar}>
        {EQUIPMENT_OPTIONS.map((eq) => (
          <button
            key={eq.id}
            onClick={() => handleSelectEquip(eq)}
            style={{
              ...styles.equipBtn,
              ...(selectedEquip?.id === eq.id ? styles.equipBtnActive : {}),
            }}
          >
            {eq.label}
          </button>
        ))}
      </div>

      {/* 메시지 영역 */}
      <div style={styles.messageArea}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.messageRow(msg.role)}>
            {msg.role === "assistant" && <div style={styles.avatar}>📖</div>}
            <div style={styles.bubble(msg.role)}>
              {msg.content}
            </div>
            {msg.role === "user" && <div style={styles.avatar}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={styles.messageRow("assistant")}>
            <div style={styles.avatar}>📖</div>
            <div style={styles.bubble("assistant")}>
              <span style={styles.typing}>매뉴얼 검색중...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={styles.inputArea}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedEquip
              ? `${selectedEquip.label}에 대해 질문하세요...`
              : "먼저 장비를 선택해주세요..."
          }
          style={styles.textarea}
          rows={2}
          disabled={!selectedEquip}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim() || !selectedEquip}
          style={{
            ...styles.sendButton,
            opacity: loading || !input.trim() || !selectedEquip ? 0.5 : 1,
          }}
        >
          전송
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex", flexDirection: "column", height: "640px",
    maxWidth: "760px", margin: "0 auto",
    border: "1px solid #dde1e7", borderRadius: "14px", overflow: "hidden",
    fontFamily: "'Inter', -apple-system, sans-serif",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)", backgroundColor: "#fff",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", backgroundColor: "#7B1FA2",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "8px" },
  headerIcon: { fontSize: "20px" },
  headerTitle: { color: "#fff", fontWeight: 700, fontSize: "16px" },
  headerTag: {
    backgroundColor: "rgba(255,255,255,0.2)", color: "#fff",
    padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
  },
  equipBar: {
    display: "flex", gap: "6px", padding: "10px 14px",
    backgroundColor: "#F5F0FF", borderBottom: "1px solid #E8E0F0",
    overflowX: "auto",
  },
  equipBtn: {
    padding: "6px 14px", border: "1.5px solid #CE93D8", borderRadius: "20px",
    backgroundColor: "#fff", color: "#7B1FA2", fontSize: "13px", fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
    fontFamily: "inherit",
  },
  equipBtnActive: {
    backgroundColor: "#7B1FA2", color: "#fff", borderColor: "#7B1FA2",
  },
  messageArea: {
    flex: 1, overflowY: "auto", padding: "18px 16px",
    display: "flex", flexDirection: "column", gap: "12px",
    backgroundColor: "#FAFAFE",
  },
  messageRow: (role) => ({
    display: "flex",
    flexDirection: role === "user" ? "row-reverse" : "row",
    alignItems: "flex-end", gap: "8px",
  }),
  avatar: {
    fontSize: "22px", flexShrink: 0,
    width: "34px", height: "34px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  bubble: (role) => ({
    maxWidth: "70%", padding: "10px 14px", borderRadius: "14px",
    fontSize: "14px", lineHeight: 1.65, whiteSpace: "pre-wrap",
    backgroundColor: role === "user" ? "#7B1FA2" : "#fff",
    color: role === "user" ? "#fff" : "#1a1a1a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
    borderBottomRightRadius: role === "user" ? "4px" : "14px",
    borderBottomLeftRadius: role === "assistant" ? "4px" : "14px",
  }),
  typing: { color: "#aaa", fontStyle: "italic" },
  inputArea: {
    display: "flex", gap: "8px", padding: "12px 14px",
    borderTop: "1px solid #eee", backgroundColor: "#fff",
  },
  textarea: {
    flex: 1, resize: "none", border: "1.5px solid #dde1e7",
    borderRadius: "10px", padding: "10px 12px", fontSize: "14px",
    outline: "none", fontFamily: "inherit",
  },
  sendButton: {
    padding: "0 20px", backgroundColor: "#7B1FA2", color: "#fff",
    border: "none", borderRadius: "10px", fontWeight: 700,
    cursor: "pointer", fontSize: "14px",
  },
};
