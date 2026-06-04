import { useCallback, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import "./Calendar.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const EQUIPMENT_FILTERS = [
  { id: null, label: "All", color: "#1E3A8A" },
  { id: 1, label: "XRD", color: "#1976D2" },
  { id: 2, label: "SEM", color: "#388E3C" },
  { id: 3, label: "E-beam", color: "#E65100" },
  { id: 4, label: "AFM", color: "#7B1FA2" },
  { id: 5, label: "Furnace #1", color: "#00695C" },
  { id: 6, label: "Furnace #2", color: "#00695C" },
  { id: 7, label: "Furnace #3", color: "#00695C" },
  { id: 8, label: "Furnace #4", color: "#00695C" },
];

const EQUIP_NAME_MAP = {
  1: "XRD",
  2: "SEM",
  3: "E-beam",
  4: "AFM",
  5: "Furnace #1",
  6: "Furnace #2",
  7: "Furnace #3",
  8: "Furnace #4",
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

const STATUS_STYLES = {
  early_checkout: { color: "#065F46", bg: "#6EE7B7", border: "#059669", label: "Early done" },
  completed: { color: "#1F2937", bg: "#9CA3AF", border: "#6B7280", label: "Done" },
  checked_in: { color: "#7C2D12", bg: "#FCD34D", border: "#F59E0B", label: "In use" },
  confirmed: { color: "#1E3A5F", bg: "#60A5FA", border: "#3B82F6", label: "Confirmed" },
  pending: { color: "#4B2E00", bg: "#FDE68A", border: "#F59E0B", label: "Pending" },
};

function getStatusKey(reservation) {
  if (reservation.checkout_time && reservation.early_checkout) return "early_checkout";
  if (reservation.checkout_time) return "completed";
  if (reservation.checkin_time) return "checked_in";
  if (reservation.status === "confirmed") return "confirmed";
  return "pending";
}

function GoogleCalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M18.316 5.684H24v12.632h-5.684V5.684z" fill="#1A73E8" />
      <path d="M5.684 18.316H0V5.684h5.684v12.632z" fill="#EA4335" />
      <path d="M18.316 24V18.316H5.684V24h12.632z" fill="#34A853" />
      <path d="M5.684 5.684V0h12.632v5.684H5.684z" fill="#FBBC04" />
      <path d="M5.684 5.684h12.632v12.632H5.684z" fill="white" />
      <path d="M8.8 15.1V9.2h1.3v5.9H8.8zm3 0v-1.2h1.8c.7 0 1.1-.4 1.1-1s-.4-1-1.1-1h-1.8V9.2h4.1v1.2H13v1.1h.7c1.4 0 2.4.8 2.4 2.2s-1 2.3-2.5 2.3h-1.8z" fill="#1A73E8" />
    </svg>
  );
}

export default function Calendar() {
  const { auth } = useAuth();
  const [allEvents, setAllEvents] = useState([]);
  const [selectedEquip, setSelectedEquip] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalMessage, setGcalMessage] = useState("");
  const [gcalLastLink, setGcalLastLink] = useState("");

  const authConfig = useCallback(() => {
    const tokenType = auth?.token_type === "bearer" ? "Bearer" : (auth?.token_type || "Bearer");
    return { headers: { Authorization: `${tokenType} ${auth?.access_token || ""}` } };
  }, [auth]);

  const checkGcalStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/gcal/status`, authConfig());
      setGcalConnected(response.data.connected);
    } catch {
      setGcalConnected(false);
    }
  }, [authConfig]);

  useEffect(() => {
    checkGcalStatus();
    const params = new URLSearchParams(window.location.search);

    if (params.get("gcal_connected") === "true") {
      setGcalConnected(true);
      setGcalMessage("Google Calendar connected.");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setGcalMessage(""), 3000);
    }

    if (params.get("gcal_error")) {
      setGcalMessage(`Google Calendar failed: ${params.get("gcal_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setGcalMessage(""), 5000);
    }
  }, [checkGcalStatus]);

  const handleGcalConnect = async () => {
    try {
      const response = await axios.get(`${API_BASE}/gcal/auth`, authConfig());
      window.location.href = response.data.auth_url;
    } catch (error) {
      setGcalMessage(error.response?.data?.detail || "Could not start Google Calendar connection.");
      setTimeout(() => setGcalMessage(""), 5000);
    }
  };

  const handleGcalSync = async () => {
    setGcalLoading(true);
    setGcalMessage("");
    setGcalLastLink("");

    try {
      const response = await axios.post(`${API_BASE}/gcal/sync`, {}, authConfig());
      const firstLink = response.data.links?.find((link) => link.html_link)?.html_link || "";
      setGcalLastLink(firstLink);
      setGcalMessage(
        `Sync complete: ${response.data.synced} created, ${response.data.skipped} skipped, ${response.data.failed} failed.`
      );
      fetchReservations();
    } catch (error) {
      setGcalMessage(error.response?.data?.detail || "Google Calendar sync failed.");
    } finally {
      setGcalLoading(false);
      setTimeout(() => setGcalMessage(""), 7000);
    }
  };

  const handleGcalDisconnect = async () => {
    try {
      await axios.post(`${API_BASE}/gcal/disconnect`, {}, authConfig());
      setGcalConnected(false);
      setGcalLastLink("");
      setGcalMessage("Google Calendar disconnected.");
      setTimeout(() => setGcalMessage(""), 3000);
    } catch {
      setGcalMessage("Could not disconnect Google Calendar.");
    }
  };

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/reservations/?limit=100`);
      const calendarEvents = response.data.map((reservation) => {
        const statusKey = getStatusKey(reservation);
        const statusStyle = STATUS_STYLES[statusKey];
        const equipStyle = EQUIP_COLOR_MAP[reservation.equipment_id] || {
          bg: statusStyle.bg,
          border: statusStyle.border,
          text: statusStyle.color,
        };
        const equipName = EQUIP_NAME_MAP[reservation.equipment_id] || `Equipment #${reservation.equipment_id}`;

        return {
          id: String(reservation.id),
          title: `[${equipName}] ${reservation.purpose || "Reservation"}`,
          start: reservation.start_time,
          end: reservation.checkout_time || reservation.end_time,
          backgroundColor: equipStyle.bg,
          borderColor: equipStyle.border,
          textColor: equipStyle.text,
          extendedProps: { ...reservation, statusKey, statusStyle, equipName },
        };
      });
      setAllEvents(calendarEvents);
    } catch (error) {
      console.error("Reservation load failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  const filteredEvents = selectedEquip === null
    ? allEvents
    : allEvents.filter((event) => event.extendedProps.equipment_id === selectedEquip);

  const getCount = (equipId) => {
    if (equipId === null) return allEvents.length;
    return allEvents.filter((event) => event.extendedProps.equipment_id === equipId).length;
  };

  const formatDT = (value) => value
    ? new Date(value).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "-";

  const modalData = selectedEvent?.extendedProps;
  const modalStatus = modalData ? STATUS_STYLES[modalData.statusKey] : null;
  const activeFilter = EQUIPMENT_FILTERS.find((filter) => filter.id === selectedEquip);

  return (
    <div className="labflow-calendar-page" style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>
          {selectedEquip === null ? "All equipment" : activeFilter?.label} reservations
        </h2>
        <div style={styles.headerActions}>
          {gcalConnected ? (
            <>
              <button onClick={handleGcalSync} disabled={gcalLoading} style={styles.gcalSyncBtn}>
                <GoogleCalIcon />
                {gcalLoading ? "Syncing..." : "Sync to Google"}
              </button>
              <button onClick={handleGcalDisconnect} style={styles.gcalDisconnectBtn}>
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={handleGcalConnect} style={styles.gcalConnectBtn}>
              <GoogleCalIcon />
              Connect Google Calendar
            </button>
          )}
          <button onClick={fetchReservations} style={styles.refreshBtn}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {gcalMessage && (
        <div
          style={{
            ...styles.gcalMsg,
            ...(gcalMessage.toLowerCase().includes("fail") || gcalMessage.toLowerCase().includes("could")
              ? styles.gcalMsgError
              : styles.gcalMsgOk),
          }}
        >
          <span>{gcalMessage}</span>
          {gcalLastLink && (
            <a href={gcalLastLink} target="_blank" rel="noreferrer" style={styles.gcalLink}>
              Open in Google Calendar
            </a>
          )}
        </div>
      )}

      {gcalConnected && (
        <div style={styles.gcalStatus}>
          <span style={styles.gcalDot} />
          Google Calendar is connected for this LabFlow user.
        </div>
      )}

      <div style={styles.filterBar}>
        {EQUIPMENT_FILTERS.map((equipment) => {
          const isActive = selectedEquip === equipment.id;
          return (
            <button
              key={equipment.label}
              onClick={() => setSelectedEquip(equipment.id)}
              style={{
                ...styles.filterBtn,
                backgroundColor: isActive ? equipment.color : "#fff",
                color: isActive ? "#fff" : "#475569",
                borderColor: isActive ? equipment.color : "#E2E8F0",
              }}
            >
              <span>{equipment.label}</span>
              <span
                style={{
                  ...styles.filterCount,
                  backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "#F1F5F9",
                  color: isActive ? "#fff" : "#64748B",
                }}
              >
                {getCount(equipment.id)}
              </span>
            </button>
          );
        })}
      </div>

      <div style={styles.legend}>
        {Object.entries(STATUS_STYLES).map(([key, status]) => (
          <div key={key} style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: status.bg, border: `2px solid ${status.border}` }} />
            <span style={styles.legendText}>{status.label}</span>
          </div>
        ))}
      </div>

      <div className="labflow-calendar-shell">
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
          eventClick={(info) => setSelectedEvent(info.event)}
          eventContent={(eventInfo) => {
            const status = eventInfo.event.extendedProps.statusStyle;
            const equipName = eventInfo.event.extendedProps.equipName;
            const purpose = eventInfo.event.extendedProps.purpose || "Reservation";
            return (
              <div className="labflow-calendar-event" style={styles.eventInner}>
                {selectedEquip === null && <span style={styles.eventChip}>{equipName}</span>}
                <span>{purpose}</span>
                <span style={styles.eventStatus}>{status.label}</span>
              </div>
            );
          }}
          slotMinTime="09:00:00"
          slotMaxTime="18:00:00"
          height="auto"
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "18:00" }}
        />
      </div>

      {selectedEvent && modalData && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div
              style={{
                ...styles.modalStatusBadge,
                backgroundColor: modalStatus.bg,
                color: modalStatus.color,
                border: `2px solid ${modalStatus.border}`,
              }}
            >
              {modalStatus.label}
            </div>

            <h3 style={styles.modalTitle}>{modalData.equipName} reservation</h3>

            <div style={styles.modalGrid}>
              <DetailRow label="Reservation ID" value={`#${modalData.id}`} />
              <DetailRow label="Equipment" value={modalData.equipName} strong />
              <DetailRow label="User ID" value={`#${modalData.user_id}`} />
              <DetailRow label="Purpose" value={modalData.purpose || "-"} />
              <DetailRow label="Start" value={formatDT(modalData.start_time)} />
              <DetailRow label="End" value={formatDT(modalData.end_time)} />
              {modalData.checkin_time && <DetailRow label="Check-in" value={formatDT(modalData.checkin_time)} />}
              {modalData.checkout_time && <DetailRow label="Check-out" value={formatDT(modalData.checkout_time)} />}
              {modalData.gcal_event_id && <DetailRow label="Google event" value={modalData.gcal_event_id} />}
              {modalData.early_checkout && (
                <div style={styles.earlyNote}>This reservation finished earlier than planned.</div>
              )}
            </div>

            <button onClick={() => setSelectedEvent(null)} style={styles.closeBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, strong }) {
  return (
    <div style={styles.modalRow}>
      <span style={styles.modalLabel}>{label}</span>
      <span style={strong ? styles.strongValue : undefined}>{value}</span>
    </div>
  );
}

const styles = {
  container: {
    padding: "4px 0",
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#1E293B" },
  headerActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  refreshBtn: {
    padding: "7px 14px",
    backgroundColor: "#1E3A8A",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "inherit",
  },
  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
    padding: "12px 14px",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
  },
  filterBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    border: "1.5px solid",
    borderRadius: 20,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
  },
  filterCount: {
    fontSize: 11,
    fontWeight: 700,
    padding: "1px 7px",
    borderRadius: 10,
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
    padding: "10px 14px",
    backgroundColor: "#fff",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: 600, color: "#444" },
  eventInner: {
    padding: "2px 5px",
    fontSize: 11,
    fontWeight: 700,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  eventChip: {
    fontSize: 10,
    backgroundColor: "rgba(0,0,0,0.1)",
    padding: "1px 4px",
    borderRadius: 3,
    marginRight: 4,
  },
  eventStatus: {
    marginLeft: 4,
    fontSize: 9,
    backgroundColor: "rgba(0,0,0,0.12)",
    padding: "1px 4px",
    borderRadius: 3,
  },
  gcalConnectBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    backgroundColor: "#fff",
    border: "1.5px solid #E2E8F0",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    color: "#1A73E8",
    fontFamily: "inherit",
  },
  gcalSyncBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    backgroundColor: "#1A73E8",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    color: "#fff",
    fontFamily: "inherit",
  },
  gcalDisconnectBtn: {
    padding: "7px 10px",
    backgroundColor: "#F3F4F6",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "inherit",
  },
  gcalMsg: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 10,
  },
  gcalMsgOk: { backgroundColor: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" },
  gcalMsgError: { backgroundColor: "#FEF2F2", color: "#991B1B", borderColor: "#FECACA" },
  gcalLink: { color: "inherit", textDecoration: "underline", whiteSpace: "nowrap" },
  gcalStatus: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    marginBottom: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    border: "1px solid #BBF7D0",
    fontSize: 12,
    fontWeight: 600,
    color: "#166534",
  },
  gcalDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    flexShrink: 0,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 28,
    minWidth: 340,
    maxWidth: 460,
    width: "90%",
    boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
    position: "relative",
  },
  modalStatusBadge: {
    display: "inline-block",
    padding: "5px 14px",
    borderRadius: 99,
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 14,
  },
  modalTitle: { margin: "0 0 16px", fontSize: 17, fontWeight: 700 },
  modalGrid: { display: "flex", flexDirection: "column", gap: 8 },
  modalRow: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, color: "#333" },
  modalLabel: { color: "#888", fontWeight: 600 },
  strongValue: { fontWeight: 700 },
  earlyNote: {
    marginTop: 8,
    padding: "10px 14px",
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    color: "#065F46",
    fontWeight: 600,
    fontSize: 13,
    border: "1px solid #6EE7B7",
  },
  closeBtn: {
    marginTop: 20,
    width: "100%",
    padding: 10,
    backgroundColor: "#F3F4F6",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    color: "#374151",
    fontFamily: "inherit",
  },
};
