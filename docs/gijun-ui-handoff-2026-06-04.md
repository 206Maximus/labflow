# LabFlow gijun branch UI handoff

Branch: `gijun`

## Context

The current Command Center is card/result based. The next goal is to make the Home experience feel closer to ChatGPT / NotebookLM: once the user submits a prompt, the screen should become a chat room.

Reservation review cards should appear inside assistant messages instead of appearing as separate result blocks under the prompt.

## Priority order

1. Convert Home Command Center to chat-room layout.
2. Add minimal room API based chat history to the left sidebar.
3. Simplify the right calendar dock into one collapsible tab and show both calendars together.
4. Connect the system mini calendar to real reservation data if possible.
5. Improve the main FullCalendar visual style.
6. Remove the active border issue from the left sidebar menu.

---

## 1. Home / Command Center: convert to chat-room flow

### Current issue

- The prompt has suggestion cards below it.
- After submitting a reservation prompt, the result appears as a separate card below the prompt.
- This feels like a command demo UI, not a conversation UI.

### Required change

- Remove the prompt-bottom suggestion cards from the main Home view.
- Keep the initial hero/prompt view if there is no active conversation.
- Once the user sends a prompt, switch to a chat-room layout.
- Display user messages and assistant messages as chat bubbles.
- Reuse existing reservation review/done cards, but render them inside assistant message bubbles.
- Buttons such as `예약 확정하기` and `시간 바꾸기` should remain clickable inside the assistant response card.
- Do not completely delete the existing reservation review card logic unless necessary; refactor it into a message content component.

### Suggested implementation

- Replace the single `commandResult` rendering flow with a `messages` array.
- Message shape can be simple:

```js
{
  id: string,
  role: "user" | "assistant",
  text?: string,
  cardType?: "reservation_review" | "reservation_done" | "assistant_reply",
  payload?: object,
}
```

- When the user submits a prompt:
  - append a user message
  - switch the Home view into chat mode
  - append an assistant message
  - if the result is a reservation review, render the existing `ReservationReviewCard` inside the assistant message
- Move the prompt input to the bottom of the chat layout after chat mode starts, similar to ChatGPT / NotebookLM.

### Acceptance criteria

- No suggestion cards appear under the initial prompt.
- After sending `내일 오후 2시에 SEM 1시간 예약해줘`, the UI changes into a chat thread.
- The assistant message contains the reservation review card.
- Confirm/change-time buttons are inside the assistant message area.
- The result should not appear as a separate block detached from the conversation.

---

## 2. Chat history in left sidebar

### Required change

Add a ChatGPT-like chat history area to the lower part of the existing left sidebar.

### Confirmed scope

Use the existing room API as the base, but keep the implementation minimal.

This pass does not need:

- perfect message history restoration
- editable chat titles
- automatic title generation through AI
- delete/rename/archive conversations
- full ChatGPT-level persistence UX

### Required behavior

- Fetch existing rooms through `/rooms/` using the current user nickname.
- Show rooms in the lower sidebar under a `대화 기록` heading.
- Add a `+ 새 대화` button.
- Clicking `+ 새 대화` creates a new room through `/rooms/`.
- Clicking a room switches the active room.
- The selected room ID should be passed to `/chat/` when sending a prompt.
- The visible chat thread should correspond to the active room.
- For this pass, message restoration can be minimal:
  - If a message-history endpoint already exists, use it lightly.
  - If not, keep messages in frontend state during the current browser session.
- Conversation title can be simple:
  - default title: `새 대화`
  - if possible, after the first user prompt, show a shortened version of that prompt as the room label.
  - Do not spend time implementing title editing or AI title generation.

### Architecture note

Currently, `CommandCenter` owns room setup internally. For sidebar chat history, room state should be lifted to `App.jsx` or a small shared hook/context.

Recommended minimal structure:

- `AppMain` owns:
  - `rooms`
  - `activeRoom`
  - `roomMessagesById`
  - `createNewRoom()`
  - `selectRoom(room)`
- `Sidebar` receives:
  - `rooms`
  - `activeRoomId`
  - `onCreateRoom`
  - `onSelectRoom`
- `CommandCenter` receives:
  - `activeRoom`
  - `messages`
  - `setMessages` or message handlers

### UI placement

The sidebar should keep the existing main menu at the top:

- 홈
- 장비 현황
- 캘린더
- 체크인/아웃
- 사용 로그

Below that, add:

- 대화 기록
- `+ 새 대화`
- room list

### Acceptance criteria

- Existing sidebar navigation still works.
- Chat history appears at the bottom of the sidebar.
- A new chat can be created.
- Existing rooms can be selected.
- Sending a message uses the selected room.
- The implementation is clean and stable without overbuilding the history feature.

---

## 3. Main Calendar UI polish

### Current issue

The FullCalendar UI works, but looks too raw/default and visually rough.

### Required change

- Keep FullCalendar.
- Improve visual design of the weekly calendar.
- Make toolbar buttons, date headers, time grid, event cards, and legend/filter bar match the LabFlow visual style.
- Preserve month/week/day controls.
- Improve readability of event cards: equipment, purpose, and status should be visually clear.
- The UI should feel less like a default library component and more like a polished service screen.

### Suggested implementation

- Add a dedicated calendar stylesheet if easier than inline styles, for example `frontend/src/components/Calendar.css`.
- Give the calendar wrapper a polished card surface.
- Style `.fc-toolbar`, `.fc-button`, `.fc-col-header-cell`, `.fc-timegrid-slot`, `.fc-event`, and `.fc-day-today`.
- Reduce harsh borders and use softer grid lines.
- Make active toolbar buttons match the LabFlow navy tone.
- Keep current event click modal behavior.

### Acceptance criteria

- Calendar still loads real reservation data from `/reservations/`.
- Equipment filters still work.
- Event click modal still works.
- The week view looks cleaner and less default.

---

## 4. Right collapsible calendar dock

### Current issue

- There are two collapsed tabs: System and Google.
- There are also System/Google selector buttons inside the opened panel.
- System and Google are shown as if mutually selectable, but the desired behavior is to show both together.
- System and Google calendar data are not properly connected.
- Google calendar currently uses a list UI instead of the same mini calendar UI.

### Required change

- Remove System/Google tab selection.
- Keep only one collapsible dock tab.
- When opened, show both calendars at the same time:
  1. System Calendar
  2. User Google Calendar
- Use the same Mon~Fri mini week calendar UI for both.
- Remove dimmed inactive calendar behavior.
- Remove duplicated rail tab; keep only one tab.
- System calendar should be connected to actual reservation data if possible.
- Google calendar should use real Google Calendar data if available. If not available, show an empty but polished calendar state, not fake demo data.

### Suggested implementation

- Remove or simplify:
  - `CALENDAR_TABS`
  - `activeCalendarTab`
  - `onSelectTab`
  - `dimmed`
  - `panelTabs`
- `CalendarDock` collapsed state should render one vertical tab only.
- Opened `CalendarDock` should render:

```jsx
<SystemCalendarPanel result={result} />
<GoogleCalendarPanel />
```

- Convert `GoogleCalendarPanel` from list UI to the same `MiniWeekCalendar` UI.
- `MiniWeekCalendar` should support both numeric day indices and normalized event objects.
- If real Google calendar events are not available yet, render a friendly empty state inside the mini calendar section.

### Acceptance criteria

- Only one vertical dock tab is visible when collapsed.
- No System/Google selector appears at the top of the opened panel.
- Both calendars are visible together.
- Both use the same Mon~Fri mini week calendar style.
- System calendar reflects reservation data if the data is available.

---

## 5. Sidebar active border issue

### Current issue

After clicking a left sidebar menu item, a border appears around the active menu item.

### Required change

- Remove the visible active border.
- Keep selected state using background color, text color, and icon color only.
- Check both active style and browser focus outline.
- Prefer a subtle `:focus-visible` style for keyboard accessibility only.

### Suggested implementation

- In the sidebar menu item active style, do not set a visible `borderColor`.
- Keep `border: 1px solid transparent` to avoid layout shift.
- Add `outline: none` only if necessary.
- If using CSS, define `button:focus-visible` separately instead of showing focus on mouse click.

### Acceptance criteria

- Clicking a menu item does not create a new visible border.
- Active menu still feels selected.
- Keyboard focus remains accessible.

---

## Non-goals for this pass

- Full ChatGPT-grade message history restoration.
- Editable conversation titles.
- AI-generated room titles.
- Calendar drag/drop editing.
- Complex Google Calendar two-way sync from the dock.
- Major backend schema changes unless already necessary.

## Final UX target

The user should experience the Home page as an AI reservation chat room:

1. They type a natural language reservation request.
2. The screen becomes a conversation thread.
3. The assistant replies with a reservation review card inside the chat.
4. The right calendar dock shows system and Google calendars together.
5. The left sidebar keeps a simple room-based chat history.
