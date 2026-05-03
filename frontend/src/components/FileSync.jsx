/**
 * FileSync.jsx — 파일 동기화 인터페이스 (프론트 UI 전용)
 * 실험장비에서 생성된 데이터 파일을 확보·다운로드하는 기능
 * 백엔드 연동(AWS S3 등) 추후 구현 예정
 */

import { useState } from "react";

const EQUIPMENT_SOURCES = [
  { id: "xrd",   label: "XRD",     extensions: [".raw", ".xy", ".csv", ".brml"] },
  { id: "sem",   label: "SEM",     extensions: [".tif", ".tiff", ".bmp", ".jpg"] },
  { id: "ebeam", label: "E-beam",  extensions: [".log", ".csv", ".dat"] },
  { id: "afm",   label: "AFM",     extensions: [".spm", ".nid", ".csv", ".jpg"] },
  { id: "furnace", label: "Furnace", extensions: [".csv", ".log", ".dat"] },
];

// 데모 파일 데이터
const DEMO_FILES = {
  xrd: [
    { name: "sample_01_theta2theta.raw", size: "2.4 MB", date: "2026-04-16 14:30", status: "ready" },
    { name: "sample_01_peaks.csv",       size: "128 KB", date: "2026-04-16 14:32", status: "ready" },
    { name: "sample_02_theta2theta.raw", size: "2.1 MB", date: "2026-04-16 10:15", status: "ready" },
  ],
  sem: [
    { name: "SEM_cross_section_5kx.tif",  size: "8.7 MB", date: "2026-04-16 11:20", status: "ready" },
    { name: "SEM_surface_10kx.tif",        size: "9.2 MB", date: "2026-04-16 11:22", status: "ready" },
    { name: "SEM_EDS_mapping.bmp",         size: "15.3 MB", date: "2026-04-16 11:25", status: "syncing" },
  ],
  ebeam: [
    { name: "deposition_log_20260416.csv", size: "45 KB", date: "2026-04-16 09:00", status: "ready" },
    { name: "thickness_monitor.dat",       size: "12 KB", date: "2026-04-16 09:30", status: "ready" },
  ],
  afm: [
    { name: "AFM_topo_10um.spm",    size: "4.5 MB", date: "2026-04-15 16:00", status: "ready" },
    { name: "AFM_phase_10um.jpg",    size: "1.2 MB", date: "2026-04-15 16:02", status: "ready" },
    { name: "roughness_data.csv",    size: "28 KB",  date: "2026-04-15 16:05", status: "ready" },
  ],
  furnace: [
    { name: "furnace1_temp_profile.csv", size: "67 KB", date: "2026-04-16 08:00", status: "ready" },
    { name: "furnace3_log_20260416.log", size: "23 KB", date: "2026-04-16 12:00", status: "syncing" },
  ],
};

export default function FileSync() {
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [downloadingFiles, setDownloadingFiles] = useState(new Set());

  const files = selectedSource ? (DEMO_FILES[selectedSource.id] || []) : [];

  const toggleFile = (fileName) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.name)));
    }
  };

  const handleDownload = (fileName) => {
    setDownloadingFiles((prev) => new Set([...prev, fileName]));
    // 데모 다운로드 시뮬레이션
    setTimeout(() => {
      setDownloadingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
      alert(`[데모] ${fileName} 다운로드 완료 (백엔드 연동 후 실제 동작)`);
    }, 1500);
  };

  const handleBulkDownload = () => {
    selectedFiles.forEach((f) => handleDownload(f));
  };

  const getStatusStyle = (status) => {
    if (status === "ready") return { color: "#2E7D32", bg: "#E8F5E9", label: "준비완료" };
    return { color: "#E65100", bg: "#FFF3E0", label: "동기화중..." };
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>파일 동기화</h2>
        <div style={styles.headerTag}>S3 연동 예정</div>
      </div>
      <p style={styles.desc}>
        실험장비에서 생성된 데이터 파일을 확보하고 다운로드할 수 있습니다.
      </p>

      {/* 장비 소스 선택 */}
      <div style={styles.sourceBar}>
        {EQUIPMENT_SOURCES.map((src) => (
          <button
            key={src.id}
            onClick={() => { setSelectedSource(src); setSelectedFiles(new Set()); }}
            style={{
              ...styles.sourceBtn,
              ...(selectedSource?.id === src.id ? styles.sourceBtnActive : {}),
            }}
          >
            <span style={styles.srcLabel}>{src.label}</span>
            <span style={styles.srcExt}>{src.extensions.join(", ")}</span>
          </button>
        ))}
      </div>

      {/* 파일 목록 */}
      {selectedSource ? (
        <div style={styles.fileSection}>
          <div style={styles.fileHeader}>
            <label style={styles.selectAll}>
              <input
                type="checkbox"
                checked={selectedFiles.size === files.length && files.length > 0}
                onChange={toggleAll}
                style={styles.checkbox}
              />
              전체 선택 ({selectedFiles.size}/{files.length})
            </label>
            <button
              onClick={handleBulkDownload}
              disabled={selectedFiles.size === 0}
              style={{
                ...styles.bulkBtn,
                opacity: selectedFiles.size === 0 ? 0.4 : 1,
              }}
            >
              선택 다운로드 ({selectedFiles.size})
            </button>
          </div>

          <div style={styles.fileList}>
            {files.map((file) => {
              const st = getStatusStyle(file.status);
              const isDownloading = downloadingFiles.has(file.name);

              return (
                <div key={file.name} style={styles.fileRow}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.name)}
                    onChange={() => toggleFile(file.name)}
                    style={styles.checkbox}
                  />
                  <div style={styles.fileIcon}>
                    {file.name.match(/\.(tif|tiff|bmp|jpg|jpeg|png)$/i) ? "🖼️" : "📄"}
                  </div>
                  <div style={styles.fileInfo}>
                    <span style={styles.fileName}>{file.name}</span>
                    <span style={styles.fileMeta}>{file.size} · {file.date}</span>
                  </div>
                  <span style={{
                    ...styles.fileStatus,
                    color: st.color, backgroundColor: st.bg,
                  }}>
                    {st.label}
                  </span>
                  <button
                    onClick={() => handleDownload(file.name)}
                    disabled={file.status !== "ready" || isDownloading}
                    style={{
                      ...styles.dlBtn,
                      opacity: file.status !== "ready" || isDownloading ? 0.4 : 1,
                    }}
                  >
                    {isDownloading ? "..." : "⬇"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={styles.placeholder}>
          위에서 장비를 선택하면 해당 장비의 데이터 파일 목록이 표시됩니다.
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "4px",
  },
  title: {
    margin: 0, fontSize: "20px", fontWeight: 700, color: "#1E293B",
  },
  headerTag: {
    backgroundColor: "#FFF3E0", color: "#E65100",
    padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
  },
  desc: {
    fontSize: "14px", color: "#64748B", marginBottom: "16px",
  },
  sourceBar: {
    display: "flex", gap: "8px", marginBottom: "16px",
    flexWrap: "wrap",
  },
  sourceBtn: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "10px 16px", border: "1.5px solid #E2E8F0", borderRadius: "10px",
    backgroundColor: "#fff", cursor: "pointer", transition: "all 0.15s",
    fontFamily: "inherit", minWidth: "90px",
  },
  sourceBtnActive: {
    backgroundColor: "#1E3A8A", borderColor: "#1E3A8A",
    color: "#fff",
  },
  srcLabel: {
    fontSize: "14px", fontWeight: 700,
  },
  srcExt: {
    fontSize: "10px", marginTop: "2px", opacity: 0.7,
  },
  fileSection: {},
  fileHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "10px", padding: "8px 0",
  },
  selectAll: {
    display: "flex", alignItems: "center", gap: "8px",
    fontSize: "14px", fontWeight: 600, color: "#475569", cursor: "pointer",
  },
  checkbox: { width: "16px", height: "16px", cursor: "pointer" },
  bulkBtn: {
    padding: "7px 16px", backgroundColor: "#1E3A8A", color: "#fff",
    border: "none", borderRadius: "8px", cursor: "pointer",
    fontWeight: 600, fontSize: "13px",
  },
  fileList: {
    display: "flex", flexDirection: "column", gap: "4px",
  },
  fileRow: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 12px", backgroundColor: "#F8FAFC",
    borderRadius: "10px", border: "1px solid #E2E8F0",
  },
  fileIcon: { fontSize: "20px", flexShrink: 0 },
  fileInfo: {
    flex: 1, display: "flex", flexDirection: "column",
  },
  fileName: {
    fontSize: "14px", fontWeight: 600, color: "#1E293B",
  },
  fileMeta: {
    fontSize: "12px", color: "#94A3B8", marginTop: "2px",
  },
  fileStatus: {
    padding: "3px 10px", borderRadius: "12px",
    fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
  },
  dlBtn: {
    width: "34px", height: "34px",
    border: "1px solid #E2E8F0", borderRadius: "8px",
    backgroundColor: "#fff", cursor: "pointer", fontSize: "16px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  placeholder: {
    padding: "60px 20px", textAlign: "center",
    color: "#94A3B8", fontSize: "15px",
    backgroundColor: "#F8FAFC", borderRadius: "12px",
    border: "2px dashed #E2E8F0",
  },
};
