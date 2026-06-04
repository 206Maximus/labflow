import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";
import CommandCenter from "./components/CommandCenter";
import Calendar from "./components/Calendar";
import LogDashboard from "./components/LogDashboard";
import CheckInOut from "./components/CheckInOut";
import EquipmentStatus from "./components/EquipmentStatus";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage from "./pages/AuthPage";
import SafetyBadge from "./components/SafetyBadge";
import NoShowStatusButton from "./components/NoShowStatusButton";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const MENU_ITEMS = [
  { id: "command", icon: "⌂", title: "홈", desc: "AI 예약 허브" },
  { id: "status", icon: "▦", title: "장비 현황", desc: "실시간 장비 상태" },
  { id: "calendar", icon: "◫", title: "캘린더", desc: "예약 일정 확인" },
  { id: "checkin", icon: "↔", title: "체크인/아웃", desc: "장비 사용 처리" },
  { id: "logs", icon: "≡", title: "사용 로그", desc: "운영 이력" },
];

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { auth, logout } = useAuth();
  if (!auth) return <AuthPage />;
  return <AppMain auth={auth} logout={logout} />;
}

function AppMain({ auth, logout }) {
  const [activeView, setActiveView] = useState("command");
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomMessagesById, setRoomMessagesById] = useState({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");
  const displayName = useMemo(
    () => (auth.name || `User ${auth.user_id || ""}`).trim() || "LabFlow User",
    [auth.name, auth.user_id]
  );

  const setActiveRoomMessages = useCallback(
    (updater) => {
      if (!activeRoom?.id) return;
      setRoomMessagesById((prev) => {
        const current = prev[activeRoom.id] || [];
        const nextMessages = typeof updater === "function" ? updater(current) : updater;
        return { ...prev, [activeRoom.id]: nextMessages };
      });
    },
    [activeRoom?.id]
  );

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const response = await axios.get(`${API_BASE}/rooms/`, {
        params: { nickname: displayName },
      });
      const fetchedRooms = response.data || [];
      setRooms(fetchedRooms);

      if (fetchedRooms.length > 0) {
        setActiveRoom((current) => {
          if (current && fetchedRooms.some((room) => room.id === current.id)) return current;
          return fetchedRooms[0];
        });
        return;
      }

      const created = await axios.post(`${API_BASE}/rooms/`, {
        nickname: displayName,
        room_name: "새 대화",
      });
      setRooms([created.data]);
      setActiveRoom(created.data);
      setRoomMessagesById((prev) => ({ ...prev, [created.data.id]: [] }));
    } catch (err) {
      console.error("Room list load failed:", err);
      setRoomsError("대화 기록을 불러오지 못했습니다.");
    } finally {
      setRoomsLoading(false);
    }
  }, [displayName]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const createNewRoom = useCallback(async () => {
    setRoomsError("");
    try {
      const created = await axios.post(`${API_BASE}/rooms/`, {
        nickname: displayName,
        room_name: "새 대화",
      });
      setRooms((prev) => [created.data, ...prev]);
      setActiveRoom(created.data);
      setRoomMessagesById((prev) => ({ ...prev, [created.data.id]: [] }));
      setActiveView("command");
    } catch (err) {
      console.error("Room creation failed:", err);
      setRoomsError("새 대화를 만들지 못했습니다.");
    }
  }, [displayName]);

  const selectRoom = useCallback((room) => {
    setActiveRoom(room);
    setActiveView("command");
  }, []);

  const updateRoomTitleFromPrompt = useCallback((roomId, prompt) => {
    const title = buildRoomTitleFromPrompt(prompt);
    if (!title) return;

    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room;
        if (room.room_name && room.room_name !== "새 대화" && room.room_name !== "Home") return room;
        return { ...room, room_name: title };
      })
    );
    setActiveRoom((current) => {
      if (!current || current.id !== roomId) return current;
      if (current.room_name && current.room_name !== "새 대화" && current.room_name !== "Home") return current;
      return { ...current, room_name: title };
    });
  }, []);

  const currentMessages = activeRoom ? roomMessagesById[activeRoom.id] || [] : [];
  const visibleActiveRoom = activeRoom
    ? { ...activeRoom, room_name: buildRoomTitleFromPrompt(activeRoom.room_name) }
    : null;

  return (
    <div style={styles.app}>
      <TopBar auth={auth} logout={logout} />

      <div style={styles.workspace}>
        <Sidebar
          activeView={activeView}
          onSelect={setActiveView}
          rooms={rooms}
          activeRoomId={activeRoom?.id}
          roomsLoading={roomsLoading}
          roomsError={roomsError}
          onCreateRoom={createNewRoom}
          onSelectRoom={selectRoom}
        />

        <main style={styles.main}>
          {activeView === "command" && (
            <CommandCenter
              userId={auth.user_id}
              nickname={auth.name}
              auth={auth}
              activeRoom={visibleActiveRoom}
              messages={currentMessages}
              setMessages={setActiveRoomMessages}
              onRoomTitleFromPrompt={updateRoomTitleFromPrompt}
            />
          )}
          {activeView !== "command" && (
            <section style={styles.contentCard}>
              {activeView === "status" && <EquipmentStatus />}
              {activeView === "calendar" && <Calendar />}
              {activeView === "checkin" && <CheckInOut />}
              {activeView === "logs" && <LogDashboard />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function TopBar({ auth, logout }) {
  return (
    <header style={styles.topBar}>
      <div style={styles.topInner}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>LF</span>
          <div>
            <div style={styles.brandTitle}>LabFlow</div>
            <div style={styles.brandSub}>연구실 장비 관리 플랫폼</div>
          </div>
        </div>

        <div style={styles.topActions}>
          <NoShowStatusButton userId={auth.user_id} />
          <SafetyBadge userId={auth.user_id} />
          <a
            href="https://github.com/206Maximus/labflow"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            style={styles.iconButton}
          >
            <GitHubIcon />
          </a>
          <div style={styles.userCard}>
            <span style={styles.userInitial}>{auth.name?.charAt(0)?.toUpperCase() || "U"}</span>
            <div style={styles.userMeta}>
              <strong>{auth.name}</strong>
              <span>{auth.role === "admin" ? "관리자" : "연구자"}</span>
            </div>
          </div>
          <button type="button" title="설정" aria-label="설정" style={styles.iconButton}>
            ⚙
          </button>
          <button type="button" onClick={logout} style={styles.logoutButton}>
            로그아웃
          </button>
          <div style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({
  activeView,
  onSelect,
  rooms,
  activeRoomId,
  roomsLoading,
  roomsError,
  onCreateRoom,
  onSelectRoom,
}) {
  return (
    <aside style={styles.sidebar}>
      <div>
        <div style={styles.sidebarKicker}>AI Lab Ops</div>
        <h1 style={styles.sidebarTitle}>Command</h1>
        <nav style={styles.menuList}>
          {MENU_ITEMS.map((item) => {
            const active = activeView === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className="sidebar-menu-button"
                onClick={() => onSelect(item.id)}
                style={{
                  ...styles.menuItem,
                  ...(active ? styles.menuItemActive : {}),
                }}
              >
                <span style={{ ...styles.menuIcon, ...(active ? styles.menuIconActive : {}) }}>
                  {item.icon}
                </span>
                <span style={styles.menuText}>
                  <strong>{item.title}</strong>
                  <small>{item.desc}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <section style={styles.historySection}>
        <div style={styles.historyHeader}>
          <span style={styles.historyTitle}>대화 기록</span>
          <button
            type="button"
            className="sidebar-menu-button"
            onClick={onCreateRoom}
            style={styles.newChatButton}
          >
            + 새 대화
          </button>
        </div>

        {roomsError && <div style={styles.historyError}>{roomsError}</div>}
        {roomsLoading && <div style={styles.historyEmpty}>불러오는 중...</div>}
        {!roomsLoading && rooms.length === 0 && (
          <div style={styles.historyEmpty}>대화가 없습니다.</div>
        )}
        <div style={styles.roomList}>
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            return (
              <button
                type="button"
                key={room.id}
                className="sidebar-menu-button"
                onClick={() => onSelectRoom(room)}
                style={{
                  ...styles.roomButton,
                  ...(active ? styles.roomButtonActive : {}),
                }}
                title={buildRoomTitleFromPrompt(room.room_name)}
              >
                <span style={styles.roomName}>{buildRoomTitleFromPrompt(room.room_name)}</span>
                <small style={styles.roomMeta}>
                  {room.message_count ? `메시지 ${room.message_count}개` : "새 대화"}
                </small>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function buildRoomTitleFromPrompt(prompt = "") {
  const compact = String(prompt).replace(/\s+/g, " ").trim();
  if (!compact) return "새 대화";
  if (compact === "새 대화" || compact === "Home") return compact;

  const equipment = detectEquipment(compact);
  if (equipment && compact.includes("예약")) return `${equipment} 예약`;
  if (compact.includes("예약")) return "장비 예약";
  return compact.length > 16 ? `${compact.slice(0, 16)}...` : compact;
}

function detectEquipment(text) {
  const lower = text.toLowerCase();
  const furnaceMatch = lower.match(/(?:furnace|퍼니스|전기로)\s*#?\s*([1-4])/);
  if (furnaceMatch) return `Furnace #${furnaceMatch[1]}`;
  if (lower.includes("e-beam") || lower.includes("ebeam") || lower.includes("e beam") || lower.includes("이빔")) {
    return "E-beam";
  }
  if (lower.includes("sem") || lower.includes("에스이엠")) return "SEM";
  if (lower.includes("xrd") || lower.includes("엑스알디")) return "XRD";
  if (lower.includes("afm") || lower.includes("에이에프엠")) return "AFM";
  return "";
}

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-label="GitHub">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const styles = {
  app: {
    minHeight: "100vh",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif",
    backgroundColor: "#F4F8FF",
    backgroundImage: "radial-gradient(#CBDDF4 1.2px, transparent 1.2px)",
    backgroundSize: "24px 24px",
    color: "#0F172A",
  },
  topBar: {
    position: "sticky",
    top: 0,
    zIndex: 60,
    height: 60,
    backgroundColor: "#1E3A8A",
    boxShadow: "0 2px 14px rgba(30, 58, 138, 0.28)",
  },
  topInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    maxWidth: 1420,
    height: "100%",
    margin: "0 auto",
    padding: "0 24px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 220,
  },
  brandMark: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    border: "1px solid rgba(255,255,255,0.22)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 900,
  },
  brandTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1,
  },
  brandSub: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: 650,
    marginTop: 5,
  },
  topActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  iconButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
    color: "#fff",
    cursor: "pointer",
    textDecoration: "none",
    fontWeight: 800,
  },
  userCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 104,
    padding: "5px 9px 5px 6px",
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
  },
  userInitial: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#60A5FA",
    color: "#fff",
    fontSize: 12,
    fontWeight: 900,
  },
  userMeta: {
    display: "flex",
    flexDirection: "column",
    color: "#fff",
    lineHeight: 1.15,
  },
  logoutButton: {
    height: 34,
    padding: "0 14px",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
  },
  liveBadge: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    height: 34,
    padding: "0 12px",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    color: "#BAE6FD",
    fontSize: 12,
    fontWeight: 900,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    boxShadow: "0 0 0 3px rgba(34,197,94,0.20)",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr)",
    gap: 30,
    maxWidth: 1420,
    margin: "0 auto",
    padding: "20px 24px 40px",
  },
  sidebar: {
    position: "sticky",
    top: 80,
    alignSelf: "start",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 22,
    minHeight: 520,
    maxHeight: "calc(100vh - 104px)",
    padding: 18,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
  },
  sidebarKicker: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  sidebarTitle: {
    margin: "3px 0 18px",
    color: "#0F172A",
    fontSize: 20,
    lineHeight: 1.1,
  },
  menuList: {
    display: "grid",
    gap: 9,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 50,
    padding: "9px 10px",
    border: "1px solid transparent",
    borderRadius: 8,
    backgroundColor: "transparent",
    color: "#0F172A",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    outline: "none",
  },
  menuItemActive: {
    borderColor: "transparent",
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
  },
  menuIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontSize: 16,
    fontWeight: 900,
    flexShrink: 0,
  },
  menuIconActive: {
    backgroundColor: "#DBEAFE",
    color: "#1E3A8A",
  },
  menuText: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  },
  historySection: {
    display: "grid",
    gap: 10,
    minHeight: 0,
    paddingTop: 16,
    borderTop: "1px solid #E2E8F0",
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: 900,
  },
  newChatButton: {
    minHeight: 30,
    padding: "6px 9px",
    border: "1px solid transparent",
    borderRadius: 7,
    backgroundColor: "#1E3A8A",
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 850,
    outline: "none",
    whiteSpace: "nowrap",
  },
  roomList: {
    display: "grid",
    gap: 7,
    maxHeight: 250,
    overflowY: "auto",
    paddingRight: 2,
  },
  roomButton: {
    display: "grid",
    gap: 3,
    width: "100%",
    minHeight: 44,
    padding: "9px 10px",
    border: "1px solid transparent",
    borderRadius: 8,
    backgroundColor: "transparent",
    color: "#334155",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    outline: "none",
  },
  roomButtonActive: {
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
  },
  roomName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    fontWeight: 850,
  },
  roomMeta: {
    display: "none",
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: 650,
  },
  historyEmpty: {
    padding: "10px 8px",
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: 750,
  },
  historyError: {
    padding: "8px 9px",
    border: "1px solid #FDE68A",
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    color: "#92400E",
    fontSize: 12,
    fontWeight: 750,
  },
  main: {
    minWidth: 0,
  },
  contentCard: {
    minHeight: "calc(100vh - 120px)",
    padding: 24,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
  },
};
