/**
 * Calendar.jsx — 장비 예약 캘린더 뷰 컴포넌트
 * FullCalendar.js를 사용하여 예약 현황을 시각화합니다.
 *
 * 필요 패키지:
 *   npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
 */

import { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

// 장비별 색상 매핑
const EQUIPMENT_COLORS = {
  XRD: "#4F8EF7",
  SEM: "#43C59E",
  TEM: "#F76C6C",
  default: "#9B8AE0",
};

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);

  // 예약 목록 불러오기
  useEffect(() => {
    fetchReservations();
  }, []);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/reservations/`);
      const calEvents = res.data.map((r) => ({
        id: String(r.id),
        title: `[${r.equipment_name || "장비"}] ${r.user_name || "사용자"}`,
        start: r.start_time,
        end: r.end_time,
        backgroundColor:
          EQUIPMENT_COLORS[r.equipment_name] || EQUIPMENT_COLORS.default,
        borderColor:
          EQUIPMENT_COLORS[r.equipment_name] || EQUIPMENT_COLORS.default,
        extendedProps: { ...r },
      }));
      setEvents(calEvents);
    } catch (err) {
      console.error("예약 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  // 날짜 클릭 → 새 예약 모달 (추후 구현)
  const handleDateClick = (info) => {
    alert(`${info.dateStr} 에 새 예약을 추가하려면 챗봇을 이용해주세요.`);
  };

  // 이벤트 클릭 → 상세 보기
  const handleEventClick = (info) => {
    setSelectedEvent(info.event.extendedProps);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📅 장비 예약 캘린더</h2>
        <button onClick={fetchReservations} style={styles.refreshBtn}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        locale="ko"
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        slotMinTime="08:00:00"
        slotMaxTime="22:00:00"
        height="auto"
        businessHours={{
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: "09:00",
          endTime: "18:00",
        }}
      />

      {/* 이벤트 상세 모달 */}
      {selectedEvent && (
        <div style={styles.modal} onClick={() => setSelectedEvent(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>예약 상세</h3>
            <p><strong>장비:</strong> {selectedEvent.equipment_id}</p>
            <p><strong>예약자:</strong> {selectedEvent.user_id}</p>
            <p><strong>목적:</strong> {selectedEvent.purpose || "-"}</p>
            <p><strong>상태:</strong> {selectedEvent.status}</p>
            <p><strong>시작:</strong> {new Date(selectedEvent.start_time).toLocaleString("ko-KR")}</p>
            <p><strong>종료:</strong> {new Date(selectedEvent.end_time).toLocaleString("ko-KR")}</p>
            <button onClick={() => setSelectedEvent(null)} style={styles.closeBtn}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "20px",
    maxWidth: "1100px",
    margin: "0 auto",
    fontFamily: "Pretendard, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  title: { margin: 0, fontSize: "20px" },
  refreshBtn: {
    padding: "8px 16px",
    backgroundColor: "#4F8EF7",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
  },
  modal: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "28px",
    minWidth: "320px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
  },
  closeBtn: {
    marginTop: "12px",
    padding: "8px 20px",
    backgroundColor: "#F0F2F5",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
  },
};
