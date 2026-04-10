/**
 * RoomList.jsx — 닉네임 입력 & 채팅방 선택 화면
 */

import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

export default function RoomList({ onEnterRoom }) {
  const [nickname, setNickname] = useState("");
  const [savedNickname, setSavedNickname] = useState(
    localStorage.getItem("labflow_nickname") || ""
  );
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (savedNickname) fetchRooms(savedNickname);
  }, [savedNickname]);

  const fetchRooms = async (nick) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/rooms/`, {
        params: { nickname: nick },
      });
      setRooms(res.data);
    } catch (err) {
      console.error("방 목록 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetNickname = () => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    localStorage.setItem("labflow_nickname", trimmed);
    setSavedNickname(trimmed);
    setNickname("");
  };

  const handleCreateRoom = async () => {
    const trimmed = newRoomName.trim();
    if (!trimmed || !savedNickname) return;
    try {
      const res = await axios.post(`${API_BASE}/rooms/`, {
        nickname: savedNickname,
        room_name: trimmed,
      });
      setRooms((prev) => [res.data, ...prev]);
      setNewRoomName("");
    } catch (err) {
      alert("방 생성에 실패했습니다.");
    }
  };

  const handleDeleteRoom = async (roomId, e) => {
    e.stopPropagation();
    if (!window.confirm("이 채팅방을 삭제하면 대화 기록도 모두 삭제됩니다. 계속할까요?")) return;
    try {
      await axios.delete(`${API_BASE}/rooms/${roomId}`);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      alert("삭제에 실패했습니다.");
    }
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleString("ko-KR", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  // ── 닉네임 미설정 화면 ─────────────────────────────────────────────────────────
  if (!savedNickname) {
    return (
      <div style={styles.centerWrap}>
        <div style={styles.nicknameCard}>
          <div style={styles.nicknameIcon}>🔬</div>
          <h2 style={styles.nicknameTitle}>LabFlow에 오신 것을 환영합니다</h2>
          <p style={styles.nicknameDesc}>사용할 닉네임을 입력해주세요.</p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetNickname()}
            placeholder="닉네임 입력"
            style={styles.nicknameInput}
            autoFocus
          />
          <button
            onClick={handleSetNickname}
            disabled={!nickname.trim()}
            style={{
              ...styles.primaryBtn,
              opacity: !nickname.trim() ? 0.5 : 1,
            }}
          >
            시작하기
          </button>
        </div>
      </div>
    );
  }

  // ── 방 목록 화면 ───────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>💬 내 채팅방</h2>
          <span style={styles.nicknameTag}>👤 {savedNickname}</span>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("labflow_nickname");
            setSavedNickname("");
            setRooms([]);
          }}
          style={styles.changeNickBtn}
        >
          닉네임 변경
        </button>
      </div>

      {/* 방 생성 */}
      <div style={styles.createRow}>
        <input
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
          placeholder="새 채팅방 이름 (예: XRD 예약 논의)"
          style={styles.createInput}
        />
        <button
          onClick={handleCreateRoom}
          disabled={!newRoomName.trim()}
          style={{
            ...styles.primaryBtn,
            opacity: !newRoomName.trim() ? 0.5 : 1,
          }}
        >
          + 방 만들기
        </button>
      </div>

      {/* 방 목록 */}
      {loading ? (
        <p style={styles.emptyText}>불러오는 중...</p>
      ) : rooms.length === 0 ? (
        <div style={styles.emptyBox}>
          <p>아직 채팅방이 없어요.</p>
          <p style={{ color: "#aaa", fontSize: "13px" }}>위에서 새 방을 만들어보세요!</p>
        </div>
      ) : (
        <div style={styles.roomList}>
          {rooms.map((room) => (
            <div
              key={room.id}
              style={styles.roomCard}
              onClick={() => onEnterRoom(room, savedNickname)}
            >
              <div style={styles.roomIcon}>💬</div>
              <div style={styles.roomInfo}>
                <div style={styles.roomName}>{room.room_name}</div>
                <div style={styles.roomMeta}>
                  대화 {room.message_count}개 · {formatDate(room.created_at)}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteRoom(room.id, e)}
                style={styles.deleteBtn}
                title="방 삭제"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  centerWrap: {
    display: "flex", justifyContent: "center", alignItems: "center",
    minHeight: "60vh",
  },
  nicknameCard: {
    backgroundColor: "#fff", borderRadius: "16px", padding: "48px 40px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)", textAlign: "center", maxWidth: "400px", width: "100%",
  },
  nicknameIcon: { fontSize: "48px", marginBottom: "16px" },
  nicknameTitle: { fontSize: "20px", fontWeight: 700, marginBottom: "8px" },
  nicknameDesc: { color: "#888", fontSize: "14px", marginBottom: "24px" },
  nicknameInput: {
    width: "100%", padding: "12px 16px", fontSize: "15px",
    border: "1.5px solid #dde1e7", borderRadius: "10px", outline: "none",
    marginBottom: "14px", boxSizing: "border-box",
  },
  container: { maxWidth: "700px", margin: "0 auto", fontFamily: "inherit" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" },
  title: { margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700 },
  nicknameTag: { fontSize: "13px", color: "#4F8EF7", fontWeight: 600 },
  changeNickBtn: {
    padding: "6px 14px", border: "1px solid #dde1e7", borderRadius: "8px",
    cursor: "pointer", backgroundColor: "#fff", fontSize: "13px", color: "#666",
  },
  createRow: { display: "flex", gap: "10px", marginBottom: "20px" },
  createInput: {
    flex: 1, padding: "11px 14px", fontSize: "14px",
    border: "1.5px solid #dde1e7", borderRadius: "10px", outline: "none",
  },
  primaryBtn: {
    padding: "11px 22px", backgroundColor: "#4F8EF7", color: "#fff",
    border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "14px",
    whiteSpace: "nowrap",
  },
  roomList: { display: "flex", flexDirection: "column", gap: "10px" },
  roomCard: {
    display: "flex", alignItems: "center", gap: "14px",
    backgroundColor: "#fff", border: "1px solid #dde1e7", borderRadius: "12px",
    padding: "16px 18px", cursor: "pointer",
    transition: "box-shadow 0.15s",
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  roomIcon: { fontSize: "28px" },
  roomInfo: { flex: 1 },
  roomName: { fontWeight: 700, fontSize: "15px", color: "#1a1a1a", marginBottom: "4px" },
  roomMeta: { fontSize: "12px", color: "#999" },
  deleteBtn: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "16px", padding: "4px 6px", borderRadius: "6px",
    opacity: 0.5,
  },
  emptyBox: {
    textAlign: "center", padding: "48px", color: "#666",
    backgroundColor: "#fafbfc", borderRadius: "12px", border: "1px dashed #dde1e7",
  },
  emptyText: { textAlign: "center", color: "#999" },
};
