/**
 * CheckInOut.jsx — 장비 체크인 / 체크아웃 컴포넌트
 * 예약된 장비를 실제 사용 시작/종료할 때 사용합니다.
 */

import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const STATUS_MAP = {
  pending:   { label: "대기중",   color: "#F59E0B", bg: "#FEF3C7" },
  confirmed: { label: "확정",     color: "#3B82F6", bg: "#DBEAFE" },
  completed: { label: "완료",     color: "#10B981", bg: "#D1FAE5" },
  cancelled: { label: "취소",     color: "#EF4444", bg: "#FEE2E2" },
};

function formatTime(dt) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function minutesDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

export default function CheckInOut() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => { fetchReservations(); }, []);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/reservations/?limit=30`);
      // 완료/취소 제외하고 관련있는 것만
      setReservations(res.data.filter(r => r.status !== "cancelled"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleCheckin = async (id) => {
    setActionLoading(id + "_in");
    try {
      await axios.post(`${API_BASE}/reservations/${id}/checkin`);
      showMessage("✅ 체크인 완료! 장비를 안전하게 사용하세요.");
      fetchReservations();
    } catch (e) {
      showMessage("⚠️ " + (e.response?.data?.detail || "체크인 실패"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckout = async (id, reservation) => {
    setActionLoading(id + "_out");
    try {
      const res = await axios.post(`${API_BASE}/reservations/${id}/checkout`);
      if (res.data.early_checkout) {
        const savedMins = minutesDiff(res.data.checkout_time, reservation.end_time);
        showMessage(`🎉 체크아웃 완료! 예정보다 약 ${savedMins}분 일찍 끝났어요. 다음 사용자가 앞당겨 예약할 수 있습니다!`);
      } else {
        showMessage("✅ 체크아웃 완료! 수고하셨습니다.");
      }
      fetchReservations();
    } catch (e) {
      showMessage("⚠️ " + (e.response?.data?.detail || "체크아웃 실패"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>⚡ 장비 체크인 / 체크아웃</h2>
        <button onClick={fetchReservations} style={styles.refreshBtn}>
          {loading ? "⏳" : "🔄 새로고침"}
        </button>
      </div>

      {/* 알림 메시지 */}
      {message && (
        <div style={{
          ...styles.messageBox,
          backgroundColor: message.type === "error" ? "#FEE2E2" : "#D1FAE5",
          borderColor: message.type === "error" ? "#EF4444" : "#10B981",
          color: message.type === "error" ? "#DC2626" : "#065F46",
        }}>
          {message.text}
        </div>
      )}

      {/* 예약 목록 */}
      {loading ? (
        <p style={styles.emptyText}>불러오는 중...</p>
      ) : reservations.length === 0 ? (
        <div style={styles.emptyBox}>
          <p>📋 예약 내역이 없습니다.</p>
          <p style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
            챗봇에서 장비를 예약해보세요!
          </p>
        </div>
      ) : (
        <div style={styles.cardList}>
          {reservations.map((r) => {
            const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
            const isCheckedIn = !!r.checkin_time;
            const isCheckedOut = !!r.checkout_time;

            return (
              <div key={r.id} style={{
                ...styles.card,
                borderLeft: `5px solid ${st.color}`,
                opacity: isCheckedOut ? 0.7 : 1,
              }}>
                {/* 조기 완료 배지 */}
                {r.early_checkout && (
                  <div style={styles.earlyBadge}>
                    🕐 조기 완료 — 앞당겨 예약 가능!
                  </div>
                )}

                <div style={styles.cardTop}>
                  <div>
                    <div style={styles.cardTitle}>
                      🔬 장비 #{r.equipment_id}
                    </div>
                    <div style={styles.cardSub}>
                      예약 #{r.id} &nbsp;·&nbsp; 사용자 #{r.user_id}
                    </div>
                    {r.purpose && (
                      <div style={styles.purpose}>📝 {r.purpose}</div>
                    )}
                  </div>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: st.bg,
                    color: st.color,
                  }}>
                    {st.label}
                  </span>
                </div>

                {/* 시간 정보 */}
                <div style={styles.timeRow}>
                  <div style={styles.timeItem}>
                    <span style={styles.timeLabel}>📅 예약 시작</span>
                    <span>{formatTime(r.start_time)}</span>
                  </div>
                  <div style={styles.timeItem}>
                    <span style={styles.timeLabel}>📅 예약 종료</span>
                    <span>{formatTime(r.end_time)}</span>
                  </div>
                  {r.checkin_time && (
                    <div style={styles.timeItem}>
                      <span style={styles.timeLabel}>✅ 체크인</span>
                      <span style={{ color: "#3B82F6" }}>{formatTime(r.checkin_time)}</span>
                    </div>
                  )}
                  {r.checkout_time && (
                    <div style={styles.timeItem}>
                      <span style={styles.timeLabel}>🏁 체크아웃</span>
                      <span style={{ color: "#10B981" }}>{formatTime(r.checkout_time)}</span>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                {!isCheckedOut && (
                  <div style={styles.btnRow}>
                    <button
                      onClick={() => handleCheckin(r.id)}
                      disabled={isCheckedIn || actionLoading === r.id + "_in"}
                      style={{
                        ...styles.actionBtn,
                        backgroundColor: isCheckedIn ? "#E5E7EB" : "#3B82F6",
                        color: isCheckedIn ? "#9CA3AF" : "#fff",
                        cursor: isCheckedIn ? "not-allowed" : "pointer",
                      }}
                    >
                      {actionLoading === r.id + "_in" ? "처리중..." :
                       isCheckedIn ? "✅ 체크인 완료" : "🟢 체크인"}
                    </button>
                    <button
                      onClick={() => handleCheckout(r.id, r)}
                      disabled={!isCheckedIn || actionLoading === r.id + "_out"}
                      style={{
                        ...styles.actionBtn,
                        backgroundColor: !isCheckedIn ? "#E5E7EB" : "#EF4444",
                        color: !isCheckedIn ? "#9CA3AF" : "#fff",
                        cursor: !isCheckedIn ? "not-allowed" : "pointer",
                      }}
                    >
                      {actionLoading === r.id + "_out" ? "처리중..." : "🔴 체크아웃"}
                    </button>
                  </div>
                )}
                {isCheckedOut && (
                  <div style={styles.completedRow}>
                    🏁 사용 완료 &nbsp;
                    {r.early_checkout && <span style={{ color: "#F59E0B", fontWeight: 700 }}>
                      ({minutesDiff(r.checkout_time, r.start_time)}분 사용)
                    </span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: "800px", margin: "0 auto", fontFamily: "inherit" },
  header: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "18px",
  },
  title: { margin: 0, fontSize: "18px", fontWeight: 700, fontFamily: "system-ui, 'Apple SD Gothic Neo', sans-serif" },
  refreshBtn: {
    padding: "8px 14px", backgroundColor: "#4F8EF7", color: "#fff",
    border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 700,
  },
  messageBox: {
    padding: "12px 16px", borderRadius: "10px", border: "1.5px solid",
    marginBottom: "16px", fontWeight: 600, fontSize: "14px",
  },
  emptyBox: {
    textAlign: "center", padding: "48px", backgroundColor: "#fafbfc",
    borderRadius: "12px", border: "1px dashed #dde1e7", color: "#666",
  },
  emptyText: { textAlign: "center", color: "#999" },
  cardList: { display: "flex", flexDirection: "column", gap: "14px" },
  card: {
    backgroundColor: "#fff", borderRadius: "12px",
    padding: "18px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    border: "1px solid #eee", position: "relative", overflow: "hidden",
  },
  earlyBadge: {
    position: "absolute", top: 0, right: 0,
    backgroundColor: "#F59E0B", color: "#fff",
    padding: "4px 12px", fontSize: "11px", fontWeight: 700,
    borderBottomLeftRadius: "10px",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" },
  cardTitle: { fontSize: "16px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" },
  cardSub: { fontSize: "12px", color: "#888" },
  purpose: { fontSize: "12px", color: "#555", marginTop: "4px" },
  statusBadge: {
    padding: "4px 10px", borderRadius: "99px",
    fontSize: "11px", fontWeight: 700, flexShrink: 0,
  },
  timeRow: {
    display: "flex", flexWrap: "wrap", gap: "12px",
    backgroundColor: "#F7F8FA", borderRadius: "8px",
    padding: "10px 12px", marginBottom: "14px", fontSize: "12px",
  },
  timeItem: { display: "flex", flexDirection: "column", gap: "2px" },
  timeLabel: { color: "#888", fontSize: "10px" },
  btnRow: { display: "flex", gap: "10px" },
  actionBtn: {
    flex: 1, padding: "10px 0", border: "none", borderRadius: "8px",
    fontWeight: 700, fontSize: "14px", transition: "opacity 0.15s",
  },
  completedRow: {
    textAlign: "center", padding: "10px",
    backgroundColor: "#F0FDF4", borderRadius: "8px",
    color: "#065F46", fontWeight: 600, fontSize: "13px",
  },
};
