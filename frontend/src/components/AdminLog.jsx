/**
 * AdminLog.jsx — 관리자 전용 예약/사용 이력 관리 페이지
 * 비밀번호 인증 후 접근 가능 / 사용자는 수정·삭제 불가
 */

import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";
const ADMIN_PASSWORD = "admin1234"; // 실제 배포 시 환경변수로 교체
const AUTH_KEY = "labflow_admin_auth";

const STATUS_INFO = {
  pending:   { label: "대기",   color: "#D97706", bg: "#FEF3C7" },
  confirmed: { label: "확정",   color: "#1D4ED8", bg: "#DBEAFE" },
  completed: { label: "완료",   color: "#047857", bg: "#D1FAE5" },
  cancelled: { label: "취소",   color: "#B91C1C", bg: "#FEE2E2" },
};

function fmt(dt) {
  if (!dt) return <span style={{ color: "#94A3B8" }}>—</span>;
  return new Date(dt).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── 비밀번호 게이트 ──────────────────────────────────────────────────────────────
function PasswordGate({ onSuccess }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "true");
      onSuccess();
    } else {
      setError(true);
      setPw("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={gateStyles.overlay}>
      <form onSubmit={handleSubmit} style={gateStyles.card}>
        <div style={gateStyles.icon}>🔐</div>
        <h2 style={gateStyles.title}>관리자 인증</h2>
        <p style={gateStyles.desc}>이 페이지는 관리자만 접근할 수 있습니다.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="관리자 비밀번호"
          style={{ ...gateStyles.input, borderColor: error ? "#EF4444" : "#CBD5E1" }}
          autoFocus
        />
        {error && <p style={gateStyles.error}>비밀번호가 올바르지 않습니다.</p>}
        <button type="submit" style={gateStyles.btn}>확인</button>
      </form>
    </div>
  );
}

// ── 메인 관리자 로그 ─────────────────────────────────────────────────────────────
export default function AdminLog({ onClose }) {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(AUTH_KEY));
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ status: "", equipment: "", search: "" });
  const [sort, setSort] = useState({ field: "created_at", asc: false });

  useEffect(() => {
    if (authed) fetchData();
  }, [authed]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/reservations/?limit=200`);
      setReservations(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    setSort((prev) =>
      prev.field === field ? { field, asc: !prev.asc } : { field, asc: true }
    );
  };

  const sortIcon = (field) =>
    sort.field === field ? (sort.asc ? " ▲" : " ▼") : " ⇅";

  const filtered = reservations
    .filter((r) => {
      if (filter.status && r.status !== filter.status) return false;
      if (filter.equipment && !String(r.equipment_id).includes(filter.equipment)) return false;
      if (filter.search &&
        !String(r.purpose || "").toLowerCase().includes(filter.search.toLowerCase()) &&
        !String(r.user_id).includes(filter.search) &&
        !String(r.id).includes(filter.search)) return false;
      return true;
    })
    .sort((a, b) => {
      const v = (x) => x[sort.field] ?? "";
      return sort.asc ? (v(a) > v(b) ? 1 : -1) : (v(a) < v(b) ? 1 : -1);
    });

  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* 헤더 */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>📔</span>
            <div>
              <h2 style={styles.headerTitle}>연구 일지 — 관리자 전용</h2>
              <p style={styles.headerSub}>전체 예약 및 장비 사용 이력 (읽기 전용)</p>
            </div>
          </div>
          <div style={styles.headerRight}>
            <button onClick={fetchData} style={styles.refreshBtn}>🔄 새로고침</button>
            <button onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }} style={styles.logoutBtn}>
              🔒 잠금
            </button>
            <button onClick={onClose} style={styles.closeBtn}>✕</button>
          </div>
        </div>

        {/* 통계 카드 */}
        <div style={styles.statsRow}>
          {[
            { label: "전체 예약", value: reservations.length, color: "#1D4ED8", bg: "#DBEAFE" },
            { label: "사용 완료", value: reservations.filter(r => r.status === "completed").length, color: "#047857", bg: "#D1FAE5" },
            { label: "체크인 중", value: reservations.filter(r => r.checkin_time && !r.checkout_time).length, color: "#D97706", bg: "#FEF3C7" },
            { label: "조기 완료", value: reservations.filter(r => r.early_checkout).length, color: "#7C3AED", bg: "#EDE9FE" },
          ].map((s) => (
            <div key={s.label} style={{ ...styles.statCard, backgroundColor: s.bg }}>
              <div style={{ ...styles.statValue, color: s.color }}>{s.value}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div style={styles.filterRow}>
          <input
            placeholder="🔍 ID / 사용자 / 목적 검색"
            value={filter.search}
            onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
            style={styles.filterInput}
          />
          <select
            value={filter.status}
            onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))}
            style={styles.filterSelect}
          >
            <option value="">전체 상태</option>
            <option value="pending">대기</option>
            <option value="confirmed">확정</option>
            <option value="completed">완료</option>
            <option value="cancelled">취소</option>
          </select>
          <input
            placeholder="장비 ID"
            value={filter.equipment}
            onChange={(e) => setFilter(f => ({ ...f, equipment: e.target.value }))}
            style={{ ...styles.filterInput, maxWidth: "100px" }}
          />
          <span style={styles.resultCount}>총 {filtered.length}건</span>
        </div>

        {/* 테이블 */}
        <div style={styles.tableWrap}>
          {loading ? (
            <p style={styles.loadingText}>데이터 로딩 중...</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {[
                    ["id",         "예약 ID"],
                    ["equipment_id","장비"],
                    ["user_id",    "사용자"],
                    ["purpose",    "사용 목적"],
                    ["status",     "상태"],
                    ["start_time", "예약 시작"],
                    ["end_time",   "예약 종료"],
                    ["checkin_time","체크인"],
                    ["checkout_time","체크아웃"],
                    ["early_checkout","조기완료"],
                    ["created_at", "등록일시"],
                  ].map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      style={styles.th}
                    >
                      {label}{sortIcon(field)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={styles.emptyCell}>데이터가 없습니다.</td></tr>
                ) : filtered.map((r, i) => {
                  const st = STATUS_INFO[r.status] || STATUS_INFO.pending;
                  return (
                    <tr key={r.id} style={{ ...styles.tr, backgroundColor: i % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                      <td style={{ ...styles.td, fontWeight: 700, color: "#1E3A8A" }}>#{r.id}</td>
                      <td style={styles.td}>🔬 #{r.equipment_id}</td>
                      <td style={styles.td}>👤 #{r.user_id}</td>
                      <td style={{ ...styles.td, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.purpose || <span style={{ color: "#94A3B8" }}>—</span>}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, backgroundColor: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={styles.td}>{fmt(r.start_time)}</td>
                      <td style={styles.td}>{fmt(r.end_time)}</td>
                      <td style={{ ...styles.td, color: r.checkin_time ? "#047857" : "#94A3B8" }}>
                        {fmt(r.checkin_time)}
                      </td>
                      <td style={{ ...styles.td, color: r.checkout_time ? "#1D4ED8" : "#94A3B8" }}>
                        {fmt(r.checkout_time)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        {r.early_checkout
                          ? <span style={{ color: "#7C3AED", fontWeight: 700 }}>⚡ 예</span>
                          : <span style={{ color: "#94A3B8" }}>—</span>}
                      </td>
                      <td style={{ ...styles.td, color: "#64748B" }}>{fmt(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 하단 안내 */}
        <div style={styles.footer}>
          🔒 관리자 전용 페이지 · 사용자는 이 데이터를 수정하거나 삭제할 수 없습니다.
        </div>
      </div>
    </div>
  );
}

// ── 스타일 ───────────────────────────────────────────────────────────────────────
const gateStyles = {
  overlay: {
    position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  card: {
    backgroundColor: "#fff", borderRadius: "16px", padding: "40px 36px",
    width: "340px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    display: "flex", flexDirection: "column", gap: "14px",
  },
  icon: { fontSize: "48px" },
  title: { fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: 0 },
  desc: { fontSize: "13px", color: "#64748B", margin: 0 },
  input: {
    padding: "12px 16px", border: "2px solid #CBD5E1", borderRadius: "10px",
    fontSize: "15px", outline: "none", fontFamily: "inherit", textAlign: "center",
  },
  error: { fontSize: "12px", color: "#EF4444", margin: 0 },
  btn: {
    padding: "12px", backgroundColor: "#1E3A8A", color: "#fff",
    border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "15px",
    cursor: "pointer",
  },
};

const styles = {
  overlay: {
    position: "fixed", inset: 0, backgroundColor: "rgba(15,23,42,0.6)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    zIndex: 1000, overflowY: "auto", padding: "20px 16px",
  },
  panel: {
    backgroundColor: "#F8FAFC", borderRadius: "16px", width: "100%", maxWidth: "1200px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden",
    display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 28px", backgroundColor: "#1E3A8A", flexWrap: "wrap", gap: "12px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "14px" },
  headerIcon: { fontSize: "36px" },
  headerTitle: { margin: 0, fontSize: "18px", fontWeight: 700, color: "#fff" },
  headerSub: { margin: "2px 0 0", fontSize: "12px", color: "rgba(255,255,255,0.7)" },
  headerRight: { display: "flex", gap: "8px", alignItems: "center" },
  refreshBtn: {
    padding: "7px 14px", backgroundColor: "rgba(255,255,255,0.15)",
    color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px",
  },
  logoutBtn: {
    padding: "7px 14px", backgroundColor: "rgba(239,68,68,0.2)",
    color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px",
  },
  closeBtn: {
    padding: "7px 12px", backgroundColor: "rgba(255,255,255,0.1)",
    color: "#fff", border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "16px",
  },
  statsRow: {
    display: "flex", gap: "12px", padding: "16px 24px",
    backgroundColor: "#fff", borderBottom: "1px solid #E2E8F0", flexWrap: "wrap",
  },
  statCard: {
    flex: "1 1 120px", padding: "14px 18px", borderRadius: "10px",
    textAlign: "center", minWidth: "100px",
  },
  statValue: { fontSize: "28px", fontWeight: 800, lineHeight: 1 },
  statLabel: { fontSize: "12px", color: "#64748B", marginTop: "4px", fontWeight: 600 },
  filterRow: {
    display: "flex", gap: "10px", padding: "14px 24px",
    backgroundColor: "#fff", borderBottom: "1px solid #E2E8F0",
    alignItems: "center", flexWrap: "wrap",
  },
  filterInput: {
    flex: 1, minWidth: "160px", padding: "9px 14px",
    border: "1.5px solid #CBD5E1", borderRadius: "8px",
    fontSize: "14px", outline: "none", fontFamily: "inherit",
  },
  filterSelect: {
    padding: "9px 14px", border: "1.5px solid #CBD5E1", borderRadius: "8px",
    fontSize: "14px", outline: "none", backgroundColor: "#fff", fontFamily: "inherit",
  },
  resultCount: { fontSize: "13px", color: "#64748B", fontWeight: 600, whiteSpace: "nowrap" },
  tableWrap: { overflowX: "auto", flex: 1 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  thead: { backgroundColor: "#1E3A8A" },
  th: {
    padding: "11px 14px", textAlign: "left", fontWeight: 700,
    color: "#fff", whiteSpace: "nowrap", cursor: "pointer",
    fontSize: "12px", letterSpacing: "0.3px",
    borderRight: "1px solid rgba(255,255,255,0.1)",
  },
  tr: { borderBottom: "1px solid #E2E8F0", transition: "background 0.1s" },
  td: { padding: "10px 14px", color: "#334155", verticalAlign: "middle" },
  badge: {
    padding: "3px 10px", borderRadius: "99px",
    fontSize: "11px", fontWeight: 700,
  },
  emptyCell: { padding: "40px", textAlign: "center", color: "#94A3B8" },
  loadingText: { textAlign: "center", padding: "40px", color: "#64748B" },
  footer: {
    padding: "12px 24px", backgroundColor: "#1E3A8A",
    color: "rgba(255,255,255,0.6)", fontSize: "12px", textAlign: "center",
  },
};
