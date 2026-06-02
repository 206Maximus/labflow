/**
 * App.jsx — LabFlow 실험실 테마 메인 레이아웃 (반응형 모바일 지원)
 */

import { useState, useEffect, useCallback } from "react";
import RoomList            from "./components/RoomList";
import ChatBot             from "./components/ChatBot";
import Calendar            from "./components/Calendar";
import LogDashboard        from "./components/LogDashboard";
import CheckInOut          from "./components/CheckInOut";
import NpcStan             from "./components/NpcStan";
import BotCharacter        from "./components/BotCharacter";
import AdminLog            from "./components/AdminLog";
import EquipmentStatus     from "./components/EquipmentStatus";
import ManualChatBot       from "./components/ManualChatBot";
import FileSync            from "./components/FileSync";
import DataAnalysisChatBot from "./components/DataAnalysisChatBot";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPage            from "./pages/AuthPage";
import SafetyBadge         from "./components/SafetyBadge";
import NoShowStatusButton  from "./components/NoShowStatusButton";

// ── 탭 정의 ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "status",   icon: "🖥️",  label: "장비 현황" },
  { id: "chat",     icon: "💬",  label: "예약 챗봇" },
  { id: "manual",   icon: "📖",  label: "매뉴얼 챗봇" },
  { id: "analysis", icon: "📊",  label: "데이터 분석" },
  { id: "filesync", icon: "📁",  label: "파일 동기화" },
  { id: "checkin",  icon: "⚡",  label: "체크인/아웃" },
  { id: "calendar", icon: "📅",  label: "캘린더" },
  { id: "logs",     icon: "📋",  label: "사용 로그" },
];

// 모바일 하단 탭 (5개 고정 + 더보기)
const BOTTOM_NAV_TABS = [
  { id: "status",   icon: "🖥️",  label: "장비현황" },
  { id: "chat",     icon: "💬",  label: "예약" },
  { id: "checkin",  icon: "⚡",  label: "체크인" },
  { id: "calendar", icon: "📅",  label: "캘린더" },
  { id: "__more__", icon: "☰",  label: "더보기" },
];

// 더보기 드로어에 들어갈 탭
const MORE_TABS = [
  { id: "manual",   icon: "📖",  label: "매뉴얼 챗봇" },
  { id: "analysis", icon: "📊",  label: "데이터 분석" },
  { id: "filesync", icon: "📁",  label: "파일 동기화" },
  { id: "logs",     icon: "📋",  label: "사용 로그" },
];

// ── 모바일 감지 훅 ──────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── 최상위 컴포넌트 ────────────────────────────────────────────────────────────
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
  const [activeTab,    setActiveTab]    = useState("status");
  const [currentRoom,  setCurrentRoom]  = useState(null);
  const [adminOpen,    setAdminOpen]    = useState(false);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const isMobile = useIsMobile();

  // 탭 변경 핸들러
  const handleTabChange = useCallback((tabId) => {
    if (tabId === "__more__") {
      setDrawerOpen(true);
      return;
    }
    setActiveTab(tabId);
    setDrawerOpen(false);
    if (tabId !== "chat") setCurrentRoom(null);
  }, []);

  // 예약 챗봇 탭 렌더
  const renderChatTab = () =>
    currentRoom ? (
      <ChatBot
        room={currentRoom.room}
        nickname={currentRoom.nickname}
        userId={auth.user_id}
        onBack={() => setCurrentRoom(null)}
      />
    ) : (
      <RoomList onEnterRoom={(room, nick) => setCurrentRoom({ room, nickname: nick })} />
    );

  // 모바일에서 "더보기" 탭이 active인지 확인
  const isMoreActive = MORE_TABS.some((t) => t.id === activeTab);

  return (
    <div style={s.app}>

      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <header style={s.header}>
        <div className="header-inner-wrapper" style={s.headerInner}>

          {/* 로고 */}
          <div style={s.logo}>
            <span className="logo-icon-el" style={s.logoIcon}>🔬</span>
            <div>
              <div className="logo-title-text" style={s.logoTitle}>LabFlow</div>
              <div className="logo-sub-text" style={s.logoSub}>연구실 장비 관리 플랫폼</div>
            </div>
          </div>

          {/* 헤더 우측 */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>

            {/* PC 전용 추가 버튼 */}
            <div className="header-right-extras" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <NoShowStatusButton userId={auth.user_id} />
              <SafetyBadge userId={auth.user_id} />
              <a
                href="https://github.com/206Maximus/labflow"
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub — 206Maximus/labflow"
                style={s.githubLink}
              >
                <GitHubIcon />
              </a>
            </div>

            {/* 사용자 영역 */}
            <div style={s.userArea}>
              <div style={s.userInfo}>
                <span style={s.userAvatar}>
                  {auth.name?.charAt(0)?.toUpperCase() || "U"}
                </span>
                <div className="user-meta-block" style={s.userMeta}>
                  <span style={s.userName}>{auth.name}</span>
                  <span style={s.userRole}>
                    {auth.role === "admin" ? "👑 관리자" : "🔬 연구자"}
                  </span>
                </div>
              </div>
              <button onClick={logout} className="logout-btn-el" style={s.logoutBtn} title="로그아웃">
                로그아웃
              </button>
            </div>

            {/* LIVE 배지 (PC only) */}
            <div className="header-live-badge-el" style={s.headerBadge}>
              <span style={s.dot} /> LIVE
            </div>
          </div>
        </div>

        {/* PC 탭 네비게이션 */}
        <nav className="top-tab-nav-el" style={s.nav}>
          <div style={s.navInner}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  ...s.tabBtn,
                  ...(activeTab === tab.id ? s.tabActive : {}),
                }}
              >
                <span style={s.tabIcon}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* ── 메인 콘텐츠 ─────────────────────────────────────────────────── */}
      <main className="main-content-wrapper" style={s.main}>
        <div className="main-card-wrapper" style={s.card}>
          {activeTab === "status"   && <EquipmentStatus />}
          {activeTab === "chat"     && renderChatTab()}
          {activeTab === "manual"   && <ManualChatBot />}
          {activeTab === "analysis" && <DataAnalysisChatBot />}
          {activeTab === "filesync" && <FileSync />}
          {activeTab === "checkin"  && <CheckInOut />}
          {activeTab === "calendar" && <Calendar />}
          {activeTab === "logs"     && <LogDashboard />}
        </div>
      </main>

      {/* ── 푸터 ─────────────────────────────────────────────────────────── */}
      <footer style={s.footer}>
        <div className="footer-bar-el" style={s.footerBar}>
          <div style={s.footerDeco}><MoleculeDecor /></div>
          <div style={s.characters}>
            <NpcStan />
            <div style={s.divider} />
            <BotCharacter onOpenChat={() => setActiveTab("chat")} />
          </div>
          <div style={s.footerDeco}><FlaskDecor /></div>
        </div>
        <div className="footer-copyright-el" style={s.copyright}>
          <span>⚗️ LabFlow v0.2.0</span>
          <span style={{ color: "#94A3B8" }}>·</span>
          <span>AI Capstone Design Project 2026</span>
          <span style={{ color: "#94A3B8" }}>·</span>
          <span>Powered by Claude API</span>
        </div>
      </footer>

      {/* ── 관리자 FAB ────────────────────────────────────────────────────── */}
      <button
        onClick={() => setAdminOpen(true)}
        className="admin-fab-el"
        style={s.adminFab}
        title="관리자 — 연구 일지"
      >
        <span className="fab-icon-el" style={s.fabIcon}>📔</span>
        <span className="fab-label-el" style={s.fabLabel}>연구 일지</span>
      </button>

      {/* ── 관리자 로그 패널 ─────────────────────────────────────────────── */}
      {adminOpen && <AdminLog onClose={() => setAdminOpen(false)} />}

      {/* ── 모바일 하단 네비게이션 바 ────────────────────────────────────── */}
      <div className="mobile-bottom-nav">
        <div className="nav-items">
          {BOTTOM_NAV_TABS.map((tab) => {
            const isActive =
              tab.id === "__more__"
                ? isMoreActive || drawerOpen
                : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="nav-icon">{tab.icon}</span>
                <span className="nav-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 모바일 더보기 오버레이 ───────────────────────────────────────── */}
      <div
        className={`mobile-overlay${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* ── 모바일 더보기 드로어 ─────────────────────────────────────────── */}
      <div className={`mobile-more-drawer${drawerOpen ? " open" : ""}`}>
        <div className="drawer-handle" />
        <div className="drawer-title">더 많은 기능</div>
        <div className="drawer-grid">
          {MORE_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`drawer-item${activeTab === tab.id ? " active-item" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="d-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          {/* 관리자 버튼 (드로어 내) */}
          <button
            className="drawer-item"
            onClick={() => { setAdminOpen(true); setDrawerOpen(false); }}
          >
            <span className="d-icon">📔</span>
            연구 일지
          </button>
        </div>
      </div>

    </div>
  );
}

// ── GitHub 아이콘 ─────────────────────────────────────────────────────────────
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-label="GitHub">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
);

// ── 장식 컴포넌트 ─────────────────────────────────────────────────────────────
const MoleculeDecor = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" style={{ opacity: 0.18 }}>
    <circle cx="40" cy="40" r="10" fill="#1E3A8A" />
    <circle cx="14" cy="28" r="7"  fill="#2563EB" />
    <circle cx="66" cy="28" r="7"  fill="#2563EB" />
    <circle cx="14" cy="52" r="7"  fill="#2563EB" />
    <circle cx="66" cy="52" r="7"  fill="#2563EB" />
    <line x1="40" y1="40" x2="14" y2="28" stroke="#1E3A8A" strokeWidth="2.5" />
    <line x1="40" y1="40" x2="66" y2="28" stroke="#1E3A8A" strokeWidth="2.5" />
    <line x1="40" y1="40" x2="14" y2="52" stroke="#1E3A8A" strokeWidth="2.5" />
    <line x1="40" y1="40" x2="66" y2="52" stroke="#1E3A8A" strokeWidth="2.5" />
  </svg>
);

const FlaskDecor = () => (
  <svg width="60" height="80" viewBox="0 0 60 80" style={{ opacity: 0.18 }}>
    <rect x="24" y="4"  width="12" height="30" rx="2" fill="#1E3A8A" />
    <path d="M 12 80 L 24 34 L 36 34 L 48 80 Z" fill="#2563EB" />
    <circle cx="22" cy="62" r="4"  fill="#1E3A8A" />
    <circle cx="35" cy="70" r="3"  fill="#1E3A8A" />
    <circle cx="28" cy="74" r="2"  fill="#1E3A8A" />
    <rect x="20" y="4" width="20" height="4" rx="2" fill="#1E3A8A" />
  </svg>
);

// ── 스타일 ─────────────────────────────────────────────────────────────────────
const s = {
  app: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Inter', -apple-system, 'Apple SD Gothic Neo', sans-serif",
  },

  // GitHub 링크
  githubLink: {
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: "50%",
    width: "36px", height: "36px",
    textDecoration: "none",
    transition: "all 0.15s",
    border: "1px solid rgba(255,255,255,0.2)",
  },

  // 헤더
  header: {
    backgroundColor: "#1E3A8A",
    boxShadow: "0 2px 12px rgba(30,58,138,0.4)",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    maxWidth: "1200px", margin: "0 auto",
    padding: "14px 28px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  logo: { display: "flex", alignItems: "center", gap: "12px" },
  logoIcon: { fontSize: "32px", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" },
  logoTitle: { fontSize: "24px", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" },
  logoSub: { fontSize: "13px", color: "rgba(255,255,255,0.65)", marginTop: "2px", fontWeight: 400 },
  headerBadge: {
    display: "flex", alignItems: "center", gap: "6px",
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: "5px 14px", borderRadius: "20px",
    fontSize: "13px", color: "#BAE6FD", fontWeight: 700, letterSpacing: "1px",
  },
  dot: {
    width: "7px", height: "7px", borderRadius: "50%",
    backgroundColor: "#4ADE80", display: "inline-block",
    boxShadow: "0 0 0 3px rgba(74,222,128,0.3)",
    animation: "pulse 2s infinite",
  },

  // 탭 네비게이션 (PC)
  nav: { borderTop: "1px solid rgba(255,255,255,0.1)", overflowX: "auto" },
  navInner: {
    maxWidth: "1200px", margin: "0 auto",
    padding: "0 24px",
    display: "flex", gap: "2px",
  },
  tabBtn: {
    display: "flex", alignItems: "center", gap: "5px",
    padding: "12px 16px",
    backgroundColor: "transparent", border: "none",
    color: "rgba(255,255,255,0.6)",
    fontSize: "14px", fontWeight: 500,
    cursor: "pointer", borderBottom: "3px solid transparent",
    transition: "all 0.15s", fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  tabActive: {
    color: "#fff", fontWeight: 700,
    borderBottom: "3px solid #60A5FA",
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  tabIcon: { fontSize: "15px" },

  // 메인
  main: {
    flex: 1,
    padding: "28px 24px",
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "14px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.06)",
    border: "1px solid #E2E8F0",
    padding: "28px",
    animation: "fadeSlideIn 0.25s ease-out",
    minHeight: "400px",
  },

  // 푸터
  footer: { backgroundColor: "#F8FAFC", borderTop: "1px solid #E2E8F0", marginTop: "auto" },
  footerBar: {
    maxWidth: "1200px", margin: "0 auto",
    padding: "20px 40px",
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
  },
  footerDeco: { display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 },
  characters: { display: "flex", alignItems: "flex-end", gap: "32px" },
  divider: { width: "1px", height: "120px", backgroundColor: "#CBD5E1", alignSelf: "center" },
  copyright: {
    borderTop: "1px solid #E2E8F0",
    padding: "10px 24px",
    display: "flex", justifyContent: "center", gap: "12px",
    fontSize: "13px", color: "#64748B", flexWrap: "wrap",
  },

  // 사용자 영역
  userArea: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "5px 10px 5px 6px",
    border: "1px solid rgba(255,255,255,0.15)",
  },
  userInfo: { display: "flex", alignItems: "center", gap: 8 },
  userAvatar: {
    width: 30, height: 30, borderRadius: "50%",
    background: "linear-gradient(135deg, #60A5FA, #818CF8)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
  },
  userMeta: { display: "flex", flexDirection: "column", lineHeight: 1.3 },
  userName: { fontSize: 13, fontWeight: 700, color: "#fff" },
  userRole: { fontSize: 11, color: "rgba(255,255,255,0.65)" },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 7, color: "rgba(255,255,255,0.85)",
    fontSize: 11, fontWeight: 600,
    padding: "4px 10px", cursor: "pointer",
    transition: "all 0.15s",
  },

  // 관리자 FAB
  adminFab: {
    position: "fixed", bottom: "28px", right: "28px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
    backgroundColor: "#1E3A8A",
    color: "#fff", border: "none", borderRadius: "14px",
    padding: "12px 16px", cursor: "pointer",
    boxShadow: "0 4px 16px rgba(30,58,138,0.4)",
    transition: "transform 0.15s, box-shadow 0.15s",
    zIndex: 100,
  },
  fabIcon: { fontSize: "24px" },
  fabLabel: { fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", color: "rgba(255,255,255,0.85)" },
};
