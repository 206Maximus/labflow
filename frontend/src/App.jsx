/**
 * App.jsx — LabFlow 루트 컴포넌트
 * 채팅방 목록 → 방 입장 → 챗봇 대화 흐름 관리
 */

import { useState } from "react";
import RoomList from "./components/RoomList";
import ChatBot from "./components/ChatBot";
import Calendar from "./components/Calendar";
import LogDashboard from "./components/LogDashboard";

const TABS = [
  { id: "chat", label: "🤖 챗봇 예약" },
  { id: "calendar", label: "📅 캘린더" },
  { id: "logs", label: "📊 사용 로그" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("chat");
  // 현재 입장한 방 정보 { room, nickname }
  const [currentRoom, setCurrentRoom] = useState(null);

  const handleEnterRoom = (room, nickname) => {
    setCurrentRoom({ room, nickname });
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
  };

  // 챗봇 탭 렌더링: 방 목록 or 채팅 화면
  const renderChatTab = () => {
    if (currentRoom) {
      return (
        <ChatBot
          room={currentRoom.room}
          nickname={currentRoom.nickname}
          onBack={handleLeaveRoom}
        />
      );
    }
    return <RoomList onEnterRoom={handleEnterRoom} />;
  };

  return (
    <div style={styles.app}>
      {/* 헤더 */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🔬</span>
          <span style={styles.logoText}>LabFlow</span>
          <span style={styles.logoSub}>연구실 장비 관리 플랫폼</span>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <nav style={styles.nav}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id !== "chat") setCurrentRoom(null);
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === tab.id ? styles.tabBtnActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main style={styles.main}>
        {activeTab === "chat" && renderChatTab()}
        {activeTab === "calendar" && <Calendar />}
        {activeTab === "logs" && <LogDashboard />}
      </main>

      {/* 푸터 */}
      <footer style={styles.footer}>
        <p>LabFlow v0.1.0 — AI Capstone Design Project 2026</p>
      </footer>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh", backgroundColor: "#F7F8FA",
    display: "flex", flexDirection: "column",
    fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
  },
  header: {
    padding: "16px 32px", backgroundColor: "#fff",
    borderBottom: "1px solid #dde1e7",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  logo: { display: "flex", alignItems: "center", gap: "10px" },
  logoIcon: { fontSize: "28px" },
  logoText: { fontSize: "22px", fontWeight: 700, color: "#1a1a1a" },
  logoSub: { fontSize: "13px", color: "#888", marginLeft: "4px" },
  nav: {
    display: "flex", gap: "4px", padding: "12px 32px",
    backgroundColor: "#fff", borderBottom: "1px solid #dde1e7",
  },
  tabBtn: {
    padding: "8px 20px", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "14px", fontWeight: 500,
    backgroundColor: "transparent", color: "#555", transition: "all 0.15s",
  },
  tabBtnActive: {
    backgroundColor: "#4F8EF7", color: "#fff", fontWeight: 700,
  },
  main: { flex: 1, padding: "28px 32px" },
  footer: {
    padding: "16px", textAlign: "center", color: "#aaa",
    fontSize: "12px", borderTop: "1px solid #eee",
  },
};
