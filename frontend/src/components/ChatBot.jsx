/**
 * ChatBot.jsx — LLM 챗봇 기반 예약 UI (room_id 기반 영구 대화 기록)
 */

import { useState, useRef, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

export default function ChatBot({ room, nickname, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const bottomRef = useRef(null);

  // 방 입장 시 기존 대화 기록 불러오기
  useEffect(() => {
    loadHistory();
  }, [room.id]);

  // 새 메시지마다 스크롤 하단으로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/rooms/${room.id}/messages`);
      if (res.data.length === 0) {
        // 처음 입장 시 웰컴 메시지
        setMessages([{
          id: 0, role: "assistant",
          content: `안녕하세요, ${nickname}님! 👋\n장비 예약, 현황 확인, 사용 방법 등을 물어보세요.\n예) '내일 오후 2시에 XRD 2시간 예약해줘'`,
        }]);
      } else {
        setMessages(res.data.map((m) => ({
          id: m.id, role: m.role, content: m.content,
        })));
      }
    } catch (err) {
      console.error("히스토리 로드 실패:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg = { id: Date.now(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat/`, {
        room_id: room.id,
        message: trimmed,
      });

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: res.data.reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1, role: "assistant",
          content: "⚠️ 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>← 방 목록</button>
        <div style={styles.headerCenter}>
          <span style={styles.headerTitle}>{room.room_name}</span>
          <span style={styles.headerSub}>👤 {nickname}</span>
        </div>
        <div style={{ width: 72 }} /> {/* 균형용 */}
      </div>

      {/* 메시지 영역 */}
      <div style={styles.messageArea}>
        {historyLoading ? (
          <p style={styles.loadingText}>대화 기록 불러오는 중...</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} style={styles.messageRow(msg.role)}>
              {msg.role === "assistant" && (
                <div style={styles.avatar}>🤖</div>
              )}
              <div style={styles.bubble(msg.role)}>
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div style={styles.avatar}>👤</div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div style={styles.messageRow("assistant")}>
            <div style={styles.avatar}>🤖</div>
            <div style={styles.bubble("assistant")}>
              <span style={styles.typing}>●●●</span>
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
          placeholder="메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
          style={styles.textarea}
          rows={2}
          disabled={historyLoading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim() || historyLoading}
          style={{
            ...styles.sendButton,
            opacity: loading || !input.trim() ? 0.5 : 1,
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
    fontFamily: "inherit", boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    backgroundColor: "#fff",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", backgroundColor: "#4F8EF7",
  },
  backBtn: {
    background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
    padding: "6px 12px", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "13px",
  },
  headerCenter: { display: "flex", flexDirection: "column", alignItems: "center" },
  headerTitle: { color: "#fff", fontWeight: 700, fontSize: "16px" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: "12px", marginTop: "2px" },
  messageArea: {
    flex: 1, overflowY: "auto", padding: "18px 16px",
    display: "flex", flexDirection: "column", gap: "12px",
    backgroundColor: "#f7f8fa",
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
    backgroundColor: role === "user" ? "#4F8EF7" : "#fff",
    color: role === "user" ? "#fff" : "#1a1a1a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
    borderBottomRightRadius: role === "user" ? "4px" : "14px",
    borderBottomLeftRadius: role === "assistant" ? "4px" : "14px",
  }),
  typing: { letterSpacing: "4px", color: "#aaa" },
  loadingText: { textAlign: "center", color: "#aaa", marginTop: "40px" },
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
    padding: "0 20px", backgroundColor: "#4F8EF7", color: "#fff",
    border: "none", borderRadius: "10px", fontWeight: 700,
    cursor: "pointer", fontSize: "14px",
  },
};
