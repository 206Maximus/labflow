/**
 * LogDashboard.jsx — 장비 사용 로그 대시보드 컴포넌트
 * 장비별 사용 통계와 최근 로그를 테이블로 표시합니다.
 */

import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const ACTION_LABELS = {
  start: { label: "시작", color: "#43C59E" },
  end: { label: "종료", color: "#4F8EF7" },
  error: { label: "오류", color: "#F76C6C" },
};

export default function LogDashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterEquipment, setFilterEquipment] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchLogs();
  }, [filterEquipment, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      };
      if (filterEquipment) params.equipment_id = filterEquipment;

      const res = await axios.get(`${API_BASE}/logs/`, { params });
      setLogs(res.data);
    } catch (err) {
      console.error("로그 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📊 장비 사용 로그</h2>
        <div style={styles.controls}>
          <input
            type="number"
            placeholder="장비 ID 필터"
            value={filterEquipment}
            onChange={(e) => {
              setFilterEquipment(e.target.value);
              setPage(0);
            }}
            style={styles.filterInput}
          />
          <button onClick={fetchLogs} style={styles.refreshBtn}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      {/* 요약 카드 영역 (추후 실제 데이터로 교체) */}
      <div style={styles.summaryRow}>
        {[
          { label: "오늘 총 사용", value: "-", icon: "🔬" },
          { label: "현재 사용 중", value: "-", icon: "⚡" },
          { label: "이번 달 예약", value: "-", icon: "📅" },
          { label: "오류 발생", value: "-", icon: "⚠️" },
        ].map((card) => (
          <div key={card.label} style={styles.card}>
            <div style={styles.cardIcon}>{card.icon}</div>
            <div style={styles.cardValue}>{card.value}</div>
            <div style={styles.cardLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 로그 테이블 */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.theadRow}>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>장비 ID</th>
              <th style={styles.th}>사용자 ID</th>
              <th style={styles.th}>액션</th>
              <th style={styles.th}>메모</th>
              <th style={styles.th}>기록 시각</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} style={styles.emptyCell}>
                  로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const action = ACTION_LABELS[log.action] || {
                  label: log.action,
                  color: "#888",
                };
                return (
                  <tr key={log.id} style={styles.tr}>
                    <td style={styles.td}>{log.id}</td>
                    <td style={styles.td}>{log.equipment_id}</td>
                    <td style={styles.td}>{log.user_id}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: action.color + "22",
                          color: action.color,
                        }}
                      >
                        {action.label}
                      </span>
                    </td>
                    <td style={styles.td}>{log.note || "-"}</td>
                    <td style={styles.td}>{formatDate(log.logged_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div style={styles.pagination}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          style={styles.pageBtn}
        >
          ← 이전
        </button>
        <span style={{ padding: "0 12px", lineHeight: "36px" }}>
          {page + 1} 페이지
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={logs.length < PAGE_SIZE}
          style={styles.pageBtn}
        >
          다음 →
        </button>
      </div>
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
    marginBottom: "20px",
  },
  title: { margin: 0, fontSize: "20px" },
  controls: { display: "flex", gap: "8px" },
  filterInput: {
    padding: "8px 12px",
    border: "1px solid #dde1e7",
    borderRadius: "8px",
    width: "120px",
    fontSize: "14px",
  },
  refreshBtn: {
    padding: "8px 16px",
    backgroundColor: "#4F8EF7",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
  },
  summaryRow: {
    display: "flex",
    gap: "16px",
    marginBottom: "24px",
    flexWrap: "wrap",
  },
  card: {
    flex: "1 1 160px",
    padding: "20px",
    backgroundColor: "#fff",
    border: "1px solid #dde1e7",
    borderRadius: "12px",
    textAlign: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  cardIcon: { fontSize: "28px", marginBottom: "8px" },
  cardValue: { fontSize: "28px", fontWeight: 700, color: "#1a1a1a" },
  cardLabel: { fontSize: "13px", color: "#666", marginTop: "4px" },
  tableWrapper: { overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
    backgroundColor: "#fff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  theadRow: { backgroundColor: "#F7F8FA" },
  th: {
    padding: "12px 16px",
    textAlign: "left",
    fontWeight: 600,
    color: "#555",
    borderBottom: "1px solid #eee",
  },
  tr: { borderBottom: "1px solid #f0f0f0" },
  td: { padding: "12px 16px", color: "#333" },
  emptyCell: {
    padding: "32px",
    textAlign: "center",
    color: "#999",
  },
  badge: {
    padding: "3px 10px",
    borderRadius: "99px",
    fontWeight: 600,
    fontSize: "12px",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "20px",
    gap: "4px",
  },
  pageBtn: {
    padding: "8px 16px",
    border: "1px solid #dde1e7",
    borderRadius: "8px",
    cursor: "pointer",
    backgroundColor: "#fff",
    fontWeight: 600,
    fontSize: "14px",
  },
};
