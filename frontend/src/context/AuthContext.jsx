/**
 * AuthContext.jsx — 전역 로그인 상태 관리
 *
 * - sessionStorage 사용 → 탭 닫으면 자동 로그아웃
 * - useAuth() 훅으로 어디서든 로그인 정보 접근
 */

import { createContext, useContext, useState, useCallback } from "react";

const AuthContext = createContext(null);

const SESSION_KEY = "labflow_auth";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadSession);

  const login = useCallback((tokenData) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(tokenData));
    setAuth(tokenData);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuth(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
