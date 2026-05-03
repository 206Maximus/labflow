/**
 * Calendar.jsx — 장비별 분할 예약 캘린더 뷰
 * 장비 필터 버튼으로 개별 장비 캘린더를 전환합니다.
 * 체크인/체크아웃 상태를 색상과 아이콘으로 표시합니다.
 */

import { useState, useEffect, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

/* ── 장비 정의 ──────────────────────────────────────────────────── */
const EQUIPMENT_FILTERS = [
  { id: null,  label: "전체",        color: "#1E3A8A" },
  { id: 1,     label: "XRD",         color: "#1976D2" },
  { id: 2,     label: "SEM",         color: "#388E3C" },
  { id: 3,     label: "E-beam",      color: "#E65100" },
  { id: 4,     label: "AFM",         color: "#7B1FA2" },
  { id: 5,     label: "Furnace #1",  color: "#00695C" },
  { id: 6,     label: "Furnace #2",  color: "#00695C" },
  { id: 7,     label: "Furnace #3",  color: "#00695C" },
  { id: 8,     label: "Furnace #4",  color: "#00695C" },
];

const EQUIP_NAME_MAP = {
  1: "XRD", 2: "SEM", 3: "E-beam", 4: "AFM",
  5: "Furnace #1", 6: "Furnace #2", 7: "Furnace #3", 8: "Furnace #4",
};

const EQUIP_COLOR_MAP = {
  1: { bg: "#BBDEFB", border: "#1976D2", text: "#0D47A1" },
  2: { bg: "#C8E6C9", border: "#388E3C", text: "#1B5E20" },
  3: { bg: "#FFE0B2", border: "#E65100", text: "#BF360C" },
  4: { bg: "#E1BEE7", border: "#7B1FA2", text: "#4A148C" },
  5: { bg: "#B2DFDB", border: "#00695C", text: "#004D40" },
  6: { bg: "#B2DFDB", border: "#00695C", text: "#004D40" },
  7: { bg: "#B2DFDB", border: "#00695C", text: "#004D40" },
  8: { bg: "#B2DFDB", border: "#00695C", text: "#004D40" },
};

/* ── 상태별 스타일 ──────────────────────────────────────────────── */
const STATUS_STYLES = {
  early_checkout: { color: "#065F46", bg: "#6EE7B7", border: "#059669", icon: "⚡", label: "조기완료" },
  completed:      { color: "#1F2937", bg: "#9CA3AF", border: "#6B7280", icon: "✅", label: "사용완료" },
  checked_in:     { color: "#7C2D12", bg: "#FCD34D", border: "#F59E0B", icon: "🟢", label: "사용중" },
  confirmed:      { color: "#1E3A5F", bg: "#60A5FA", border: "#3B82F6", icon: "📋", label: "예약확정" },
  pending:        { color: "#4B2E00", bg: "#FDE68A", border: "#F59E0B", icon: "⏳", label: "대기중" },
};

function getStatusKey(r) {
  if (r.checkout_time && r.early_checkout) return "early_checkout";
  if (r.checkout_time) return "completed";
  if (r.checkin_time) return "checked_in";
  if (r.status === "confirmed") return "confirmed";
  return "pending";
}

/* ── Google Calendar 아이콘 ──────────────────────────────────────── */
const GoogleCalIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
    <path d="M18.316 5.684H24v12.632h-5.684V5.684z" fill="#1A73E8"/>
    <path d="M5.684 18.316H0V5.684h5.684v12.632z" fill="#EA4335"/>
    <path d="M18.316 24V18.316H5.684V24h12.632z" fill="#34A853"/>
    <path d="M5.684 5.684V0h12.632v5.684H5.684z" fill="#FBBC04"/>
    <path d="M18.316 5.684V0H24v5.684h-5.684z" fill="#4285F4"/>
    <path d="M18.316 18.316H24V24h-5.684v-5.684z" fill="#188038"/>
    <path d="M0 18.316h5.684V24H0v-5.684z" fill="#A50E0E"/>
    <path d="M0 0h5.684v5.684H0V0z" fill="#C5221F"/>
    <rect x="5.684" y="5.684" width="12.632" height="12.632" fill="white"/>
    <path d="M9.2 15.2V9.6h1.2v5.6H9.2zm2.4-2.2c0-.5.1-.9.4-1.2.3-.3.6-.5 1-.5.5 0 .8.2 1 .5.3.3.4.7.4 1.2 0 .5-.1.9-.4 1.2-.2.3-.6.5-1 .5-.4 0-.8-.2-1-.5-.3-.3-.4-.7-.4-1.2z" fill="#1A73E8"/>
  </svg>
);

/* ── 메인 컴포넌트 ──────────────────────────────────────────────── */
export default function Calendar() {
  const [allEvents, setAllEvents] = useState([]);
  const [selectedEquip, setSelectedEquip] = useState(null); // null = 전체
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);

  // Google Calendar 연동 상태
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalMessage, setGcalMessage] = useState("");

  // Google Calendar 연동 상태 확인
  useEffect(() => {
    checkGcalStatus();
    // URL 파라미터로 연동 결과 확인 (OAuth callback 후)
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_connected") === "true") {
      setGcalConnected(true);
      setGcalMessage("Google Calendar 연동 완료!");
      setTimeout(() => setGcalMessage(""), 3000);
      // URL 파라미터 정리
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("gcal_error")) {
      setGcalMessage("Google Calendar 연동 실패: " + params.get("gcal_error"));
      setTimeout(() => setGcalMessage(""), 5000);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const checkGcalStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/gcal/status`);
      setGcalConnected(res.data.connected);
    } catch {
      setGcalConnected(false);
    }
  };

  const handleGcalConnect = async () => {
    try {
      const res = await axios.get(`${API_BASE}/gcal/auth`);
      window.location.href = res.data.auth_url;
    } catch (err) {
      setGcalMessage("연동 URL 생성 실패. 서버 설정을 확인해주세요.");
      setTimeout(() => setGcalMessage(""), 4000);
    }
  };

  const handleGcalSync = async () => {
    setGcalLoading(true);
    setGcalMessage("");
    try {
      const res = await axios.post(`${API_BASE}/gcal/sync`);
      setGcalMessage(`동기화 완료: ${res.data.synced}개 생성, ${res.data.skipped}개 건너뜀`);
      setTimeout(() => setGcalMessage(""), 5000);
    } catch (err) {
      setGcalMessage("동기화 실패: " + (err.response?.data?.detail || err.message));
      setTimeout(() => setGcalMessage(""), 5000);
    } finally {
      setGcalLoading(false);
    }
  };

  const handleGcalDisconnect = async () => {
    try {
      await axios.post(`${API_BASE}/gcal/disconnect`);
      setGcalConnected(false);
      setGcalMessage("Google Calendar 연동이 해제되었습니다.");
      setTimeout(() => setGcalMessage(""), 3000);
    } catch {
      setGcalMessage("연동 해제 실패");
    }
  };

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/reservations/?limit=100`);
      const calEvents = res.data.map((r) => {
        const sk = getStatusKey(r);
        const st = STATUS_STYLES[sk];
        const ec = EQUIP_COLOR_MAP[r.equipment_id] || { bg: st.bg, border: st.border, text: st.color };
        const equipName = EQUIP_NAME_MAP[r.equipment_id] || `장비#${r.equipment_id}`;

        return {
          id: String(r.id),
          title: `${st.icon} [${equipName}] ${r.purpose || "예약"}`,
          start: r.start_time,
          end: r.checkout_time || r.end_time,
          backgroundColor: ec.bg,
          borderColor: ec.border,
          textColor: ec.text,
          extendedProps: { ...r, statusKey: sk, statusStyle: st, equipName },
        };
      });
      setAllEvents(calEvents);
    } catch (err) {
      console.error("예약 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  // 장비 필터 적용
  const filteredEvents = selectedEquip === null
    ? allEvents
    : allEvents.filter((e) => e.extendedProps.equipment_id === selectedEquip);

  // 선택된 장비의 예약 건수
  const getCount = (equipId) => {
    if (equipId === null) return allEvents.length;
    return allEvents.filter((e) => e.extendedProps.equipment_id === equipId).length;
  };

  const handleEventClick = (info) => {
    setSelectedEvent(info.event);
  };

  const renderEventContent = (eventInfo) => {
    const sk = eventInfo.event.extendedProps.statusKey;
    const st = STATUS_STYLES[sk];
    const equipName = eventInfo.event.extendedProps.equipName;
    const purpose = eventInfo.event.extendedProps.purpose || "예약";

    return (
      <div style={{
        padding: "2px 5px",
        fontSize: "11px",
        fontWeight: 700,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}>
        <span style={{ marginRight: 3 }}>{st.icon}</span>
        {selectedEquip === null && (
          <span style={{
            fontSize: "10px",
            backgroundColor: "rgba(0,0,0,0.1)",
            padding: "1px 4px",
            borderRadius: "3px",
            marginRight: 4,
          }}>
            {equipName}
          </span>
        )}
        {purpose}
        <span style={{
          marginLeft: 4,
          fontSize: "9px",
          backgroundColor: "rgba(0,0,0,0.12)",
          padding: "1px 4px",
          borderRadius: "3px",
        }}>
          {st.label}
        </span>
      </div>
    );
  };

  const formatDT = (dt) => dt
    ? new Date(dt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "-";

  const modalData = selectedEvent?.extendedProps;
  const modalSt = modalData ? STATUS_STYLES[modalData.statusKey] : null;
  const activeFilter = EQUIPMENT_FILTERS.find((f) => f.id === selectedEquip);

  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          📅 {selectedEquip === null ? "전체 장비" : activeFilter?.label} 예약 캘린더
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Google Calendar 연동 버튼 */}
          {gcalConnected ? (
            <>
              <button onClick={handleGcalSync} disabled={gcalLoading} style={styles.gcalSyncBtn}>
                <GoogleCalIcon />
                {gcalLoading ? "동기화중..." : "일괄 동기화"}
              </button>
              <button onClick={handleGcalDisconnect} style={styles.gcalDisconnectBtn} title="연동 해제">
                연동 해제
              </button>
            </>
          ) : (
            <button onClick={handleGcalConnect} style={styles.gcalConnectBtn}>
              <GoogleCalIcon />
              Google Calendar 연동
            </button>
          )}
          <button onClick={fetchReservations} style={styles.refreshBtn}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      {/* Google Calendar 메시지 */}
      {gcalMessage && (
        <div style={{
          ...styles.gcalMsg,
          backgroundColor: gcalMessage.includes("실패") || gcalMessage.includes("오류") ? "#FEF2F2" : "#F0FDF4",
          color: gcalMessage.includes("실패") || gcalMessage.includes("오류") ? "#991B1B" : "#166534",
          borderColor: gcalMessage.includes("실패") || gcalMessage.includes("오류") ? "#FECACA" : "#BBF7D0",
        }}>
          {gcalMessage}
        </div>
      )}

      {/* Google Calendar 연동 상태 표시 */}
      {gcalConnected && (
        <div style={styles.gcalStatus}>
          <span style={styles.gcalDot} />
          Google Calendar 연동됨 — 예약 생성/수정/삭제 시 자동 동기화
        </div>
      )}

      {/* 장비 필터 버튼 */}
      <div style={styles.filterBar}>
        {EQUIPMENT_FILTERS.map((eq) => {
          const isActive = selectedEquip === eq.id;
          const count = getCount(eq.id);
          return (
            <button
              key={eq.label}
              onClick={() => setSelectedEquip(eq.id)}
              style={{
                ...styles.filterBtn,
                backgroundColor: isActive ? eq.color : "#fff",
                color: isActive ? "#fff" : "#475569",
                borderColor: isActive ? eq.color : "#E2E8F0",
              }}
            >
              <span style={styles.filterLabel}>{eq.label}</span>
              <span style={{
                ...styles.filterCount,
                backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "#F1F5F9",
                color: isActive ? "#fff" : "#64748B",
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div style={styles.legend}>
        {Object.entries(STATUS_STYLES).map(([key, st]) => (
          <div key={key} style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: st.bg, border: `2px solid ${st.border}` }} />
            <span style={styles.legendText}>{st.icon} {st.label}</span>
          </div>
        ))}
      </div>

      {/* FullCalendar */}
      <FullCalendar
        key={selectedEquip}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        locale="ko"
        events={filteredEvents}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        slotMinTime="07:00:00"
        slotMaxTime="22:00:00"
        height="auto"
        businessHours={{ daysOfWeek: [1,2,3,4,5], startTime: "09:00", endTime: "18:00" }}
      />

      {/* 상세 모달 */}
      {selectedEvent && modalData && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{
              ...styles.modalStatusBadge,
              backgroundColor: modalSt.bg,
              color: modalSt.color,
              border: `2px solid ${modalSt.border}`,
            }}>
              {modalSt.icon} {modalSt.label}
            </div>

            <h3 style={styles.modalTitle}>
              🔬 {modalData.equipName || `장비 #${modalData.equipment_id}`} 예약
            </h3>

            <div style={styles.modalGrid}>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>예약 ID</span>
                <span>#{modalData.id}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>장비</span>
                <span style={{ fontWeight: 700 }}>{modalData.equipName}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>사용자 ID</span>
                <span>#{modalData.user_id}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>사용 목적</span>
                <span>{modalData.purpose || "-"}</span>
              </div>
              <hr style={{ borderColor: "#eee", margin: "8px 0" }} />
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>📅 예약 시작</span>
                <span>{formatDT(modalData.start_time)}</span>
              </div>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>📅 예약 종료</span>
                <span>{formatDT(modalData.end_time)}</span>
              </div>
              {modalData.checkin_time && (
                <div style={styles.modalRow}>
                  <span style={styles.modalLabel}>🟢 체크인</span>
                  <span style={{ color: "#F59E0B", fontWeight: 700 }}>{formatDT(modalData.checkin_time)}</span>
                </div>
              )}
              {modalData.checkout_time && (
                <div style={styles.modalRow}>
                  <span style={styles.modalLabel}>🏁 체크아웃</span>
                  <span style={{ color: "#10B981", fontWeight: 700 }}>{formatDT(modalData.checkout_time)}</span>
                </div>
              )}
              {modalData.early_checkout && (
                <div style={styles.earlyNote}>
                  ⚡ 예정보다 일찍 완료되었습니다. 앞당겨 예약이 가능합니다!
                </div>
              )}
            </div>

            <button onClick={() => setSelectedEvent(null)} style={styles.closeBtn}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 스타일 ──────────────────────────────────────────────────────── */
const styles = {
  container: {
    padding: "4px 0",
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "12px",
  },
  title: { margin: 0, fontSize: "18px", fontWeight: 700, color: "#1E293B" },
  refreshBtn: {
    padding: "7px 14px", backgroundColor: "#1E3A8A", color: "#fff",
    border: "none", borderRadius: "8px", cursor: "pointer",
    fontWeight: 700, fontSize: "13px",
  },

  // 장비 필터 바
  filterBar: {
    display: "flex", flexWrap: "wrap", gap: "6px",
    marginBottom: "12px", padding: "12px 14px",
    backgroundColor: "#F8FAFC", borderRadius: "12px",
    border: "1px solid #E2E8F0",
  },
  filterBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "7px 14px",
    border: "1.5px solid", borderRadius: "20px",
    cursor: "pointer", transition: "all 0.15s",
    fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
  },
  filterLabel: {},
  filterCount: {
    fontSize: "11px", fontWeight: 700,
    padding: "1px 7px", borderRadius: "10px",
  },

  // 범례
  legend: {
    display: "flex", flexWrap: "wrap", gap: "10px",
    marginBottom: "14px", padding: "10px 14px",
    backgroundColor: "#fff", borderRadius: "10px",
    border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  legendItem: { display: "flex", alignItems: "center", gap: "6px" },
  legendDot: { width: "14px", height: "14px", borderRadius: "4px" },
  legendText: { fontSize: "12px", fontWeight: 600, color: "#444" },

  // 모달
  modalOverlay: {
    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
  },
  modal: {
    backgroundColor: "#fff", borderRadius: "14px", padding: "28px",
    minWidth: "340px", maxWidth: "420px", width: "90%",
    boxShadow: "0 12px 40px rgba(0,0,0,0.2)", position: "relative",
  },
  modalStatusBadge: {
    display: "inline-block", padding: "5px 14px", borderRadius: "99px",
    fontWeight: 700, fontSize: "13px", marginBottom: "14px",
  },
  modalTitle: { margin: "0 0 16px", fontSize: "17px", fontWeight: 700 },
  modalGrid: { display: "flex", flexDirection: "column", gap: "8px" },
  modalRow: { display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#333" },
  modalLabel: { color: "#888", fontWeight: 600 },
  earlyNote: {
    marginTop: "8px", padding: "10px 14px",
    backgroundColor: "#ECFDF5", borderRadius: "8px",
    color: "#065F46", fontWeight: 600, fontSize: "13px",
    border: "1px solid #6EE7B7",
  },
  closeBtn: {
    marginTop: "20px", width: "100%", padding: "10px",
    backgroundColor: "#F3F4F6", border: "none", borderRadius: "8px",
    cursor: "pointer", fontWeight: 700, fontSize: "14px", color: "#374151",
  },

  // Google Calendar
  gcalConnectBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "7px 14px", backgroundColor: "#fff",
    border: "1.5px solid #E2E8F0", borderRadius: "8px",
    cursor: "pointer", fontWeight: 600, fontSize: "13px",
    color: "#1A73E8", fontFamily: "inherit",
    transition: "all 0.15s",
  },
  gcalSyncBtn: {
    display: "flex", alignItems: "center", gap: "6px",
    padding: "7px 14px", backgroundColor: "#1A73E8",
    border: "none", borderRadius: "8px",
    cursor: "pointer", fontWeight: 600, fontSize: "13px",
    color: "#fff", fontFamily: "inherit",
  },
  gcalDisconnectBtn: {
    padding: "7px 10px", backgroundColor: "#F3F4F6",
    border: "1px solid #E2E8F0", borderRadius: "8px",
    cursor: "pointer", fontWeight: 600, fontSize: "11px",
    color: "#6B7280", fontFamily: "inherit",
  },
  gcalMsg: {
    padding: "8px 14px", borderRadius: "8px",
    border: "1px solid", fontSize: "13px", fontWeight: 600,
    marginBottom: "10px",
  },
  gcalStatus: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "6px 14px", marginBottom: "10px",
    backgroundColor: "#F0FDF4", borderRadius: "8px",
    border: "1px solid #BBF7D0",
    fontSize: "12px", fontWeight: 600, color: "#166534",
  },
  gcalDot: {
    width: "8px", height: "8px", borderRadius: "50%",
    backgroundColor: "#22C55E", flexShrink: 0,
  },
};
