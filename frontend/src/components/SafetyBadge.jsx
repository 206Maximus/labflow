/**
 * SafetyBadge.jsx
 *
 * 두 가지 역할:
 * 1. SafetyBadge (기본 export) — 사용자 인증 배지 표시 + 상태 모달
 * 2. AdminSafetyCertPanel (named export) — 관리자 인증 부여/취소 + 리마인드 대상자 목록
 */

import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8000/api/v1";

// ─── 배지 아이콘 ──────────────────────────────────────────────────────────────

function BadgeIcon({ certified, size = 16 }) {
  return (
    <span
      title={certified ? "안전 교육 인증 완료" : "안전 교육 미인증"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 8,
        height: size + 8,
        borderRadius: "50%",
        background: certified ? "#dcfce7" : "#fef9c3",
        border: `2px solid ${certified ? "#86efac" : "#fde047"}`,
        fontSize: size,
        cursor: "help",
      }}
    >
      {certified ? "🛡️" : "⚠️"}
    </span>
  );
}

// ─── SafetyBadge (사용자용) ───────────────────────────────────────────────────

export default function SafetyBadge({ userId = 1 }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/safety/status/${userId}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus(); // 마운트 시 초기 로드 (배지 색상용)
  }, [fetchStatus]);

  useEffect(() => {
    if (open) fetchStatus();
  }, [open, fetchStatus]);

  const certified = data?.safety_certified;
  const daysLeft = data?.days_since_certification != null
    ? 90 - data.days_since_certification
    : null;

  return (
    <>
      {/* ── 배지 버튼 */}
      <button
        onClick={() => setOpen(true)}
        title="안전 교육 인증 현황"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 20,
          border: `1.5px solid ${certified ? "#86efac" : "#fde047"}`,
          background: certified ? "#f0fdf4" : "#fefce8",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: certified ? "#15803d" : "#854d0e",
        }}
      >
        <BadgeIcon certified={certified} size={13} />
        {certified ? "안전 인증" : "미인증"}
        {certified && data?.needs_reminder && (
          <span style={{ color: "#ca8a04", marginLeft: 2 }}>⏰</span>
        )}
      </button>

      {/* ── 모달 */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              width: 380,
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>안전 교육 인증 현황</h3>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}
              >✕</button>
            </div>

            {loading ? (
              <p style={{ color: "#6b7280" }}>불러오는 중...</p>
            ) : data ? (
              <>
                {/* 인증 상태 카드 */}
                <div
                  style={{
                    borderRadius: 12,
                    padding: "16px 20px",
                    background: certified ? "#f0fdf4" : "#fefce8",
                    border: `1px solid ${certified ? "#bbf7d0" : "#fde68a"}`,
                    marginBottom: 16,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 6 }}>
                    {certified ? "🛡️" : "⚠️"}
                  </div>
                  <p style={{
                    margin: 0,
                    fontWeight: 700,
                    fontSize: 15,
                    color: certified ? "#15803d" : "#92400e",
                  }}>
                    {certified ? "안전 교육 인증 완료" : "안전 교육 미인증"}
                  </p>
                  {!certified && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#78350f" }}>
                      장비 예약을 위해 관리자에게 안전 교육 인증을 요청해 주세요.
                    </p>
                  )}
                </div>

                {/* 인증 세부 정보 */}
                {certified && (
                  <div style={{ fontSize: 13, color: "#374151", lineHeight: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#6b7280" }}>인증 일시</span>
                      <span>{new Date(data.safety_certified_at).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#6b7280" }}>인증 후 경과</span>
                      <span>{data.days_since_certification}일</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#6b7280" }}>다음 갱신까지</span>
                      <span style={{ color: daysLeft != null && daysLeft <= 14 ? "#dc2626" : "#374151", fontWeight: daysLeft != null && daysLeft <= 14 ? 700 : 400 }}>
                        {daysLeft != null ? (daysLeft <= 0 ? "갱신 필요!" : `${daysLeft}일`) : "-"}
                      </span>
                    </div>
                  </div>
                )}

                {/* 리마인드 경고 */}
                {data.needs_reminder && (
                  <div style={{
                    marginTop: 14,
                    background: "#fffbeb",
                    border: "1px solid #fcd34d",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12,
                    color: "#92400e",
                  }}>
                    ⏰ <strong>3개월 갱신 리마인드</strong><br />
                    안전 교육 인증 후 3개월이 경과했습니다. 관리자에게 갱신을 요청해 주세요.
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: "#dc2626" }}>데이터를 불러올 수 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}


// ─── AdminSafetyCertPanel (관리자용) ─────────────────────────────────────────

export function AdminSafetyCertPanel({ adminUserId = 1 }) {
  const [users, setUsers] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("all");       // "all" | "reminder"
  const [actionUserId, setActionUserId] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, remindRes] = await Promise.all([
        fetch(`${API_BASE}/safety/status`),
        fetch(`${API_BASE}/safety/reminder-needed`),
      ]);
      if (allRes.ok) setUsers(await allRes.json());
      if (remindRes.ok) setReminders(await remindRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCertify = async (userId) => {
    setActionUserId(userId);
    await fetch(`${API_BASE}/safety/certify/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_user_id: adminUserId }),
    });
    await fetchAll();
    setActionUserId(null);
  };

  const handleRevoke = async (userId) => {
    if (!window.confirm("인증을 취소하시겠습니까?")) return;
    setActionUserId(userId);
    await fetch(`${API_BASE}/safety/certify/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_user_id: adminUserId }),
    });
    await fetchAll();
    setActionUserId(null);
  };

  const displayList = tab === "reminder" ? reminders : users;

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          🛡️ 안전 교육 인증 관리
        </h3>
        <button
          onClick={fetchAll}
          style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer", background: "#f9fafb" }}
        >
          🔄 새로고침
        </button>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["all", `전체 (${users.length})`], ["reminder", `리마인드 필요 (${reminders.length})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              border: "1.5px solid",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              borderColor: tab === key ? "#3b82f6" : "#e5e7eb",
              background: tab === key ? "#eff6ff" : "#fff",
              color: tab === key ? "#1d4ed8" : "#6b7280",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#6b7280", fontSize: 13 }}>불러오는 중...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayList.length === 0 && (
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              {tab === "reminder" ? "✅ 리마인드 대상자 없음" : "사용자 없음"}
            </p>
          )}
          {displayList.map((u) => (
            <div
              key={u.user_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: u.safety_certified ? "#f0fdf4" : "#fefce8",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{u.safety_certified ? "🛡️" : "⚠️"}</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{u.user_name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
                    {u.email}
                    {u.safety_certified && u.days_since_certification != null && (
                      <> · 인증 후 {u.days_since_certification}일 경과</>
                    )}
                    {u.needs_reminder && (
                      <span style={{ color: "#ca8a04", marginLeft: 4 }}>⏰ 갱신 필요</span>
                    )}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                {!u.safety_certified ? (
                  <button
                    onClick={() => handleCertify(u.user_id)}
                    disabled={actionUserId === u.user_id}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "#22c55e",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      opacity: actionUserId === u.user_id ? 0.6 : 1,
                    }}
                  >
                    배지 부여
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleCertify(u.user_id)}
                      disabled={actionUserId === u.user_id}
                      title="인증 갱신"
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #86efac",
                        background: "#dcfce7",
                        color: "#15803d",
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: actionUserId === u.user_id ? 0.6 : 1,
                      }}
                    >
                      갱신
                    </button>
                    <button
                      onClick={() => handleRevoke(u.user_id)}
                      disabled={actionUserId === u.user_id}
                      title="인증 취소"
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #fca5a5",
                        background: "#fef2f2",
                        color: "#dc2626",
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: actionUserId === u.user_id ? 0.6 : 1,
                      }}
                    >
                      취소
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
