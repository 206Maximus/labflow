/**
 * EquipmentStatus.jsx — 장비 현황 시각화 (사용중 / 대기중 상태)
 * XRD, SEM, E-beam, AFM, Furnace(4대) 총 8개 장비 표시
 */

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

/* ── 장비 정의 ─────────────────────────────────────────────────── */
const EQUIPMENT_LIST = [
  { id: 1, name: "XRD",        fullName: "X-Ray Diffractometer",    icon: "xrd" },
  { id: 2, name: "SEM",        fullName: "Scanning Electron Microscope", icon: "sem" },
  { id: 3, name: "E-beam",     fullName: "E-beam Evaporator",       icon: "ebeam" },
  { id: 4, name: "AFM",        fullName: "Atomic Force Microscope", icon: "afm" },
  { id: 5, name: "Furnace #1", fullName: "전기로 1호기",             icon: "furnace" },
  { id: 6, name: "Furnace #2", fullName: "전기로 2호기",             icon: "furnace" },
  { id: 7, name: "Furnace #3", fullName: "전기로 3호기",             icon: "furnace" },
  { id: 8, name: "Furnace #4", fullName: "전기로 4호기",             icon: "furnace" },
];

/* ── 장비 아이콘 SVG 컴포넌트들 ────────────────────────────────── */
const EquipmentIcon = ({ type, size = 64 }) => {
  const s = size;
  const icons = {
    xrd: (
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <rect x="8" y="20" width="48" height="38" rx="4" fill="#E3F2FD" stroke="#1976D2" strokeWidth="2"/>
        <rect x="12" y="24" width="40" height="24" rx="2" fill="#fff" stroke="#90CAF9" strokeWidth="1.5"/>
        <circle cx="32" cy="36" r="8" fill="none" stroke="#1976D2" strokeWidth="2" strokeDasharray="3 2"/>
        <line x1="32" y1="28" x2="32" y2="44" stroke="#F44336" strokeWidth="1.5"/>
        <line x1="24" y1="36" x2="40" y2="36" stroke="#F44336" strokeWidth="1.5"/>
        <rect x="20" y="8" width="24" height="14" rx="3" fill="#BBDEFB" stroke="#1976D2" strokeWidth="1.5"/>
        <text x="32" y="18" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1565C0">XRD</text>
      </svg>
    ),
    sem: (
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <rect x="18" y="30" width="28" height="28" rx="3" fill="#E8F5E9" stroke="#388E3C" strokeWidth="2"/>
        <rect x="8" y="10" width="16" height="42" rx="3" fill="#C8E6C9" stroke="#388E3C" strokeWidth="1.5"/>
        <circle cx="16" cy="20" r="4" fill="#388E3C"/>
        <line x1="16" y1="24" x2="16" y2="48" stroke="#388E3C" strokeWidth="2"/>
        <rect x="40" y="14" width="18" height="12" rx="2" fill="#E8F5E9" stroke="#66BB6A" strokeWidth="1.5"/>
        <rect x="42" y="16" width="14" height="8" rx="1" fill="#A5D6A7"/>
        <rect x="40" y="28" width="18" height="12" rx="2" fill="#E8F5E9" stroke="#66BB6A" strokeWidth="1.5"/>
        <rect x="42" y="30" width="14" height="8" rx="1" fill="#A5D6A7"/>
        <text x="32" y="62" textAnchor="middle" fontSize="7" fontWeight="700" fill="#2E7D32">SEM</text>
      </svg>
    ),
    ebeam: (
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <rect x="12" y="6" width="20" height="52" rx="4" fill="#FFF3E0" stroke="#E65100" strokeWidth="2"/>
        <rect x="14" y="10" width="16" height="20" rx="2" fill="#FFE0B2"/>
        <circle cx="22" cy="20" r="5" fill="none" stroke="#FF6D00" strokeWidth="2"/>
        <circle cx="22" cy="20" r="2" fill="#FF6D00"/>
        <rect x="36" y="16" width="20" height="38" rx="3" fill="#FFF3E0" stroke="#E65100" strokeWidth="1.5"/>
        <rect x="38" y="18" width="16" height="10" rx="2" fill="#FFE0B2"/>
        <line x1="40" y1="22" x2="52" y2="22" stroke="#FF6D00" strokeWidth="1"/>
        <line x1="40" y1="25" x2="52" y2="25" stroke="#FF6D00" strokeWidth="1"/>
        <circle cx="46" cy="42" r="4" fill="#FFB74D" stroke="#E65100" strokeWidth="1.5"/>
        <text x="32" y="62" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#BF360C">E-beam</text>
      </svg>
    ),
    afm: (
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <rect x="10" y="28" width="44" height="28" rx="4" fill="#F3E5F5" stroke="#7B1FA2" strokeWidth="2"/>
        <rect x="14" y="32" width="36" height="20" rx="2" fill="#EDE7F6"/>
        <rect x="22" y="8" width="20" height="22" rx="3" fill="#CE93D8" stroke="#7B1FA2" strokeWidth="1.5"/>
        <line x1="32" y1="30" x2="32" y2="44" stroke="#7B1FA2" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="32" cy="46" r="3" fill="#7B1FA2"/>
        <line x1="26" y1="16" x2="38" y2="16" stroke="#7B1FA2" strokeWidth="1.5"/>
        <line x1="26" y1="20" x2="38" y2="20" stroke="#AB47BC" strokeWidth="1"/>
        <text x="32" y="62" textAnchor="middle" fontSize="7" fontWeight="700" fill="#4A148C">AFM</text>
      </svg>
    ),
    furnace: (
      <svg viewBox="0 0 64 64" width={s} height={s}>
        <rect x="8" y="14" width="48" height="40" rx="4" fill="#E8F5E9" stroke="#2E7D32" strokeWidth="2"/>
        <rect x="12" y="18" width="40" height="24" rx="2" fill="#FFF9C4" stroke="#F9A825" strokeWidth="1.5"/>
        <rect x="14" y="20" width="36" height="20" rx="1" fill="#FFEE58" opacity="0.5"/>
        <path d="M 22 38 Q 24 28 26 38 Q 28 28 30 38" stroke="#FF6F00" strokeWidth="1.5" fill="none"/>
        <path d="M 34 38 Q 36 28 38 38 Q 40 28 42 38" stroke="#FF6F00" strokeWidth="1.5" fill="none"/>
        <rect x="8" y="8" width="48" height="8" rx="3" fill="#A5D6A7" stroke="#2E7D32" strokeWidth="1.5"/>
        <rect x="18" y="44" width="12" height="6" rx="1" fill="#FFCC80" stroke="#E65100" strokeWidth="1"/>
        <rect x="34" y="44" width="12" height="6" rx="1" fill="#FFCC80" stroke="#E65100" strokeWidth="1"/>
        <rect x="8" y="52" width="48" height="6" rx="2" fill="#81C784"/>
      </svg>
    ),
  };
  return icons[type] || null;
};

/* ── 메인 컴포넌트 ─────────────────────────────────────────────── */
export default function EquipmentStatus() {
  // key: equipment_id, value: { inUse, user, purpose, endTime }
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/reservations/?limit=100`);
      const now = new Date();
      const map = {};

      // 현재 시간 기준 체크인 상태인 예약 → 사용중
      res.data.forEach((r) => {
        if (r.checkin_time && !r.checkout_time) {
          map[r.equipment_id] = {
            inUse: true,
            user: r.user_id,
            purpose: r.purpose || "",
            endTime: r.end_time,
          };
        }
      });
      setStatusMap(map);
    } catch (err) {
      console.error("장비 현황 로드 실패:", err);
      // 데모 데이터 (서버 미연결 시)
      setStatusMap({
        1: { inUse: true, user: "김연구", purpose: "결정 구조 분석", endTime: "2026-04-16T17:00:00" },
        3: { inUse: true, user: "이실험", purpose: "박막 증착", endTime: "2026-04-16T16:30:00" },
        5: { inUse: true, user: "박열처리", purpose: "어닐링 800°C", endTime: "2026-04-16T18:00:00" },
        7: { inUse: true, user: "최소결", purpose: "소결 1200°C", endTime: "2026-04-16T20:00:00" },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const formatTime = (dt) => {
    if (!dt) return "";
    return new Date(dt).toLocaleString("ko-KR", {
      hour: "2-digit", minute: "2-digit",
    });
  };

  const usedCount = EQUIPMENT_LIST.filter((eq) => statusMap[eq.id]?.inUse).length;
  const totalCount = EQUIPMENT_LIST.length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>장비 현황</h2>
        <div style={styles.summary}>
          <span style={styles.summaryBadge}>
            <span style={{ ...styles.dot, backgroundColor: "#EF5350" }} /> 사용중 {usedCount}
          </span>
          <span style={styles.summaryBadge}>
            <span style={{ ...styles.dot, backgroundColor: "#4CAF50" }} /> 대기중 {totalCount - usedCount}
          </span>
          <button onClick={fetchStatus} style={styles.refreshBtn}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      <div style={styles.grid} className="eq-grid-mobile">
        {EQUIPMENT_LIST.map((eq) => {
          const status = statusMap[eq.id];
          const inUse = status?.inUse || false;

          return (
            <div
              key={eq.id}
              className="eq-card-mobile"
              style={{
                ...styles.card,
                borderColor: inUse ? "#EF5350" : "#4CAF50",
                backgroundColor: inUse ? "#FFF5F5" : "#F0FFF4",
              }}
            >
              {/* 상태 뱃지 */}
              <div style={{
                ...styles.statusBadge,
                backgroundColor: inUse ? "#EF5350" : "#4CAF50",
              }}>
                {inUse ? "사용중" : "대기중"}
              </div>

              {/* 장비 아이콘 */}
              <div style={styles.iconArea} className="eq-icon-mobile">
                <EquipmentIcon type={eq.icon} size={72} />
              </div>

              {/* 장비 이름 */}
              <div style={styles.eqName} className="eq-name-mobile">{eq.name}</div>
              <div style={styles.eqFullName}>{eq.fullName}</div>

              {/* 상태 정보 */}
              {inUse ? (
                <div style={styles.infoBox}>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>사용자</span>
                    <span style={styles.infoValue}>{status.user}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>목적</span>
                    <span style={styles.infoValue}>{status.purpose}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>종료</span>
                    <span style={{ ...styles.infoValue, color: "#EF5350", fontWeight: 700 }}>
                      {formatTime(status.endTime)}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={styles.availableBox}>
                  예약 가능
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 스타일 ──────────────────────────────────────────────────────── */
const styles = {
  container: {
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "20px", flexWrap: "wrap", gap: "12px",
  },
  title: {
    margin: 0, fontSize: "20px", fontWeight: 700, color: "#1E293B",
  },
  summary: {
    display: "flex", alignItems: "center", gap: "12px",
  },
  summaryBadge: {
    display: "flex", alignItems: "center", gap: "6px",
    fontSize: "14px", fontWeight: 600, color: "#475569",
  },
  dot: {
    width: "10px", height: "10px", borderRadius: "50%", display: "inline-block",
  },
  refreshBtn: {
    padding: "6px 14px", backgroundColor: "#1E3A8A", color: "#fff",
    border: "none", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "13px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
  },
  card: {
    position: "relative",
    padding: "20px 16px 16px",
    borderRadius: "14px",
    border: "2px solid",
    display: "flex", flexDirection: "column", alignItems: "center",
    transition: "transform 0.15s, box-shadow 0.15s",
    cursor: "default",
  },
  statusBadge: {
    position: "absolute", top: "-1px", right: "12px",
    padding: "3px 12px", borderRadius: "0 0 8px 8px",
    color: "#fff", fontSize: "12px", fontWeight: 700,
    letterSpacing: "0.5px",
  },
  iconArea: {
    marginTop: "8px", marginBottom: "8px",
  },
  eqName: {
    fontSize: "18px", fontWeight: 700, color: "#1E293B",
  },
  eqFullName: {
    fontSize: "12px", color: "#94A3B8", marginTop: "2px", marginBottom: "12px",
  },
  infoBox: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: "8px",
    padding: "10px 12px",
    display: "flex", flexDirection: "column", gap: "6px",
  },
  infoRow: {
    display: "flex", justifyContent: "space-between", fontSize: "13px",
  },
  infoLabel: {
    color: "#64748B", fontWeight: 500,
  },
  infoValue: {
    color: "#1E293B", fontWeight: 600, textAlign: "right",
  },
  availableBox: {
    width: "100%", textAlign: "center",
    padding: "10px",
    backgroundColor: "rgba(76,175,80,0.08)",
    borderRadius: "8px",
    color: "#2E7D32", fontWeight: 600, fontSize: "14px",
  },
};
