/**
 * AuthPage.jsx — 로그인 / 회원가입 통합 페이지
 *
 * 탭 전환으로 로그인 ↔ 회원가입 전환
 * 성공 시 AuthContext.login() 호출 → 앱 화면으로 이동
 */

import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_BASE = "http://localhost:8000/api/v1";

export default function AuthPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState("login");       // "login" | "register"
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (tab === "register") {
      if (!form.name.trim()) return setError("이름을 입력해주세요.");
      if (form.password !== form.confirm) return setError("비밀번호가 일치하지 않습니다.");
      if (form.password.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    }

    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/auth/login" : "/auth/register";
      const body = tab === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "오류가 발생했습니다.");
        return;
      }

      login(data);
    } catch (err) {
      setError("서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.wrap}>
      {/* 배경 장식 */}
      <div style={s.bg} />

      <div style={s.card} className="auth-card-mobile">
        {/* 로고 */}
        <div style={s.logoRow}>
          <span style={s.logoIcon}>🔬</span>
          <div>
            <div style={s.logoTitle}>LabFlow</div>
            <div style={s.logoSub}>연구실 장비 관리 플랫폼</div>
          </div>
        </div>

        {/* 탭 */}
        <div style={s.tabs}>
          {[["login", "로그인"], ["register", "회원가입"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError(""); }}
              style={{ ...s.tabBtn, ...(tab === key ? s.tabActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} style={s.form}>
          {tab === "register" && (
            <Field
              label="이름"
              name="name"
              type="text"
              placeholder="홍길동"
              value={form.name}
              onChange={handleChange}
              required
            />
          )}
          <Field
            label="이메일"
            name="email"
            type="email"
            placeholder="labuser@university.ac.kr"
            value={form.email}
            onChange={handleChange}
            required
          />
          <Field
            label="비밀번호"
            name="password"
            type="password"
            placeholder="6자 이상"
            value={form.password}
            onChange={handleChange}
            required
          />
          {tab === "register" && (
            <Field
              label="비밀번호 확인"
              name="confirm"
              type="password"
              placeholder="비밀번호 재입력"
              value={form.confirm}
              onChange={handleChange}
              required
            />
          )}

          {error && (
            <div style={s.errorBox}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={s.submitBtn}>
            {loading
              ? "처리 중..."
              : tab === "login" ? "로그인" : "가입하기"}
          </button>
        </form>

        {/* 하단 안내 */}
        <p style={s.switchText}>
          {tab === "login" ? (
            <>계정이 없으신가요?{" "}
              <button style={s.linkBtn} onClick={() => setTab("register")}>회원가입</button>
            </>
          ) : (
            <>이미 계정이 있으신가요?{" "}
              <button style={s.linkBtn} onClick={() => setTab("login")}>로그인</button>
            </>
          )}
        </p>

        {tab === "register" && (
          <p style={s.notice}>
            🛡️ 장비 예약을 위해서는 가입 후 관리자에게 <strong>안전 교육 인증</strong>을 받아야 합니다.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder, value, onChange, required }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.label}>{label}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        style={s.input}
        autoComplete={type === "password" ? "current-password" : undefined}
      />
    </div>
  );
}

const s = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1E3A8A 0%, #1e40af 40%, #1d4ed8 100%)",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  bg: {
    position: "absolute",
    inset: 0,
    backgroundImage: `radial-gradient(circle at 20% 20%, rgba(96,165,250,0.15) 0%, transparent 50%),
                      radial-gradient(circle at 80% 80%, rgba(167,139,250,0.1) 0%, transparent 50%)`,
    pointerEvents: "none",
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
    position: "relative",
    zIndex: 1,
  },
  logoRow: {
    display: "flex", alignItems: "center", gap: 12,
    marginBottom: 28,
    justifyContent: "center",
  },
  logoIcon: { fontSize: 36 },
  logoTitle: { fontSize: 24, fontWeight: 800, color: "#1E3A8A", letterSpacing: "-0.5px" },
  logoSub: { fontSize: 12, color: "#64748B", marginTop: 2 },

  tabs: {
    display: "flex",
    background: "#F1F5F9",
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tabBtn: {
    flex: 1, padding: "8px 0",
    border: "none", borderRadius: 7,
    background: "transparent",
    fontSize: 14, fontWeight: 600,
    color: "#94A3B8", cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "#fff",
    color: "#1E3A8A",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  },

  form: { display: "flex", flexDirection: "column", gap: 14 },
  fieldWrap: { display: "flex", flexDirection: "column", gap: 5 },
  label: { fontSize: 13, fontWeight: 600, color: "#374151" },
  input: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1.5px solid #E2E8F0",
    fontSize: 14,
    color: "#111827",
    outline: "none",
    transition: "border-color 0.15s",
    fontFamily: "inherit",
  },

  errorBox: {
    background: "#FEF2F2",
    border: "1px solid #FCA5A5",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#DC2626",
    display: "flex",
    gap: 6,
    alignItems: "flex-start",
  },

  submitBtn: {
    marginTop: 4,
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.15s",
    fontFamily: "inherit",
  },

  switchText: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 13,
    color: "#6B7280",
  },
  linkBtn: {
    background: "none", border: "none",
    color: "#2563EB", fontWeight: 600,
    cursor: "pointer", fontSize: 13,
    padding: 0,
  },
  notice: {
    marginTop: 14,
    background: "#EFF6FF",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12,
    color: "#1D4ED8",
    lineHeight: 1.6,
    textAlign: "center",
  },
};
