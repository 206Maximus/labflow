/**
 * DataAnalysisChatBot.jsx — 이미지/데이터 분석 챗봇 UI
 * 파일 동기화로 확보된 데이터·이미지를 기반으로 AI 분석 요청
 * 백엔드(Claude API / GPT-4o Vision) 추후 연결 예정
 */

import { useState, useRef, useEffect } from "react";

// 데모: 동기화된 파일 목록 (실제로는 서버에서 가져옴)
const SYNCED_FILES = [
  { name: "sample_01_theta2theta.raw", type: "data",  equip: "XRD" },
  { name: "sample_01_peaks.csv",       type: "data",  equip: "XRD" },
  { name: "SEM_cross_section_5kx.tif", type: "image", equip: "SEM" },
  { name: "SEM_surface_10kx.tif",      type: "image", equip: "SEM" },
  { name: "AFM_topo_10um.spm",         type: "image", equip: "AFM" },
  { name: "roughness_data.csv",        type: "data",  equip: "AFM" },
  { name: "deposition_log_20260416.csv", type: "data", equip: "E-beam" },
  { name: "furnace1_temp_profile.csv", type: "data",  equip: "Furnace" },
];

const WELCOME_MSG = {
  id: 0,
  role: "assistant",
  content: "안녕하세요! 이미지/데이터 분석 챗봇입니다.\n\n동기화된 파일을 첨부하고 분석을 요청해보세요.\n\n예) 'XRD 피크 분석해줘'\n예) 'SEM 이미지에서 입자 크기 측정해줘'\n예) 'AFM roughness 데이터 통계 내줘'",
};

export default function DataAnalysisChatBot() {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const attachFile = (file) => {
    if (!attachedFiles.find((f) => f.name === file.name)) {
      setAttachedFiles((prev) => [...prev, file]);
    }
    setShowFilePicker(false);
  };

  const removeFile = (fileName) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const fileNames = attachedFiles.map((f) => f.name);
    const userContent = fileNames.length > 0
      ? `${trimmed}\n\n[첨부파일: ${fileNames.join(", ")}]`
      : trimmed;

    const userMsg = { id: Date.now(), role: "user", content: userContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachedFiles([]);
    setLoading(true);

    // 데모 응답
    setTimeout(() => {
      let response = `[분석 엔진 미연결] 분석 요청을 받았습니다.\n\n`;

      if (fileNames.length > 0) {
        const imageFiles = fileNames.filter((n) =>
          n.match(/\.(tif|tiff|bmp|jpg|jpeg|png|spm)$/i)
        );
        const dataFiles = fileNames.filter((n) =>
          n.match(/\.(csv|raw|dat|log|xy)$/i)
        );

        if (imageFiles.length > 0) {
          response += `이미지 파일 (${imageFiles.length}개):\n`;
          imageFiles.forEach((f) => { response += `  - ${f} → Vision API로 분석 예정\n`; });
          response += "\n";
        }
        if (dataFiles.length > 0) {
          response += `데이터 파일 (${dataFiles.length}개):\n`;
          dataFiles.forEach((f) => { response += `  - ${f} → 수치 분석 예정\n`; });
          response += "\n";
        }
      }

      response += `실제 구현 시:\n1. 이미지 → Claude Vision / GPT-4o Vision API\n2. 수치 데이터 → Python 분석 (pandas + matplotlib)\n3. 결과 시각화 → 차트/그래프 생성`;

      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: response },
      ]);
      setLoading(false);
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.container} className="analysis-chatbot-container">
      {/* 헤더 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>📊</span>
          <span style={styles.headerTitle}>데이터 분석 챗봇</span>
        </div>
        <div style={styles.headerTag}>Vision + Analysis</div>
      </div>

      {/* 메시지 영역 */}
      <div style={styles.messageArea}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.messageRow(msg.role)}>
            {msg.role === "assistant" && <div style={styles.avatar}>📊</div>}
            <div style={styles.bubble(msg.role)}>
              {msg.content}
            </div>
            {msg.role === "user" && <div style={styles.avatar}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={styles.messageRow("assistant")}>
            <div style={styles.avatar}>📊</div>
            <div style={styles.bubble("assistant")}>
              <span style={styles.typing}>분석 준비중...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 첨부 파일 표시 */}
      {attachedFiles.length > 0 && (
        <div style={styles.attachBar}>
          {attachedFiles.map((f) => (
            <span key={f.name} style={styles.attachChip}>
              {f.type === "image" ? "🖼️" : "📄"} {f.name}
              <button
                onClick={() => removeFile(f.name)}
                style={styles.chipClose}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 파일 선택 팝업 */}
      {showFilePicker && (
        <div style={styles.filePicker}>
          <div style={styles.pickerHeader}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>동기화된 파일 선택</span>
            <button onClick={() => setShowFilePicker(false)} style={styles.pickerClose}>
              닫기
            </button>
          </div>
          <div style={styles.pickerList}>
            {SYNCED_FILES.map((file) => (
              <button
                key={file.name}
                onClick={() => attachFile(file)}
                style={{
                  ...styles.pickerItem,
                  opacity: attachedFiles.find((f) => f.name === file.name) ? 0.5 : 1,
                }}
                disabled={!!attachedFiles.find((f) => f.name === file.name)}
              >
                <span>{file.type === "image" ? "🖼️" : "📄"}</span>
                <div style={styles.pickerInfo}>
                  <span style={styles.pickerName}>{file.name}</span>
                  <span style={styles.pickerEquip}>{file.equip}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div style={styles.inputArea}>
        <button
          onClick={() => setShowFilePicker(!showFilePicker)}
          style={styles.attachBtn}
          title="파일 첨부"
        >
          📎
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="분석 요청을 입력하세요... (파일 첨부 후 질문)"
          style={styles.textarea}
          rows={2}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            ...styles.sendButton,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          분석
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex", flexDirection: "column", height: "640px",
    maxWidth: "760px", margin: "0 auto",
    border: "1px solid #dde1e7", borderRadius: "14px", overflow: "hidden",
    fontFamily: "'Inter', -apple-system, sans-serif",
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)", backgroundColor: "#fff",
    position: "relative",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 18px", backgroundColor: "#0D47A1",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "8px" },
  headerIcon: { fontSize: "20px" },
  headerTitle: { color: "#fff", fontWeight: 700, fontSize: "16px" },
  headerTag: {
    backgroundColor: "rgba(255,255,255,0.2)", color: "#fff",
    padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
  },
  messageArea: {
    flex: 1, overflowY: "auto", padding: "18px 16px",
    display: "flex", flexDirection: "column", gap: "12px",
    backgroundColor: "#F7F9FC",
  },
  messageRow: (role) => ({
    display: "flex",
    flexDirection: role === "user" ? "row-reverse" : "row",
    alignItems: "flex-end", gap: "8px",
  }),
  avatar: {
    fontSize: "22px", flexShrink: 0,
    width: "34px", height: "34px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  bubble: (role) => ({
    maxWidth: "70%", padding: "10px 14px", borderRadius: "14px",
    fontSize: "14px", lineHeight: 1.65, whiteSpace: "pre-wrap",
    backgroundColor: role === "user" ? "#0D47A1" : "#fff",
    color: role === "user" ? "#fff" : "#1a1a1a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
    borderBottomRightRadius: role === "user" ? "4px" : "14px",
    borderBottomLeftRadius: role === "assistant" ? "4px" : "14px",
  }),
  typing: { color: "#aaa", fontStyle: "italic" },
  attachBar: {
    display: "flex", flexWrap: "wrap", gap: "6px",
    padding: "8px 14px", backgroundColor: "#F0F7FF",
    borderTop: "1px solid #E2E8F0",
  },
  attachChip: {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "4px 10px", backgroundColor: "#E3F2FD",
    borderRadius: "16px", fontSize: "12px", fontWeight: 600,
    color: "#0D47A1",
  },
  chipClose: {
    background: "none", border: "none", cursor: "pointer",
    color: "#90A4AE", fontWeight: 700, fontSize: "12px", padding: "0 2px",
  },
  filePicker: {
    position: "absolute", bottom: "70px", left: "14px", right: "14px",
    backgroundColor: "#fff", borderRadius: "12px",
    border: "1px solid #E2E8F0",
    boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
    zIndex: 20, maxHeight: "260px", overflow: "hidden",
    display: "flex", flexDirection: "column",
  },
  pickerHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", borderBottom: "1px solid #E2E8F0",
  },
  pickerClose: {
    background: "none", border: "none", cursor: "pointer",
    color: "#64748B", fontWeight: 600, fontSize: "13px",
  },
  pickerList: {
    overflowY: "auto", padding: "6px",
    display: "flex", flexDirection: "column", gap: "2px",
  },
  pickerItem: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "8px 10px", borderRadius: "8px",
    border: "none", backgroundColor: "#F8FAFC",
    cursor: "pointer", fontFamily: "inherit",
    transition: "background-color 0.1s",
    textAlign: "left",
  },
  pickerInfo: {
    display: "flex", flexDirection: "column",
  },
  pickerName: {
    fontSize: "13px", fontWeight: 600, color: "#1E293B",
  },
  pickerEquip: {
    fontSize: "11px", color: "#94A3B8",
  },
  inputArea: {
    display: "flex", gap: "8px", padding: "12px 14px",
    borderTop: "1px solid #eee", backgroundColor: "#fff",
  },
  attachBtn: {
    width: "42px", height: "42px",
    border: "1.5px solid #E2E8F0", borderRadius: "10px",
    backgroundColor: "#F8FAFC", cursor: "pointer",
    fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
  },
  textarea: {
    flex: 1, resize: "none", border: "1.5px solid #dde1e7",
    borderRadius: "10px", padding: "10px 12px", fontSize: "14px",
    outline: "none", fontFamily: "inherit",
  },
  sendButton: {
    padding: "0 20px", backgroundColor: "#0D47A1", color: "#fff",
    border: "none", borderRadius: "10px", fontWeight: 700,
    cursor: "pointer", fontSize: "14px",
  },
};
