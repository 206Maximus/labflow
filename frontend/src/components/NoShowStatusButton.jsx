/**
 * NoShowStatusButton.jsx
 *
 * 우측 하단 작은 버튼으로 노쇼 현황을 열어 보는 컴포넌트
 * - 노쇼 스택 시각화 (0~3 단계)
 * - 활성 사용 금지 목록
 * - 최근 노쇼 기록
 */

import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8000/api/v1";

// 스택 3개를 시각적으로 표시하는 서브 컴포넌트
function NoShowStack({ current, total }) {
  const stackInCycle = total === 0 ? 0 : (total % 3 === 0 ? 3 : total % 3);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          title={`노쇼 스택 ${i}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: i <= stackInCycle
              ? (stackInCycle === 3 ? "#ef4444" : "#f97316")
              : "#e5e7eb",
            border: "2px solid",
            borderColor: i <= stackInCycle
              ? (stackInCycle === 3 ? "#b91c1c" : "#c2410c")
              : "#d1d5db",
            transition: "background 0.3s",
          }}
        />
      ))}
      <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 4 }}>
        {stackInCycle} / 3
      </span>
    </div>
  );
}

export default function NoShowStatusButton({ userId = 1 }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/noshows/status/${userId}`);
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // 모달 열릴 때마다 최신 데이터 갱신
  useEffect(() => {
    if (open) fetchStatus();
  }, [open, fetchStatus]);

  const stackInCycle = data
    ? data.total_noshow_count === 0
      ? 0
      : data.total_noshow_count % 3 === 0
      ? 3
      : data.total_noshow_count % 3
    : 0;

  const hasActiveBan = data && data.active_bans.length > 0;

  return (
    <>
      {/* ── 트리거 버튼 ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        title="노쇼 현황 확인"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 20,
          border: "1.5px solid",
          cursor: "pointer",
          background: hasActiveBan ? "#fef2f2" : stackInCycle > 0 ? "#fff7ed" : "#f9fafb",
          borderColor: hasActiveBan ? "#fca5a5" : stackInCycle > 0 ? "#fdba74" : "#d1d5db",
          color: hasActiveBan ? "#dc2626" : stackInCycle > 0 ? "#ea580c" : "#6b7280",
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 14 }}>
          {hasActiveBan ? "🚫" : stackInCycle > 0 ? "⚠️" : "✅"}
        </span>
        노쇼{" "}
        {data ? `${data.total_noshow_count}회` : "현황"}
      </button>

      {/* ── 모달 오버레이 ────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
              width: 420,
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            {/* 헤더 */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
                📋 노쇼 현황
              </h3>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af" }}
              >
                ✕
              </button>
            </div>

            {loading && (
              <p style={{ textAlign: "center", color: "#6b7280" }}>불러오는 중...</p>
            )}
            {error && (
              <p style={{ color: "#dc2626", fontSize: 13 }}>❌ {error}</p>
            )}

            {data && !loading && (
              <>
                {/* 사용자 정보 */}
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#374151" }}>
                  <strong>{data.user_name}</strong> 님의 누적 노쇼:{" "}
                  <strong style={{ color: data.total_noshow_count > 0 ? "#dc2626" : "#16a34a" }}>
                    {data.total_noshow_count}회
                  </strong>
                </p>

                {/* 스택 시각화 */}
                <div
                  style={{
                    background: "#f9fafb",
                    borderRadius: 10,
                    padding: "12px 16px",
                    marginBottom: 16,
                  }}
                >
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                    현재 스택 (3회 누적 시 장비 3일 사용 금지)
                  </p>
                  <NoShowStack current={stackInCycle} total={data.total_noshow_count} />
                  {stackInCycle === 3 && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
                      ⛔ 스택 3개 도달 — 해당 장비 3일 사용 금지 발동
                    </p>
                  )}
                </div>

                {/* 활성 사용 금지 */}
                {data.active_bans.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
                      🚫 현재 사용 금지 중인 장비
                    </p>
                    {data.active_bans.map((ban) => (
                      <div
                        key={ban.id}
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fca5a5",
                          borderRadius: 8,
                          padding: "8px 12px",
                          marginBottom: 6,
                          fontSize: 12,
                        }}
                      >
                        <strong>장비 #{ban.equipment_id}</strong> —{" "}
                        {new Date(ban.banned_until).toLocaleString("ko-KR")} 까지
                        <br />
                        <span style={{ color: "#6b7280" }}>{ban.reason}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 최근 노쇼 기록 */}
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#374151" }}>
                    📅 최근 노쇼 기록
                  </p>
                  {data.recent_noshows.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#16a34a" }}>✅ 노쇼 기록 없음</p>
                  ) : (
                    data.recent_noshows.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "6px 0",
                          borderBottom: "1px solid #f3f4f6",
                          fontSize: 12,
                          color: "#374151",
                        }}
                      >
                        <span>장비 #{r.equipment_id} · 예약 #{r.reservation_id}</span>
                        <span style={{ color: "#9ca3af" }}>
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* 새로고침 */}
                <button
                  onClick={fetchStatus}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "#374151",
                  }}
                >
                  🔄 새로고침
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
