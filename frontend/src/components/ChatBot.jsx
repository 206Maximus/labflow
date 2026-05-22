import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const QUICK_INPUTS = [
  "이번 주 SEM 2시간 연속 슬롯 찾아줘",
  "내일 오후 2시에 XRD 1시간 예약해줘",
  "이번 주 TEM 3시간 슬롯 찾아줘",
];

const styles = {
  container: {
    display: "flex", flexDirection: "column", height: "100vh",
    fontFamily: "'Segoe UI', sans-serif", background: "#f5f5f5",
  },
  header: {
    background: "#1565c0", color: "#fff", padding: "12px 20px",
    display: "flex", alignItems: "center", gap: 10,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  subtitle: { fontSize: 12, opacity: 0.8 },
  messages: {
    flex: 1, overflowY: "auto", padding: "16px 20px",
    display: "flex", flexDirection: "column", gap: 14,
  },
  msgRow: (role) => ({
    display: "flex",
    justifyContent: role === "user" ? "flex-end" : "flex-start",
    gap: 8, alignItems: "flex-start",
  }),
  avatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "#1565c0", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, flexShrink: 0,
  },
  bubble: (role) => ({
    maxWidth: "70%", padding: "10px 14px", borderRadius: 14,
    background: role === "user" ? "#1565c0" : "#fff",
    color: role === "user" ? "#fff" : "#333",
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    lineHeight: 1.6, fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word",
  }),
  badge: (type) => ({
    display: "inline-block", marginTop: 6, fontSize: 12,
    padding: "3px 10px", borderRadius: 10,
    background: type === "success" ? "#e8f5e9" : "#fff3e0",
    color: type === "success" ? "#2e7d32" : "#e65100",
    border: `1px solid ${type === "success" ? "#a5d6a7" : "#ffcc80"}`,
  }),
  slotsBox: {
    marginTop: 10, display: "flex", flexDirection: "column", gap: 6,
  },
  slotBtn: {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #1565c0",
    background: "#e3f2fd", color: "#1565c0", cursor: "pointer",
    fontSize: 13, fontWeight: 600, textAlign: "left",
    transition: "background 0.15s",
  },
  quickArea: {
    padding: "0 20px 10px", display: "flex", flexWrap: "wrap", gap: 8,
  },
  quickBtn: {
    padding: "6px 14px", borderRadius: 20,
    border: "1px solid #90caf9", background: "#e3f2fd",
    color: "#1565c0", cursor: "pointer", fontSize: 13,
  },
  inputArea: {
    padding: "12px 20px", background: "#fff",
    borderTop: "1px solid #e0e0e0",
    display: "flex", gap: 10,
  },
  input: {
    flex: 1, padding: "10px 14px", borderRadius: 8,
    border: "1px solid #ccc", fontSize: 14, outline: "none",
  },
  sendBtn: {
    padding: "10px 22px", borderRadius: 8, border: "none",
    background: "#1565c0", color: "#fff", cursor: "pointer",
    fontSize: 14, fontWeight: 600,
  },
};

function FormattedContent({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

export default function ChatBot({ roomId }) {
  const [messages, setMessages] = useState([
    {
      id: 1, role: "assistant",
      content: "안녕하세요! LabFlow AI 예약 도우미입니다.\n아래 예시를 클릭하거나 직접 입력해보세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingSlots, setPendingSlots] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef(null);

  const activeRoomId = roomId || 1;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setPendingSlots(null);
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/chat/`, {
        message: msg,
        room_id: activeRoomId,
        history: [],
      });
      const { reply, action, slots, data } = res.data;
      const newMsg = {
        id: Date.now() + 1, role: "assistant", content: reply,
        action, data,
      };
      setMessages((prev) => [...prev, newMsg]);
      if (action === "suggest_slots" && slots && slots.length > 0) {
        setPendingSlots({ slots, data });
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, role: "assistant",
        content: `❌ 오류: ${err.response?.data?.detail || err.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeRoomId]);

  const confirmSlot = useCallback(async (slot) => {
    if (confirming) return;
    setConfirming(true);
    setPendingSlots(null);
    const equip_id = pendingSlots?.data?.equipment_id || 1;
    const purpose = pendingSlots?.data?.purpose || "연구 목적";
    try {
      const res = await axios.post(`${API_BASE}/chat/confirm-slot`, {
        equipment_id: equip_id,
        start_time: slot.start_time,
        end_time: slot.end_time,
        purpose,
        user_id: 1,
        room_id: activeRoomId,
      });
      const { reply, action } = res.data;
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant", content: reply, action,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `❌ 예약 확정 오류: ${err.response?.data?.detail || err.message}`,
      }]);
    } finally {
      setConfirming(false);
    }
  }, [confirming, pendingSlots, activeRoomId]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>🤖 AI 예약 챗봇</div>
          <div style={styles.subtitle}>자연어로 장비 예약 · LLM 기반</div>
        </div>
      </div>

      <div style={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.msgRow(msg.role)}>
            {msg.role === "assistant" && <div style={styles.avatar}>🤖</div>}
            <div>
              <div style={styles.bubble(msg.role)}>
                <FormattedContent text={msg.content} />
              </div>
              {msg.action === "reservation_created" && (
                <div style={styles.badge("success")}>
                  ✅ 예약 완료 — 캘린더 탭에서 확인하세요
                </div>
              )}
              {msg.action === "conflict" && (
                <div style={styles.badge("warn")}>
                  ⚠️ 시간 충돌 — 다른 슬롯을 선택해주세요
                </div>
              )}
            </div>
          </div>
        ))}

        {pendingSlots && (
          <div style={{ paddingLeft: 40 }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
              슬롯을 선택하면 즉시 예약됩니다:
            </div>
            <div style={styles.slotsBox}>
              {pendingSlots.slots.map((slot, i) => (
                <button
                  key={i}
                  style={styles.slotBtn}
                  onClick={() => confirmSlot(slot)}
                  disabled={confirming}
                >
                  [{i + 1}] {slot.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={styles.msgRow("assistant")}>
            <div style={styles.avatar}>🤖</div>
            <div style={{ ...styles.bubble("assistant"), color: "#999" }}>분석 중●●●</div>
          </div>
        )}
        {confirming && (
          <div style={styles.msgRow("assistant")}>
            <div style={styles.avatar}>🤖</div>
            <div style={{ ...styles.bubble("assistant"), color: "#999" }}>예약 확정 중●●●</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div style={styles.quickArea}>
          {QUICK_INPUTS.map((q, i) => (
            <button key={i} style={styles.quickBtn} onClick={() => sendMessage(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="예: 이번 주 SEM 2시간 연속 슬롯 찾아줘"
          disabled={loading || confirming}
        />
        <button
          style={styles.sendBtn}
          onClick={() => sendMessage()}
          disabled={loading || confirming}
        >
          전송
        </button>
      </div>
    </div>
  );
}
