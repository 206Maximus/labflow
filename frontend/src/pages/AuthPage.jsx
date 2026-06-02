import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

export default function AuthPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("google_login_ticket");
    const googleError = params.get("gcal_error");

    if (googleError) {
      setError(`Google login failed: ${googleError}`);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (!ticket) return;

    window.history.replaceState({}, "", window.location.pathname);

    const finishGoogleLogin = async () => {
      setGoogleLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE}/auth/google/ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Google login ticket exchange failed.");
        }

        login(data);
      } catch (err) {
        setError(err.message || "Google login failed.");
      } finally {
        setGoogleLoading(false);
      }
    };

    finishGoogleLogin();
  }, [login]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (tab === "register") {
      if (!form.name.trim()) return setError("Name is required.");
      if (form.password !== form.confirm) return setError("Passwords do not match.");
      if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    }

    setLoading(true);
    try {
      const endpoint = tab === "login" ? "/auth/login" : "/auth/register";
      const body = tab === "login"
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Authentication failed.");
        return;
      }

      login(data);
    } catch {
      setError("Cannot connect to the server. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/google/auth-url`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Could not start Google login.");
        return;
      }

      window.location.href = data.auth_url;
    } catch {
      setError("Could not start Google login. Check backend Google settings.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.bg} />

      <div style={s.card} className="auth-card-mobile">
        <div style={s.logoRow}>
          <span style={s.logoIcon}>LF</span>
          <div>
            <div style={s.logoTitle}>LabFlow</div>
            <div style={s.logoSub}>Research equipment management</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          style={s.googleBtn}
        >
          <GoogleIcon />
          {googleLoading ? "Connecting..." : "Continue with Google"}
        </button>

        <div style={s.divider}>
          <span style={s.dividerLine} />
          <span style={s.dividerText}>or</span>
          <span style={s.dividerLine} />
        </div>

        <div style={s.tabs}>
          {[["login", "Login"], ["register", "Register"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError(""); }}
              style={{ ...s.tabBtn, ...(tab === key ? s.tabActive : {}) }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={s.form}>
          {tab === "register" && (
            <Field
              label="Name"
              name="name"
              type="text"
              placeholder="Lab member"
              value={form.name}
              onChange={handleChange}
              required
            />
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            placeholder="labuser@university.ac.kr"
            value={form.email}
            onChange={handleChange}
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            placeholder="6 characters or more"
            value={form.password}
            onChange={handleChange}
            required
          />
          {tab === "register" && (
            <Field
              label="Confirm password"
              name="confirm"
              type="password"
              placeholder="Repeat password"
              value={form.confirm}
              onChange={handleChange}
              required
            />
          )}

          {error && <div style={s.errorBox}>{error}</div>}

          <button type="submit" disabled={loading} style={s.submitBtn}>
            {loading ? "Processing..." : tab === "login" ? "Login" : "Create account"}
          </button>
        </form>

        <p style={s.switchText}>
          {tab === "login" ? "Need an account? " : "Already have an account? "}
          <button
            type="button"
            style={s.linkBtn}
            onClick={() => setTab(tab === "login" ? "register" : "login")}
          >
            {tab === "login" ? "Register" : "Login"}
          </button>
        </p>
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
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
    borderRadius: 16,
    padding: "36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
    position: "relative",
    zIndex: 1,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
    justifyContent: "center",
  },
  logoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#1E3A8A",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
  },
  logoTitle: { fontSize: 24, fontWeight: 800, color: "#1E3A8A" },
  logoSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  googleBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "11px 14px",
    borderRadius: 10,
    border: "1.5px solid #E2E8F0",
    background: "#fff",
    color: "#1F2937",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "18px 0",
  },
  dividerLine: { flex: 1, height: 1, background: "#E2E8F0" },
  dividerText: { fontSize: 12, color: "#94A3B8", fontWeight: 700 },
  tabs: {
    display: "flex",
    background: "#F1F5F9",
    borderRadius: 10,
    padding: 4,
    marginBottom: 22,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    padding: "8px 0",
    border: "none",
    borderRadius: 7,
    background: "transparent",
    fontSize: 14,
    fontWeight: 600,
    color: "#94A3B8",
    cursor: "pointer",
    fontFamily: "inherit",
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
    fontFamily: "inherit",
  },
  errorBox: {
    background: "#FEF2F2",
    border: "1px solid #FCA5A5",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#DC2626",
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
    fontFamily: "inherit",
  },
  switchText: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 13,
    color: "#6B7280",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#2563EB",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
    padding: 0,
  },
};
