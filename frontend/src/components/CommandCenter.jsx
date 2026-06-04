import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000/api/v1";
const DEMO_PROMPT = "내일 오후 2시에 SEM 1시간 예약해줘";

const EQUIPMENT_CALENDAR_TABS = ["SEM", "XRD", "AFM", "E-beam", "Furnace #1", "Furnace #2"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const EQUIP_NAME_MAP = {
  1: "XRD",
  2: "SEM",
  3: "E-beam",
  4: "AFM",
  5: "Furnace #1",
  6: "Furnace #2",
  7: "Furnace #3",
  8: "Furnace #4",
};

export default function CommandCenter({
  userId,
  nickname,
  auth,
  activeRoom,
  messages,
  setMessages,
  onRoomTitleFromPrompt,
}) {
  const displayName = useMemo(
    () => (nickname || `User ${userId || ""}`).trim() || "LabFlow User",
    [nickname, userId]
  );

  const isNarrow = useMediaQuery("(max-width: 840px)");
  const bottomRef = useRef(null);
  const [prompt, setPrompt] = useState(DEMO_PROMPT);
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadedHistoryRooms, setLoadedHistoryRooms] = useState({});
  const [roomError, setRoomError] = useState("");
  const [systemReservations, setSystemReservations] = useState([]);
  const [reservationLoading, setReservationLoading] = useState(false);

  const activeRoomId = activeRoom?.id;
  const isChatMode = messages.length > 0 || historyLoading;

  const appendMessage = useCallback(
    (message) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages]
  );

  const replaceMessage = useCallback(
    (messageId, patch) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === messageId ? { ...message, ...patch } : message))
      );
    },
    [setMessages]
  );

  const refreshReservations = useCallback(async () => {
    setReservationLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/reservations/?limit=100`);
      setSystemReservations(response.data || []);
    } catch (err) {
      console.error("Command Center reservation load failed:", err);
    } finally {
      setReservationLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshReservations();
    const interval = setInterval(refreshReservations, 30000);
    return () => clearInterval(interval);
  }, [refreshReservations]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (messages.length > 0 || loadedHistoryRooms[activeRoomId] || activeRoom.message_count === 0) return;

    let mounted = true;
    setHistoryLoading(true);
    axios
      .get(`${API_BASE}/rooms/${activeRoomId}/messages`)
      .then((response) => {
        if (!mounted) return;
        const historyMessages = (response.data || []).map((item) => ({
          id: `history-${item.id}`,
          role: item.role,
          text: item.content,
          cardType: "assistant_reply",
          persisted: true,
        }));
        setMessages(historyMessages);
        setLoadedHistoryRooms((prev) => ({ ...prev, [activeRoomId]: true }));
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Command Center history load failed:", err);
        setRoomError("이 대화의 이전 기록을 불러오지 못했습니다. 새 메시지는 계속 보낼 수 있어요.");
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeRoom, activeRoomId, loadedHistoryRooms, messages.length, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, historyLoading]);

  const sendToAssistant = async (text) => {
    if (!activeRoomId) {
      throw new Error("Command Center room is not ready.");
    }

    const response = await axios.post(`${API_BASE}/chat/`, {
      room_id: activeRoomId,
      message: text,
      user_id: userId,
    });

    return {
      reply: response.data.reply || "요청을 처리했습니다.",
      action: response.data.action,
      data: response.data.data,
    };
  };

  const submitPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    if (!activeRoomId) {
      setRoomError("대화방을 준비하는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setRoomError("");
    setPrompt("");
    setCalendarPanelOpen(true);
    onRoomTitleFromPrompt?.(activeRoomId, trimmed);

    appendMessage({
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    });

    if (isDemoReservationPrompt(trimmed)) {
      appendMessage({
        id: `assistant-${Date.now()}-review`,
        role: "assistant",
        text: "아래 조건으로 예약을 확정할 수 있습니다.",
        cardType: "reservation_review",
        payload: buildReviewResult(trimmed),
      });
      return;
    }

    setLoading(true);
    try {
      const assistant = await sendToAssistant(trimmed);
      appendMessage({
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: assistant.reply,
        cardType: "assistant_reply",
        action: assistant.action,
        payload: assistant.data,
      });
      refreshReservations();
    } catch (err) {
      console.error("Command Center prompt failed:", err);
      appendMessage({
        id: `assistant-${Date.now()}-error`,
        role: "assistant",
        text: "지금은 백엔드 연결을 확인하는 중입니다. 잠시 후 다시 시도해주세요.",
        cardType: "assistant_reply",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmReservation = async (result, messageId) => {
    if (!result?.prompt || loading) return;

    setLoading(true);
    replaceMessage(messageId, { payload: { ...result, confirming: true } });

    try {
      const assistant = await sendToAssistant(result.normalizedPrompt || result.prompt);
      if (assistant.action === "reservation_created") {
        appendMessage({
          id: `assistant-${Date.now()}-done`,
          role: "assistant",
          text: "예약을 확정했습니다.",
          cardType: "reservation_done",
          payload: {
            equipment: result.equipment,
            timeLabel: result.timeLabel,
            reply: assistant.reply,
            reservationId: assistant.data?.reservation_id,
          },
        });
      } else {
        appendMessage({
          id: `assistant-${Date.now()}-reply`,
          role: "assistant",
          text: assistant.reply,
          cardType: "assistant_reply",
          action: assistant.action,
          payload: assistant.data,
        });
      }
      replaceMessage(messageId, { payload: { ...result, confirmed: true, confirming: false } });
      refreshReservations();
      setCalendarPanelOpen(true);
    } catch (err) {
      console.error("Command Center reservation confirm failed:", err);
      appendMessage({
        id: `assistant-${Date.now()}-fallback-done`,
        role: "assistant",
        text: "예약 완료 카드 데모입니다.",
        cardType: "reservation_done",
        payload: {
          equipment: result.equipment,
          timeLabel: result.timeLabel,
          reply: "백엔드 연결이 준비되면 실제 예약 ID가 함께 표시됩니다.",
        },
      });
      replaceMessage(messageId, { payload: { ...result, confirming: false } });
    } finally {
      setLoading(false);
    }
  };

  const requestTimeChange = (result) => {
    const nextPrompt = `${result.equipment} 예약 시간을 다른 가능한 시간으로 바꿔줘`;
    setPrompt(nextPrompt);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <div style={{ ...styles.shell, ...(isNarrow ? styles.shellNarrow : {}) }}>
      <section
        style={{
          ...styles.mainStage,
          ...(isChatMode ? styles.mainStageChat : {}),
          ...(isNarrow ? styles.mainStageNarrow : {}),
        }}
      >
        {!isChatMode ? (
          <div style={styles.heroWrap}>
            <div style={styles.kicker}>AI 기반 연구실 장비 운영 홈</div>
            <h1 style={styles.heroTitle}>오늘 어떤 장비를 사용할까요?</h1>
            <p style={styles.heroCopy}>
              장비 예약, 사용 가능 시간 확인, 안전교육 상태 확인까지
              <br />
              LabFlow가 한 번에 도와드릴게요.
            </p>

            <PromptComposer
              prompt={prompt}
              setPrompt={setPrompt}
              onSubmit={submitPrompt}
              loading={loading}
              disabled={!activeRoomId}
              placeholder={DEMO_PROMPT}
            />

            {roomError && <div style={styles.softWarning}>{roomError}</div>}
          </div>
        ) : (
          <div style={styles.chatRoom}>
            <div style={styles.chatHeader}>
              <div>
                <span style={styles.chatKicker}>{displayName}</span>
                <h1 style={styles.chatTitle}>{activeRoom?.room_name || "새 대화"}</h1>
              </div>
              <span style={styles.chatStatus}>{activeRoomId ? `Room #${activeRoomId}` : "Preparing"}</span>
            </div>

            <div style={styles.messageList}>
              {historyLoading && <div style={styles.loadingText}>대화 기록을 불러오는 중...</div>}
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  loading={loading}
                  onConfirm={confirmReservation}
                  onChangeTime={requestTimeChange}
                />
              ))}
              {loading && (
                <div style={styles.messageRowAssistant}>
                  <div style={styles.assistantAvatar}>LF</div>
                  <div style={{ ...styles.messageBubble, ...styles.assistantBubble, ...styles.typingBubble }}>
                    <span style={styles.typingDot} />
                    <span style={styles.typingDot} />
                    <span style={styles.typingDot} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {roomError && <div style={styles.chatWarning}>{roomError}</div>}

            <PromptComposer
              prompt={prompt}
              setPrompt={setPrompt}
              onSubmit={submitPrompt}
              loading={loading}
              disabled={!activeRoomId}
              placeholder="메시지를 입력하세요"
              compact
            />
          </div>
        )}
      </section>

      <CalendarDock
        open={calendarPanelOpen}
        onOpen={() => setCalendarPanelOpen(true)}
        onClose={() => setCalendarPanelOpen(false)}
        result={lastReservationPayload(messages)}
        isNarrow={isNarrow}
        systemReservations={systemReservations}
        reservationLoading={reservationLoading}
        auth={auth}
      />
    </div>
  );
}

function PromptComposer({ prompt, setPrompt, onSubmit, loading, disabled, placeholder, compact }) {
  return (
    <div style={{ ...styles.promptShell, ...(compact ? styles.promptShellCompact : {}) }}>
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
        }}
        placeholder={placeholder}
        style={styles.promptInput}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || disabled || !prompt.trim()}
        aria-label="메시지 보내기"
        title="메시지 보내기"
        style={{
          ...styles.sendButton,
          opacity: loading || disabled || !prompt.trim() ? 0.55 : 1,
        }}
      >
        <SendIcon />
      </button>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M10 15.5V4.75M5.75 9 10 4.75 14.25 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatMessage({ message, loading, onConfirm, onChangeTime }) {
  const isUser = message.role === "user";
  const rowStyle = isUser ? styles.messageRowUser : styles.messageRowAssistant;
  const bubbleStyle = isUser
    ? { ...styles.messageBubble, ...styles.userBubble }
    : {
        ...styles.messageBubble,
        ...styles.assistantBubble,
        ...(message.cardType === "reservation_review" || message.cardType === "reservation_done"
          ? styles.assistantCardBubble
          : {}),
      };

  return (
    <div style={rowStyle}>
      {!isUser && <div style={styles.assistantAvatar}>LF</div>}
      <div style={bubbleStyle}>
        {message.text && message.cardType !== "assistant_reply" && (
          <p style={styles.messageText}>{message.text}</p>
        )}
        <MessageContent
          message={message}
          loading={loading}
          onConfirm={onConfirm}
          onChangeTime={onChangeTime}
        />
      </div>
    </div>
  );
}

function MessageContent({ message, loading, onConfirm, onChangeTime }) {
  if (message.role === "user") {
    return <span>{message.text}</span>;
  }

  if (message.cardType === "reservation_review") {
    return (
      <ReservationReviewCard
        result={message.payload}
        onConfirm={() => onConfirm(message.payload, message.id)}
        onChangeTime={() => onChangeTime(message.payload)}
        loading={loading || message.payload?.confirming}
      />
    );
  }

  if (message.cardType === "reservation_done") {
    return <ReservationDoneCard result={message.payload} />;
  }

  return <AssistantReplyCard result={{ reply: message.text }} />;
}

function ReservationReviewCard({ result, onConfirm, onChangeTime, loading }) {
  return (
    <div style={styles.reviewCard}>
      <div>
        <div style={styles.resultEyebrow}>예약 검토</div>
        <h2 style={styles.resultTitle}>예약 가능 시간을 찾았어요.</h2>
      </div>

      <div style={styles.reviewDetails}>
        <InfoPill label="장비" value={result.equipment} />
        <InfoPill label="시간" value={result.timeLabel} />
        <InfoPill
          label="상태"
          value={result.confirmed ? "확정됨" : "예약 가능"}
          tone="success"
        />
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
        <button
          type="button"
          style={styles.primaryAction}
          onClick={onConfirm}
          disabled={loading || result.confirmed}
        >
          {result.confirmed ? "예약 확정됨" : loading ? "예약 처리 중..." : "예약 확정하기"}
        </button>
        <button type="button" style={styles.secondaryAction} onClick={onChangeTime}>
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
        {result.reservationId && <small>예약 ID #{result.reservationId}</small>}
      </div>
      <p style={styles.replyText}>{result.reply}</p>
    </div>
  );
}

function AssistantReplyCard({ result }) {
  return <p style={styles.replyText}>{result.reply}</p>;
}

function InfoPill({ label, value, tone }) {
  return (
    <div style={styles.infoPill}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={{ ...styles.infoValue, ...(tone === "success" ? styles.successText : {}) }}>{value}</strong>
    </div>
  );
}

function CalendarDock({
  open,
  onOpen,
  onClose,
  result,
  isNarrow,
  systemReservations,
  reservationLoading,
  auth,
}) {
  if (!open) {
    return (
      <div style={{ ...styles.dockRail, ...(isNarrow ? styles.dockRailNarrow : {}) }}>
        <button
          type="button"
          onClick={onOpen}
          title="캘린더 열기"
          style={styles.railTab}
        >
          <span style={styles.railArrow}>‹</span>
          <span style={styles.railLabel}>캘린더</span>
        </button>
      </div>
    );
  }

  return (
    <aside style={{ ...styles.calendarPanel, ...(isNarrow ? styles.calendarPanelNarrow : {}) }}>
      <button type="button" onClick={onClose} style={styles.panelClose} aria-label="캘린더 패널 접기">
        ›
      </button>

      <div style={styles.panelHeader}>
        <span style={styles.sectionKicker}>Context</span>
        <h2 style={styles.panelTitle}>캘린더</h2>
      </div>

      <SystemCalendarPanel
        result={result}
        reservations={systemReservations}
        loading={reservationLoading}
      />
      <GoogleCalendarPanel auth={auth} />
    </aside>
  );
}

function SystemCalendarPanel({ result, reservations, loading }) {
  const [equipment, setEquipment] = useState(result?.equipment || "SEM");
  const realEvents = useMemo(() => mapReservationsToMiniEvents(reservations), [reservations]);
  const reviewEvent = useMemo(() => buildPendingReviewEvent(result), [result]);

  useEffect(() => {
    if (result?.equipment && EQUIPMENT_CALENDAR_TABS.includes(result.equipment)) {
      setEquipment(result.equipment);
    }
  }, [result?.equipment]);

  const events = useMemo(() => {
    const combined = reviewEvent ? [reviewEvent, ...realEvents] : realEvents;
    return combined.filter((event) => event.equipment === equipment);
  }, [equipment, realEvents, reviewEvent]);

  return (
    <section style={styles.calendarSection}>
      <div style={styles.sectionHeader}>
        <div>
          <span style={styles.sectionKicker}>LabFlow</span>
          <h2 style={styles.sectionTitle}>시스템 캘린더</h2>
        </div>
        <span style={styles.syncPill}>{loading ? "동기화 중" : "실시간"}</span>
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

      <MiniWeekCalendar events={events} emptyLabel="이번 주 예약이 없습니다." />
    </section>
  );
}

function GoogleCalendarPanel({ auth }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const authConfig = useMemo(() => {
    const tokenType = auth?.token_type === "bearer" ? "Bearer" : auth?.token_type || "Bearer";
    return { headers: { Authorization: `${tokenType} ${auth?.access_token || ""}` } };
  }, [auth]);

  useEffect(() => {
    if (!auth?.access_token) return;

    let mounted = true;
    const range = getCurrentWorkWeekRange();

    async function loadGoogleCalendar() {
      setLoading(true);
      try {
        const status = await axios.get(`${API_BASE}/gcal/status`, authConfig);
        if (!mounted) return;
        setConnected(Boolean(status.data.connected));
        if (!status.data.connected) {
          setEvents([]);
          return;
        }

        const response = await axios.post(
          `${API_BASE}/gcal/freebusy`,
          { start: range.start.toISOString(), end: range.end.toISOString(), timeZone: "Asia/Seoul" },
          authConfig
        );
        if (!mounted) return;
        setEvents(mapGoogleBusyToMiniEvents(response.data.busy || []));
      } catch (err) {
        if (!mounted) return;
        setConnected(false);
        setEvents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadGoogleCalendar();
    return () => {
      mounted = false;
    };
  }, [auth?.access_token, authConfig]);

  return (
    <section style={styles.calendarSection}>
      <div style={styles.sectionHeader}>
        <div>
          <span style={styles.sectionKicker}>Personal</span>
          <h2 style={styles.sectionTitle}>사용자 Google 캘린더</h2>
        </div>
        <span style={{ ...styles.syncPill, ...(connected ? {} : styles.mutedPill) }}>
          {loading ? "확인 중" : connected ? "연동됨" : "비어 있음"}
        </span>
      </div>

      <MiniWeekCalendar
        events={events}
        emptyLabel={connected ? "표시할 개인 일정이 없습니다." : "Google Calendar 일정이 없습니다."}
      />
    </section>
  );
}

function MiniWeekCalendar({ events, emptyLabel }) {
  const normalized = useMemo(() => events.map(normalizeMiniEvent).filter(Boolean), [events]);

  return (
    <div style={styles.weekCalendar}>
      {WEEK_DAYS.map((day, index) => {
        const dayEvents = normalized.filter((event) => event.dayIndex === index);
        return (
          <div key={day} style={styles.weekColumn}>
            <div style={styles.weekDay}>{day}</div>
            <div style={styles.weekSlot}>
              {dayEvents.length > 0 ? (
                dayEvents.map((event) => (
                  <CalendarEvent key={`${event.time}-${event.title}-${event.id || ""}`} event={event} />
                ))
              ) : (
                <span style={styles.emptySlot}>{emptyLabel}</span>
              )}
            </div>
          </div>
        );
      })}
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
    slate: { backgroundColor: "#E2E8F0", color: "#334155", borderColor: "#CBD5E1" },
  };
  return tones[tone] || tones.blue;
}

function normalizeMiniEvent(event) {
  const rawDay = event.dayIndex ?? event.day;
  let dayIndex = rawDay;
  if (typeof rawDay === "string") {
    dayIndex = WEEK_DAYS.findIndex((day) => day.toLowerCase() === rawDay.toLowerCase());
  }
  if (dayIndex < 0 || dayIndex > 4) return null;
  return { ...event, dayIndex };
}

function buildReviewResult(prompt) {
  const parsed = parseReservationPrompt(prompt);
  const start = parsed?.start || nextDayAt(14, 0);
  const end = parsed?.end || addMinutes(start, 60);
  const equipment = parsed?.equipment || "SEM";

  return {
    type: "reservation_review",
    prompt,
    normalizedPrompt: buildNormalizedReservationPrompt(equipment, start, end),
    equipment,
    timeLabel: `${parsed?.dateLabel || formatMonthDay(start)} ${formatClock(start)} - ${formatClock(end)}`,
    startTime: start,
    endTime: end,
    checklist: [
      "안전교육 인증 완료",
      "노쇼 제한 없음",
      "장비 시간 충돌 없음",
      "Google Calendar 충돌 없음",
    ],
  };
}

function buildPendingReviewEvent(result) {
  if (!result || result.type !== "reservation_review") return null;
  const start = result.startTime ? new Date(result.startTime) : nextDayAt(14, 0);
  const dayIndex = getWorkdayIndex(start);
  if (dayIndex < 0 || dayIndex > 4) return null;

  return {
    dayIndex,
    time: formatClock(start),
    title: "검토 중",
    tone: "blue",
    equipment: result.equipment,
  };
}

function mapReservationsToMiniEvents(reservations) {
  return (reservations || [])
    .map((reservation) => {
      const start = new Date(reservation.start_time);
      const dayIndex = getWorkdayIndex(start);
      if (dayIndex < 0 || dayIndex > 4) return null;
      const equipment = EQUIP_NAME_MAP[reservation.equipment_id] || `Equipment #${reservation.equipment_id}`;
      return {
        id: reservation.id,
        dayIndex,
        time: formatTime(start),
        title: reservation.purpose || reservation.status || "예약",
        tone: equipmentTone(equipment),
        equipment,
      };
    })
    .filter(Boolean);
}

function mapGoogleBusyToMiniEvents(busyBlocks) {
  return (busyBlocks || [])
    .map((block, index) => {
      const start = new Date(block.start);
      const dayIndex = getWorkdayIndex(start);
      if (dayIndex < 0 || dayIndex > 4) return null;
      return {
        id: `google-${index}`,
        dayIndex,
        time: formatTime(start),
        title: "개인 일정",
        tone: "slate",
      };
    })
    .filter(Boolean);
}

function equipmentTone(equipment) {
  if (equipment === "SEM") return "green";
  if (equipment === "XRD") return "blue";
  if (equipment === "AFM") return "purple";
  if (equipment === "E-beam") return "amber";
  return "slate";
}

function getWorkdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function formatTime(date) {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getCurrentWorkWeekRange() {
  const now = new Date();
  const monday = new Date(now);
  const dayIndex = getWorkdayIndex(now);
  monday.setDate(now.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return { start: monday, end: friday };
}

function parseReservationPrompt(prompt) {
  const equipment = detectReservationEquipment(prompt);
  const dateInfo = parseReservationDate(prompt);
  const startTime = parseReservationStartTime(prompt);
  if (!equipment || !dateInfo || !startTime) return null;

  const start = new Date(dateInfo.date);
  start.setHours(startTime.hour, startTime.minute, 0, 0);

  const explicitEnd = parseReservationEndTime(prompt, startTime);
  const durationMinutes = parseReservationDurationMinutes(prompt);
  let end;
  if (explicitEnd) {
    end = new Date(dateInfo.date);
    end.setHours(explicitEnd.hour, explicitEnd.minute, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
  } else {
    end = addMinutes(start, durationMinutes || 60);
  }

  return {
    equipment,
    dateLabel: dateInfo.label,
    start,
    end,
  };
}

function detectReservationEquipment(text) {
  const lower = text.toLowerCase();
  const furnaceMatch = lower.match(/(?:furnace|퍼니스|전기로)\s*#?\s*([1-4])/);
  if (furnaceMatch) return `Furnace #${furnaceMatch[1]}`;
  if (lower.includes("e-beam") || lower.includes("ebeam") || lower.includes("e beam") || lower.includes("이빔")) {
    return "E-beam";
  }
  if (lower.includes("sem") || lower.includes("에스이엠")) return "SEM";
  if (lower.includes("xrd") || lower.includes("엑스알디")) return "XRD";
  if (lower.includes("afm") || lower.includes("에이에프엠")) return "AFM";
  return "";
}

function parseReservationDate(text) {
  const now = new Date();
  if (text.includes("내일")) {
    const date = new Date(now);
    date.setDate(now.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return { date, label: "내일" };
  }
  if (text.includes("오늘")) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return { date, label: "오늘" };
  }

  const dateMatch = text.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1] || now.getFullYear());
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return { date, label: `${month}월 ${day}일` };
}

function parseReservationStartTime(text) {
  const meridiemMatch = text.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (meridiemMatch) {
    return normalizeHour(meridiemMatch[2], meridiemMatch[3], meridiemMatch[1]);
  }

  const clockMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (clockMatch) return normalizeHour(clockMatch[1], clockMatch[2]);

  const hourMatch = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (hourMatch) return normalizeHour(hourMatch[1], hourMatch[2]);

  return null;
}

function parseReservationEndTime(text, startTime) {
  const endMatch = text.match(/(?:부터|~|-)\s*(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*까지/);
  if (!endMatch) return null;

  const end = normalizeHour(endMatch[2], endMatch[3], endMatch[1]);
  if (!endMatch[1] && startTime.hour >= 12 && end.hour <= 12 && end.hour <= startTime.hour) {
    end.hour += 12;
  }
  return end;
}

function parseReservationDurationMinutes(text) {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*시간(?:\s*동안)?/);
  const minuteMatch = text.match(/(\d+)\s*분/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = Math.round(hours * 60 + minutes);
  return total > 0 ? total : null;
}

function normalizeHour(hourText, minuteText, meridiem) {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;
  return { hour, minute };
}

function buildNormalizedReservationPrompt(equipment, start, end) {
  const duration = Math.max(30, Math.round((end - start) / 60000));
  return `${formatMonthDay(start)} ${formatKoreanTime(start)}에 ${equipment} ${formatDurationText(duration)} 예약해줘`;
}

function nextDayAt(hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatKoreanTime(date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const meridiem = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 || 12;
  return `${meridiem} ${hour12}시${minute ? ` ${minute}분` : ""}`;
}

function formatDurationText(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}시간 ${rest}분`;
  if (hours) return `${hours}시간`;
  return `${rest}분`;
}

function isDemoReservationPrompt(text) {
  return text.includes("예약") && Boolean(parseReservationPrompt(text));
}

function lastReservationPayload(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.cardType === "reservation_review" && message.payload) return message.payload;
    if (message.cardType === "reservation_done" && message.payload) return message.payload;
  }
  return null;
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
    display: "block",
    minHeight: "calc(100vh - 60px)",
    width: "100%",
  },
  shellNarrow: {
    display: "block",
  },
  mainStage: {
    display: "flex",
    justifyContent: "center",
    minWidth: 0,
    padding: "84px clamp(24px, 5vw, 72px) 48px",
  },
  mainStageChat: {
    alignItems: "stretch",
    padding: "24px clamp(24px, 5vw, 72px) 28px",
  },
  mainStageNarrow: {
    padding: "28px 18px 28px",
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
  promptShellCompact: {
    maxWidth: "none",
    margin: 0,
    boxShadow: "none",
    borderColor: "#DBEAFE",
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
    backgroundColor: "transparent",
  },
  sendButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    border: "none",
    borderRadius: 10,
    backgroundColor: "#1E3A8A",
    color: "#fff",
    cursor: "pointer",
    fontSize: 0,
    lineHeight: 1,
    fontWeight: 900,
    flexShrink: 0,
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
  chatRoom: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr) auto auto",
    gap: 14,
    width: "100%",
    maxWidth: 980,
    minHeight: "calc(100vh - 132px)",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: "16px 18px",
    border: "1px solid #DBEAFE",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 10px 24px rgba(15,23,42,0.07)",
  },
  chatKicker: {
    display: "block",
    color: "#64748B",
    fontSize: 12,
    fontWeight: 900,
  },
  chatTitle: {
    margin: "4px 0 0",
    color: "#0F172A",
    fontSize: 20,
    lineHeight: 1.2,
  },
  chatStatus: {
    padding: "6px 9px",
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  messageList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 16px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.72)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.80)",
  },
  messageRowAssistant: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  messageRowUser: {
    display: "flex",
    justifyContent: "flex-end",
  },
  assistantAvatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#1E3A8A",
    color: "#fff",
    fontSize: 11,
    fontWeight: 900,
    flexShrink: 0,
  },
  messageBubble: {
    maxWidth: "84%",
    padding: "11px 14px",
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  userBubble: {
    backgroundColor: "#1E3A8A",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(30,58,138,0.18)",
  },
  assistantBubble: {
    backgroundColor: "#fff",
    color: "#1E293B",
    border: "1px solid #E2E8F0",
    boxShadow: "0 8px 18px rgba(15,23,42,0.07)",
  },
  assistantCardBubble: {
    maxWidth: "min(840px, 94%)",
    padding: 10,
    backgroundColor: "#F8FAFC",
  },
  messageText: {
    margin: "0 0 10px",
    color: "#475569",
    fontWeight: 700,
  },
  loadingText: {
    alignSelf: "center",
    color: "#64748B",
    fontSize: 13,
    fontWeight: 800,
  },
  typingBubble: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    width: 68,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#93C5FD",
  },
  chatWarning: {
    padding: "9px 12px",
    border: "1px solid #FDE68A",
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    color: "#92400E",
    fontSize: 13,
  },
  reviewCard: {
    padding: 18,
    border: "1px solid #BFDBFE",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 10px 26px rgba(30,58,138,0.12)",
  },
  resultEyebrow: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: 900,
  },
  resultTitle: {
    margin: "4px 0 16px",
    color: "#0F172A",
    fontSize: 20,
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
    marginRight: 6,
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
    margin: 0,
    color: "#334155",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  },
  dockRail: {
    position: "fixed",
    top: 112,
    right: 0,
    width: 52,
    margin: 0,
    zIndex: 35,
  },
  dockRailNarrow: {
    position: "fixed",
    right: 0,
    top: 92,
  },
  railTab: {
    width: 52,
    height: 146,
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
    textOrientation: "upright",
    transform: "none",
    fontSize: 12,
  },
  calendarPanel: {
    position: "fixed",
    top: 82,
    right: 0,
    display: "grid",
    gap: 14,
    width: 392,
    maxHeight: "calc(100vh - 104px)",
    overflowY: "auto",
    margin: 0,
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
    width: "min(392px, calc(100vw - 28px))",
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
  panelHeader: {
    paddingRight: 36,
  },
  panelTitle: {
    margin: "3px 0 0",
    color: "#0F172A",
    fontSize: 22,
    lineHeight: 1.2,
  },
  calendarSection: {
    padding: 14,
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    backgroundColor: "#fff",
    boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
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
    fontSize: 18,
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
  mutedPill: {
    backgroundColor: "#F1F5F9",
    color: "#64748B",
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
  emptySlot: {
    alignSelf: "center",
    justifySelf: "center",
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: 800,
    textAlign: "center",
    lineHeight: 1.35,
  },
};
