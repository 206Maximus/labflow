import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";

const EQUIPMENT_OPTIONS = [
  { id: "SEM", label: "SEM (주사전자현미경)" },
  { id: "XRD", label: "XRD (X선 회절분석기)" },
  { id: "TEM", label: "TEM (투과전자현미경)" },
  { id: "AFM", label: "AFM (원자간력현미경)" },
  { id: "FURNACE", label: "고온 전기로" },
];

const DEMO_MANUALS = {
  SEM: `SEM (주사전자현미경) 운영 매뉴얼

1. 개요
SEM은 전자빔을 이용해 시료 표면을 고배율로 관찰하는 장비입니다.
가속전압 범위: 0.1 ~ 30 kV | 배율: 10x ~ 300,000x

2. 안전 주의사항
고전압(최대 30kV) 사용 장비로 반드시 안전 교육 이수 후 사용하십시오.
장비 가동 중 챔버 내부에 손을 넣지 마십시오.

3. 시료 준비 조건
- 시료는 반드시 전도성이 있어야 합니다.
- 비전도성 시료는 금(Au) 또는 백금(Pt) 스퍼터 코팅이 필요합니다.
- 코팅 두께: 5~10 nm 권장
- 최대 시료 크기: 30mm x 30mm, 두께 10mm 이하
- 시료는 완전히 건조되어야 합니다.

4. 진공 펌핑 절차
1) 시료 홀더에 시료를 고정합니다.
2) 시료 챔버에 시료 홀더를 삽입합니다.
3) 챔버 문을 완전히 닫습니다.
4) PUMP 버튼을 눌러 진공 펌핑을 시작합니다.
5) 진공도가 5x10^-3 Pa 이하가 될 때까지 대기합니다. (약 10~15분)

5. 이미지 촬영 설정
- 가속전압: 시료 종류에 따라 1~15 kV 선택 (민감한 시료는 저전압 권장)
- 작동 거리(WD): 5~10 mm 권장
- 배율 설정: 저배율(100x)에서 시작하여 고배율로 단계적 증가
- 포커스 조정: Coarse → Fine 순서로 조정

6. 측정 종료 절차
1) 전자빔을 끕니다 (Beam Off).
2) 가속전압을 0으로 낮춥니다.
3) 시료 스테이지를 홈 위치로 이동합니다.
4) VENT 버튼으로 챔버 내 공기를 주입합니다.
5) 챔버 문을 열고 시료를 꺼냅니다.`,

  XRD: `XRD (X선 회절분석기) 운영 매뉴얼

1. 개요
XRD는 X선을 이용해 결정 구조를 분석하는 장비입니다.
측정 각도 범위: 5° ~ 90° (2-theta) | X선 출력: Cu K-alpha (1.5406 A)

2. 안전 주의사항
X선 피폭 위험이 있으므로 도어 인터록이 해제된 상태에서 절대 측정하지 마십시오.
장비 가동 중 X선 차폐 도어를 열지 마십시오.

3. 시료 준비
- 분말 시료: 입자 크기 1~10 마이크로미터 권장, 시료 홀더에 평탄하게 채움
- 박막 시료: 기판 크기 최대 50mm x 50mm
- 시료 표면은 평탄하게 유지 (표면 거칠기 최소화)

4. 측정 절차
1) 시료 홀더에 시료를 세팅합니다.
2) 도어를 닫고 인터록 확인합니다.
3) X선 발생기를 켭니다 (40kV, 40mA).
4) 측정 조건 설정: 스캔 범위, 스캔 속도, 스텝 크기.
5) 측정을 시작합니다.

5. 데이터 분석
- JCPDS 데이터베이스와 피크 비교로 물질 동정
- Scherrer 방정식으로 결정립 크기 계산: D = K*lambda / (B*cos(theta))`,

  TEM: `TEM (투과전자현미경) 운영 매뉴얼

1. 개요
TEM은 전자빔을 시료에 투과시켜 원자 수준의 구조를 분석하는 장비입니다.
가속전압: 80 ~ 300 kV | 분해능: 0.2 nm 이하

2. 시료 준비 (가장 중요)
- 시료 두께: 반드시 100nm 이하 (전자빔 투과 가능)
- 시료 그리드: 구리(Cu) 또는 금(Au) 그리드 위에 시료 탑재
- 박막 제작: FIB (집속이온빔) 또는 이온 밀링 사용

3. 측정 절차
1) 시료 홀더에 그리드 장착.
2) 시료 홀더를 삽입 전 펌핑 확인 (10^-5 Pa 이하).
3) 저배율에서 시료 위치 파악.
4) 고배율로 전환하여 이미지 촬영.
5) 회절 패턴(SAED) 측정 시 Selected Area Aperture 사용.`,
};

const styles = {
  container: {
    display: "flex", flexDirection: "column", height: "100vh",
    fontFamily: "'Segoe UI', sans-serif", background: "#f5f5f5",
  },
  header: {
    background: "#1976d2", color: "#fff", padding: "12px 20px",
    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  select: {
    padding: "6px 10px", borderRadius: 6, border: "none",
    fontSize: 14, background: "rgba(255,255,255,0.2)",
    color: "#fff", cursor: "pointer",
  },
  mgmtBtn: {
    marginLeft: "auto", padding: "6px 14px", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.5)", background: "transparent",
    color: "#fff", cursor: "pointer", fontSize: 13,
  },
  mgmtPanel: {
    background: "#e3f2fd", borderBottom: "1px solid #90caf9",
    padding: "12px 20px", display: "flex", gap: 10, flexWrap: "wrap",
    alignItems: "center",
  },
  demoBtn: {
    padding: "8px 16px", borderRadius: 6, border: "none",
    background: "#1976d2", color: "#fff", cursor: "pointer",
    fontSize: 13, fontWeight: 600,
  },
  uploadLabel: {
    padding: "8px 16px", borderRadius: 6, border: "1px solid #1976d2",
    background: "#fff", color: "#1976d2", cursor: "pointer",
    fontSize: 13, fontWeight: 600,
  },
  statusBadge: {
    fontSize: 12, padding: "4px 10px", borderRadius: 12,
    background: "#fff3e0", color: "#e65100",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "16px 20px",
    display: "flex", flexDirection: "column", gap: 14,
  },
  msgRow: (role) => ({
    display: "flex", justifyContent: role === "user" ? "flex-end" : "flex-start",
    gap: 8, alignItems: "flex-start",
  }),
  avatar: {
    width: 32, height: 32, borderRadius: "50%", background: "#1976d2",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, flexShrink: 0,
  },
  bubble: (role) => ({
    maxWidth: "72%", padding: "10px 14px", borderRadius: 14,
    background: role === "user" ? "#1976d2" : "#fff",
    color: role === "user" ? "#fff" : "#333",
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    lineHeight: 1.6, fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word",
  }),
  sourcesBox: {
    marginTop: 8, padding: "8px 12px",
    background: "#f0f7ff", borderRadius: 8, fontSize: 12,
    color: "#555", borderLeft: "3px solid #1976d2",
  },
  mockBadge: {
    display: "inline-block", marginTop: 6, fontSize: 11,
    padding: "2px 8px", borderRadius: 10,
    background: "#fff3e0", color: "#e65100",
  },
  inputArea: {
    padding: "12px 20px", background: "#fff",
    borderTop: "1px solid #e0e0e0",
    display: "flex", gap: 10,
  },
  input: {
    flex: 1, padding: "10px 14px", borderRadius: 8,
    border: "1px solid #ccc", fontSize: 14, outline: "none",
  },
  sendBtn: {
    padding: "10px 20px", borderRadius: 8, border: "none",
    background: "#1976d2", color: "#fff", cursor: "pointer",
    fontSize: 14, fontWeight: 600,
  },
};

export default function ManualChatBot() {
  const [selectedEquip, setSelectedEquip] = useState(EQUIPMENT_OPTIONS[0]);
  const [messages, setMessages] = useState([
    {
      id: 1, role: "assistant",
      content: "안녕하세요! AI 매뉴얼 챗봇입니다.\n장비를 선택하고 질문을 입력하세요.\n\n예시:\n• SEM 측정 전 시료 준비 조건이 뭐야?\n• 진공 펌핑 절차 알려줘\n• 이미지 촬영할 때 가속전압은?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMgmt, setShowMgmt] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [ragStatus, setRagStatus] = useState(null);
  const [manuals, setManuals] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/manuals/status`);
      setRagStatus(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchManuals = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/manuals/?equipment_name=${selectedEquip.id}`);
      setManuals(res.data || []);
    } catch { /* ignore */ }
  }, [selectedEquip]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { fetchManuals(); }, [fetchManuals]);

  const handleEquipChange = (e) => {
    const eq = EQUIPMENT_OPTIONS.find((o) => o.id === e.target.value);
    setSelectedEquip(eq);
    setMessages([{
      id: Date.now(), role: "assistant",
      content: `**${eq.label}** 장비로 전환됐습니다.\n질문을 입력하세요.`,
    }]);
  };

  const registerDemo = async () => {
    const demoContent = DEMO_MANUALS[selectedEquip.id];
    if (!demoContent) {
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `⚠️ ${selectedEquip.label}의 데모 매뉴얼이 준비되지 않았습니다.`,
      }]);
      return;
    }
    setDemoLoading(true);
    try {
      await axios.post(`${API_BASE}/manuals/demo`, {
        equipment_name: selectedEquip.id,
        title: `${selectedEquip.label} 운영 매뉴얼 (데모)`,
        content: demoContent,
      });
      await fetchManuals();
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `✅ **${selectedEquip.label}** 데모 매뉴얼이 등록됐습니다!\n\nRAG 파이프라인:\n1. 텍스트 청크 분할 (800~1000자 단위)\n2. 임베딩 생성 (FAISS 인덱스 저장)\n3. 이제 질문을 입력하세요.`,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `❌ 데모 등록 실패: ${err.response?.data?.detail || err.message}`,
      }]);
    } finally {
      setDemoLoading(false);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("equipment_name", selectedEquip.id);
    formData.append("title", file.name.replace(".pdf", ""));
    try {
      const res = await axios.post(`${API_BASE}/manuals/upload`, formData);
      await fetchManuals();
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `✅ **${res.data.title}** 업로드 완료!\n청크 수: ${res.data.chunk_count}개\n이제 이 매뉴얼을 기반으로 질문하세요.`,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `❌ 업로드 실패: ${err.response?.data?.detail || err.message}`,
      }]);
    }
    e.target.value = "";
  };

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/manuals/ask`, {
        equipment_name: selectedEquip.id,
        question: q,
        user_id: 1,
      });
      const { answer, sources, mock_mode } = res.data;
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: answer,
        sources: sources || [],
        mock_mode,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now(), role: "assistant",
        content: `❌ 오류: ${err.response?.data?.detail || err.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>📖 AI 매뉴얼 챗봇</span>
        <select style={styles.select} value={selectedEquip.id} onChange={handleEquipChange}>
          {EQUIPMENT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        {manuals.length > 0 && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
            매뉴얼 {manuals.length}개 등록됨
          </span>
        )}
        <button style={styles.mgmtBtn} onClick={() => setShowMgmt((v) => !v)}>
          ⚙️ 관리
        </button>
      </div>

      {showMgmt && (
        <div style={styles.mgmtPanel}>
          <button style={styles.demoBtn} onClick={registerDemo} disabled={demoLoading}>
            {demoLoading ? "등록 중..." : "📝 데모 매뉴얼 등록"}
          </button>
          <label style={styles.uploadLabel}>
            📄 PDF 업로드
            <input type="file" accept=".pdf" style={{ display: "none" }} onChange={handlePdfUpload} />
          </label>
          {ragStatus && (
            <span style={styles.statusBadge}>
              임베딩: {ragStatus.embedding_mode} | LLM: {ragStatus.llm_mode}
            </span>
          )}
        </div>
      )}

      <div style={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.msgRow(msg.role)}>
            {msg.role === "assistant" && <div style={styles.avatar}>🤖</div>}
            <div>
              <div style={styles.bubble(msg.role)}>{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div style={styles.sourcesBox}>
                  <strong>📚 참고 출처:</strong>
                  {msg.sources.map((s, i) => (
                    <div key={i}>
                      {i + 1}. {s.title} — p.{s.page_number}, 청크 #{s.chunk_index}
                      {s.score != null && ` (유사도: ${s.score.toFixed(4)})`}
                    </div>
                  ))}
                </div>
              )}
              {msg.mock_mode && (
                <span style={styles.mockBadge}>🔧 Mock 임베딩 모드</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={styles.msgRow("assistant")}>
            <div style={styles.avatar}>🤖</div>
            <div style={{ ...styles.bubble("assistant"), color: "#999" }}>검색 중●●●</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={`${selectedEquip.label} 관련 질문을 입력하세요...`}
          disabled={loading}
        />
        <button style={styles.sendBtn} onClick={() => sendMessage()} disabled={loading}>
          전송
        </button>
      </div>
    </div>
  );
}
