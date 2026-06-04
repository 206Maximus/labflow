import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";
const DEMO_PROMPT = "내일 오후 2시에 SEM 1시간 예약해줘";

const SUGGESTIONS = [
  {
    label: "예약 검토 카드 데모",
    text: DEMO_PROMPT,
  },
  {
    label: "가능 장비 확인",
    text: "이번 주 금요일에 사용 가능한 장비 알려줘",
  },
  {
    label: "일정 충돌 확인",
    text: "내 Google Calendar와 겹치지 않는 시간 찾아줘",
  },
  {
    label: "AI 매뉴얼 검색",
    text: "SEM 사용 전 주의사항 알려줘",
  },
];

const CALENDAR_TABS = [
  { id: "system", label: "시스템", title: "시스템 캘린더" },
  { id: "google", label: "Google", title: "사용자 Google 캘린더" },
];

const EQUIPMENT_CALENDAR_TABS = ["SEM", "XRD", "AFM", "E-beam"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SYSTEM_RESERVATIONS = {
  SEM: [
    { day: 0, time: "14:00", title: "내 예약 검토", tone: "blue" },
    { day: 2, time: "10:00", title: "박막 분석", tone: "green" },
  ],
  XRD: [
    { day: 1, time: "11:00", title: "결정 구조", tone: "blue" },
    { day: 4, time: "15:00", title: "분말 분석", tone: "amber" },
  ],
  AFM: [
    { day: 0, time: "09:30", title: "표면 측정", tone: "purple" },
  ],
  "E-beam": [
    { day: 3, time: "16:00", title: "증착 작업", tone: "amber" },
  ],
};

const GOOGLE_EVENTS = [
  { day: "Mon", time: "09:00", title: "랩 미팅" },
  { day: "Tue", time: "13:30", title: "시료 준비" },
  { day: "Thu", time: "15:00", title: "교수님 미팅" },
];

export default function CommandCenter({ userId, nickname }) {
  const displayName = useMemo(
    () => (nickname || `User ${userId || ""}`).trim() || "LabFlow User",
    [nickname, userId]
  );

  const isNarrow = useMediaQuery("(max-width: 840px)");
  const [room, setRoom] = useState(null);
  const [prompt, setPrompt] = useState(DEMO_PROMPT);
  const [commandResult, setCommandResult] = useState(null);
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(false);
  const [activeCalendarTab, setActiveCalendarTab] = useState("system");
  const [loading, setLoading] = useState(false);
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function ensureDefaultRoom() {
      try {
        const res = await axios.get(`${API_BASE}/rooms/`, {
          params: { nickname: displayName },
        });

        if (!mounted) return;
        if (res.data.length > 0) {
          setRoom(res.data[0]);
          return;
        }

        const created = await axios.post(`${API_BASE}/rooms/`, {
          nickname: displayName,
          room_name: "Home",
        });

        if (mounted) setRoom(created.data);
      } catch (err) {
        if (!mounted) return;
        console.error("Command Center room setup failed:", err);
        setRoomError("대화방 준비 중 문제가 생겼습니다. 발표 데모 UI는 계속 사용할 수 있어요.");
      }
    }

    ensureDefaultRoom();
    return () => {
      mounted = false;
    };
  }, [displayName]);

  const submitPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    if (isDemoReservationPrompt(trimmed)) {
      setCommandResult(buildReviewResult(trimmed));
      setActiveCalendarTab("system");
      setCalendarPanelOpen(true);
      return;
    }

    try {
      await sendToAssistant(trimmed);
    } catch (err) {
      console.error("Command Center prompt failed:", err);
      setCommandResult({
        type: "assistant_reply",
        prompt: trimmed,
        reply: "지금은 백엔드 연결을 확인하는 중입니다. 대표 예약 프롬프트는 데모 카드로 먼저 확인할 수 있어요.",
      });
      setCalendarPanelOpen(true);
      setLoading(false);
    }
  };

  const confirmReservation = async () => {
    const text = commandResult?.prompt || prompt;
    setLoading(true);

    try {
      const reply = await sendToAssistant(text, { silentLoading: true });
      setCommandResult({
        type: "reservation_done",
        equipment: "SEM",
        timeLabel: "내일 14:00 - 15:00",
        reply,
      });
      setActiveCalendarTab("system");
      setCalendarPanelOpen(true);
    } catch (err) {
      setCommandResult({
        type: "reservation_done",
        equipment: "SEM",
        timeLabel: "내일 14:00 - 15:00",
        reply: "예약 완료 카드 데모입니다. 백엔드 연결이 준비되면 실제 예약 ID가 함께 표시됩니다.",
      });
      setActiveCalendarTab("system");
      setCalendarPanelOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const sendToAssistant = async (text, options = {}) => {
    if (!room) {
      throw new Error("Command Center room is not ready.");
    }

    if (!options.silentLoading) setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/chat/`, {
        room_id: room.id,
        message: text,
        user_id: userId,
      });

      const reply = res.data.reply || "요청을 처리했습니다.";
      if (!options.silentLoading) {
        setCommandResult({
          type: "assistant_reply",
          prompt: text,
          reply,
          action: res.data.action,
        });
        setCalendarPanelOpen(true);
      }
      return reply;
    } finally {
      if (!options.silentLoading) setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.shell, ...(isNarrow ? styles.shellNarrow : {}) }}>
      <section style={styles.mainStage}>
        <div style={styles.heroWrap}>
          <div style={styles.kicker}>AI 기반 연구실 장비 운영 홈</div>
          <h1 style={styles.heroTitle}>오늘 어떤 장비를 사용할까요?</h1>
          <p style={styles.heroCopy}>
            장비 예약, 사용 가능 시간 확인, 안전교육 상태 확인까지
            <br />
            LabFlow가 한 번에 도와드릴게요.
          </p>

          <div style={styles.promptShell}>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPrompt();
              }}
              placeholder={DEMO_PROMPT}
              style={styles.promptInput}
            />
            <button
              type="button"
              onClick={submitPrompt}
              disabled={loading || !prompt.trim()}
              aria-label="명령 실행"
              title="명령 실행"
              style={{
                ...styles.sendButton,
                opacity: loading || !prompt.trim() ? 0.55 : 1,
              }}
            >
              ↑
            </button>
          </div>

          {roomError && <div style={styles.softWarning}>{roomError}</div>}

          <div style={styles.suggestionGrid}>
            {SUGGESTIONS.map((item) => (
              <button
                key={item.text}
                type="button"
                style={styles.suggestionCard}
                onClick={() => setPrompt(item.text)}
              >
                <span style={styles.suggestionLabel}>{item.label}</span>
                <span style={styles.suggestionText}>{item.text}</span>
              </button>
            ))}
          </div>

          {commandResult && (
            <div style={styles.resultWrap}>
              {commandResult.type === "reservation_review" && (
                <ReservationReviewCard result={commandResult} onConfirm={confirmReservation} loading={loading} />
              )}
              {commandResult.type === "reservation_done" && (
                <ReservationDoneCard result={commandResult} />
              )}
              {commandResult.type === "assistant_reply" && (
                <AssistantReplyCard result={commandResult} />
              )}
            </div>
          )}
        </div>
      </section>

      <CalendarDock
        open={calendarPanelOpen}
        activeTab={activeCalendarTab}
        onOpen={(tabId) => {
          setActiveCalendarTab(tabId);
          setCalendarPanelOpen(true);
        }}
        onSelectTab={setActiveCalendarTab}
        onClose={() => setCalendarPanelOpen(false)}
        result={commandResult}
        isNarrow={isNarrow}
      />
    </div>
  );
}

function ReservationReviewCard({ result, onConfirm, loading }) {
  return (
    <div style={styles.reviewCard}>
      <div>
        <div style={styles.resultEyebrow}>예약 검토</div>
        <h2 style={styles.resultTitle}>예약 가능 시간을 찾았어요.</h2>
      </div>

      <div style={styles.reviewDetails}>
        <InfoPill label="장비" value={result.equipment} />
        <InfoPill label="시간" value={result.timeLabel} />
        <InfoPill label="상태" value="예약 가능" tone="success" />
      </div>

      <div style={styles.checkGrid}>
        {result.checklist.map((item) => (
          <div key={item} style={styles.checkItem}>
            <span style={styles.checkMark}>✓</span>
            {item}
          </div>
        ))}
      </div>

      <div style={styles.actionRow}>
        <button type="button" style={styles.primaryAction} onClick={onConfirm} disabled={loading}>
          {loading ? "예약 처리 중..." : "예약 확정하기"}
        </button>
        <button type="button" style={styles.secondaryAction}>
          시간 바꾸기
        </button>
      </div>
    </div>
  );
}

function ReservationDoneCard({ result }) {
  return (
    <div style={styles.reviewCard}>
      <div>
        <div style={styles.resultEyebrow}>예약 완료</div>
        <h2 style={styles.resultTitle}>예약이 완료되었어요.</h2>
      </div>
      <div style={styles.doneHero}>
        <strong>{result.equipment}</strong>
        <span>{result.timeLabel}</span>
      </div>
      <p style={styles.replyText}>{result.reply}</p>
      <div style={styles.actionRow}>
        <button type="button" style={styles.primaryAction}>내 예약 보기</button>
        <button type="button" style={styles.secondaryAction}>캘린더 열기</button>
      </div>
    </div>
  );
}

function AssistantReplyCard({ result }) {
  return (
    <div style={styles.reviewCard}>
      <div style={styles.resultEyebrow}>AI 응답</div>
      <h2 style={styles.resultTitle}>요청을 처리했어요.</h2>
      <p style={styles.replyText}>{result.reply}</p>
    </div>
  );
}

function InfoPill({ label, value, tone }) {
  return (
    <div style={styles.infoPill}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={{ ...styles.infoValue, ...(tone === "success" ? styles.successText : {}) }}>{value}</strong>
    </div>
  );
}

function CalendarDock({ open, activeTab, onOpen, onSelectTab, onClose, result, isNarrow }) {
  if (!open) {
    return (
      <div style={{ ...styles.dockRail, ...(isNarrow ? styles.dockRailNarrow : {}) }}>
        {CALENDAR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onOpen(tab.id)}
            title={tab.title}
            style={styles.railTab}
          >
            <span style={styles.railArrow}>‹</span>
            <span style={styles.railLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside style={{ ...styles.calendarPanel, ...(isNarrow ? styles.calendarPanelNarrow : {}) }}>
      <button type="button" onClick={onClose} style={styles.panelClose} aria-label="캘린더 패널 접기">
        ›
      </button>

      <div style={styles.panelTabs}>
        {CALENDAR_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              style={{ ...styles.panelTabButton, ...(active ? styles.panelTabButtonActive : {}) }}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      <SystemCalendarPanel result={result} dimmed={activeTab !== "system"} />
      <GoogleCalendarPanel dimmed={activeTab !== "google"} />
    </aside>
  );
}

function SystemCalendarPanel({ result, dimmed }) {
  const [equipment, setEquipment] = useState(result?.equipment || "SEM");
  const reservations = SYSTEM_RESERVATIONS[equipment] || [];

  useEffect(() => {
    if (result?.equipment && EQUIPMENT_CALENDAR_TABS.includes(result.equipment)) {
      setEquipment(result.equipment);
    }
  }, [result?.equipment]);

  return (
    <section style={{ ...styles.calendarSection, ...(dimmed ? styles.calendarSectionDimmed : {}) }}>
      <div style={styles.sectionHeader}>
        <div>
          <span style={styles.sectionKicker}>LabFlow</span>
          <h2 style={styles.sectionTitle}>시스템 캘린더</h2>
        </div>
        <span style={styles.syncPill}>장비별</span>
      </div>

      <div style={styles.equipmentTabs}>
        {EQUIPMENT_CALENDAR_TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setEquipment(item)}
            style={{
              ...styles.equipmentTab,
              ...(equipment === item ? styles.equipmentTabActive : {}),
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <MiniWeekCalendar events={reservations} />

      {result?.type === "reservation_review" && (
        <div style={styles.panelReviewNote}>
          <strong>{result.equipment}</strong>
          <span>{result.timeLabel}</span>
        </div>
      )}
    </section>
  );
}

function GoogleCalendarPanel({ dimmed }) {
  return (
    <section style={{ ...styles.calendarSection, ...(dimmed ? styles.calendarSectionDimmed : {}) }}>
      <div style={styles.sectionHeader}>
        <div>
          <span style={styles.sectionKicker}>Personal</span>
          <h2 style={styles.sectionTitle}>사용자 Google 캘린더</h2>
        </div>
        <span style={styles.syncPill}>연동됨</span>
      </div>

      <div style={styles.googleList}>
        {GOOGLE_EVENTS.map((event) => (
          <div key={`${event.day}-${event.time}`} style={styles.googleEvent}>
            <span style={styles.googleDay}>{event.day}</span>
            <div>
              <strong>{event.time}</strong>
              <span>{event.title}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniWeekCalendar({ events }) {
  return (
    <div style={styles.weekCalendar}>
      {WEEK_DAYS.map((day, index) => (
        <div key={day} style={styles.weekColumn}>
          <div style={styles.weekDay}>{day}</div>
          <div style={styles.weekSlot}>
            {events
              .filter((event) => event.day === index)
              .map((event) => (
                <CalendarEvent key={`${event.time}-${event.title}`} event={event} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarEvent({ event }) {
  return (
    <div style={{ ...styles.calendarEvent, ...eventTone(event.tone) }}>
      <strong>{event.time}</strong>
      <span>{event.title}</span>
    </div>
  );
}

function eventTone(tone) {
  const tones = {
    blue: { backgroundColor: "#DBEAFE", color: "#1E3A8A", borderColor: "#93C5FD" },
    green: { backgroundColor: "#DCFCE7", color: "#166534", borderColor: "#86EFAC" },
    amber: { backgroundColor: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" },
    purple: { backgroundColor: "#EDE9FE", color: "#5B21B6", borderColor: "#C4B5FD" },
  };
  return tones[tone] || tones.blue;
}

function buildReviewResult(prompt) {
  return {
    type: "reservation_review",
    prompt,
    equipment: "SEM",
    timeLabel: "내일 14:00 - 15:00",
    checklist: [
      "안전교육 인증 완료",
      "노쇼 제한 없음",
      "장비 시간 충돌 없음",
      "Google Calendar 충돌 없음",
    ],
  };
}

function isDemoReservationPrompt(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("sem") &&
    lower.includes("예약") &&
    (lower.includes("내일") || lower.includes("오후 2") || lower.includes("2시"))
  );
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);

    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, [query]);

  return matches;
}

const styles = {
  shell: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: "calc(100vh - 60px)",
    width: "100%",
  },
  shellNarrow: {
    gridTemplateColumns: "1fr",
  },
  mainStage: {
    display: "flex",
    justifyContent: "center",
    minWidth: 0,
    padding: "84px 42px 48px",
  },
  heroWrap: {
    width: "100%",
    maxWidth: 920,
    textAlign: "center",
  },
  kicker: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  heroTitle: {
    margin: "12px 0 12px",
    color: "#0F172A",
    fontSize: 44,
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: 0,
  },
  heroCopy: {
    margin: "0 0 30px",
    color: "#475569",
    fontSize: 18,
    lineHeight: 1.7,
    fontWeight: 650,
  },
  promptShell: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    maxWidth: 780,
    margin: "0 auto",
    padding: 8,
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 8px 24px rgba(15,23,42,0.10)",
  },
  promptInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    padding: "13px 14px",
    color: "#0F172A",
    fontSize: 16,
    fontFamily: "inherit",
  },
  sendButton: {
    width: 46,
    height: 46,
    border: "none",
    borderRadius: 8,
    backgroundColor: "#1E3A8A",
    color: "#fff",
    cursor: "pointer",
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 900,
  },
  softWarning: {
    maxWidth: 780,
    margin: "12px auto 0",
    padding: "10px 12px",
    border: "1px solid #FDE68A",
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    color: "#92400E",
    fontSize: 13,
    textAlign: "left",
  },
  suggestionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    maxWidth: 920,
    margin: "22px auto 0",
  },
  suggestionCard: {
    minHeight: 92,
    padding: "18px 20px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 8px 18px rgba(15,23,42,0.06)",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
  suggestionLabel: {
    display: "block",
    marginBottom: 8,
    color: "#64748B",
    fontSize: 12,
    fontWeight: 850,
  },
  suggestionText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.45,
  },
  resultWrap: {
    maxWidth: 780,
    margin: "24px auto 0",
    textAlign: "left",
  },
  reviewCard: {
    padding: 22,
    border: "1px solid #BFDBFE",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 14px 36px rgba(30,58,138,0.14)",
  },
  resultEyebrow: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: 900,
  },
  resultTitle: {
    margin: "4px 0 16px",
    color: "#0F172A",
    fontSize: 22,
    lineHeight: 1.3,
  },
  reviewDetails: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  infoPill: {
    padding: "12px 14px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  infoLabel: {
    display: "block",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 4,
  },
  infoValue: {
    color: "#0F172A",
    fontSize: 15,
  },
  successText: {
    color: "#15803D",
  },
  checkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    margin: "14px 0 18px",
  },
  checkItem: {
    color: "#334155",
    fontSize: 14,
    fontWeight: 700,
  },
  checkMark: {
    color: "#16A34A",
    fontWeight: 900,
  },
  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryAction: {
    border: "none",
    borderRadius: 8,
    backgroundColor: "#1E3A8A",
    color: "#fff",
    padding: "11px 16px",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  secondaryAction: {
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    backgroundColor: "#fff",
    color: "#1E3A8A",
    padding: "10px 15px",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  doneHero: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
  },
  replyText: {
    margin: "0 0 16px",
    color: "#334155",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  },
  dockRail: {
    position: "sticky",
    top: 86,
    alignSelf: "start",
    display: "grid",
    gap: 38,
    width: 52,
    margin: "38px 18px 0 0",
    zIndex: 35,
  },
  dockRailNarrow: {
    position: "fixed",
    right: 0,
    top: 92,
  },
  railTab: {
    width: 52,
    height: 128,
    border: "1px solid #BFDBFE",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontFamily: "inherit",
    fontWeight: 900,
    boxShadow: "-6px 8px 22px rgba(30,58,138,0.10)",
  },
  railArrow: {
    fontSize: 28,
    lineHeight: 1,
  },
  railLabel: {
    writingMode: "vertical-rl",
    transform: "rotate(180deg)",
    fontSize: 12,
  },
  calendarPanel: {
    position: "sticky",
    top: 82,
    alignSelf: "start",
    width: 382,
    maxHeight: "calc(100vh - 104px)",
    overflowY: "auto",
    margin: "28px 18px 0 0",
    padding: "18px 18px 20px",
    border: "1px solid #DBEAFE",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    backgroundColor: "#fff",
    boxShadow: "-16px 18px 44px rgba(15,23,42,0.14)",
    zIndex: 42,
  },
  calendarPanelNarrow: {
    position: "fixed",
    top: 76,
    right: 0,
    width: "min(382px, calc(100vw - 28px))",
    maxHeight: "calc(100vh - 92px)",
    margin: 0,
  },
  panelClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    border: "1px solid #DBEAFE",
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
    cursor: "pointer",
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1,
  },
  panelTabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    paddingRight: 36,
    marginBottom: 14,
  },
  panelTabButton: {
    minHeight: 34,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    color: "#64748B",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 850,
  },
  panelTabButtonActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
  },
  calendarSection: {
    padding: 14,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
    transition: "opacity 0.15s, transform 0.15s",
  },
  calendarSectionDimmed: {
    opacity: 0.62,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionKicker: {
    display: "block",
    marginBottom: 3,
    color: "#64748B",
    fontSize: 11,
    fontWeight: 900,
  },
  sectionTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 19,
    lineHeight: 1.2,
  },
  syncPill: {
    padding: "4px 8px",
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    color: "#15803D",
    fontSize: 11,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  equipmentTabs: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    marginBottom: 10,
    paddingBottom: 2,
  },
  equipmentTab: {
    border: "1px solid #E2E8F0",
    borderRadius: 7,
    backgroundColor: "#F8FAFC",
    color: "#475569",
    cursor: "pointer",
    padding: "6px 9px",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 850,
    whiteSpace: "nowrap",
  },
  equipmentTabActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#1E3A8A",
    color: "#fff",
  },
  weekCalendar: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    minHeight: 168,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F8FAFC",
  },
  weekColumn: {
    minWidth: 0,
    borderRight: "1px solid #E2E8F0",
    backgroundColor: "#fff",
  },
  weekDay: {
    padding: "8px 4px",
    borderBottom: "1px solid #E2E8F0",
    backgroundColor: "#F8FAFC",
    color: "#64748B",
    fontSize: 11,
    fontWeight: 900,
    textAlign: "center",
  },
  weekSlot: {
    display: "grid",
    alignContent: "start",
    gap: 5,
    minHeight: 126,
    padding: 5,
  },
  calendarEvent: {
    display: "grid",
    gap: 2,
    minHeight: 42,
    padding: "6px 5px",
    border: "1px solid",
    borderRadius: 6,
    fontSize: 10,
    lineHeight: 1.25,
    overflow: "hidden",
  },
  panelReviewNote: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: 800,
  },
  googleList: {
    display: "grid",
    gap: 8,
    minHeight: 154,
  },
  googleEvent: {
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    padding: "10px 11px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    color: "#334155",
    fontSize: 13,
  },
  googleDay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 34,
    borderRadius: 7,
    backgroundColor: "#EEF2FF",
    color: "#3730A3",
    fontSize: 11,
    fontWeight: 900,
  },
};
