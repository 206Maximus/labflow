# LabFlow gijun branch reservation chat fix handoff

Branch: `gijun`

## Scope

Fix the reservation chat UX issues observed after testing the chat reservation flow. Keep the current overall layout and right dock work intact. Focus only on the three issues below.

## User feedback summary

1. Chat room titles are too long. They should be shortened to simple intent titles such as `SEM 예약`. Remove dates/times from the visible room title.
2. The central chat panel is too narrow even though there is a lot of empty space. Use the available center space more effectively.
3. Reservation parsing is still wrong. The user requested a July reservation, but the reservation review card shows the wrong time/date. The assistant appears to misunderstand or drop the explicit date.

---

## 1. Shorten chat room titles

### Current issue

The selected chat room title currently uses a long prompt-like title, for example:

`7월 3일 오후 2시부터 2시간동안 SE...`

This is too long for both the left chat history and the chat header.

### Required change

Generate concise room titles from reservation intent.

Examples:

- `내일 오후 2시에 SEM 1시간 예약해줘` -> `SEM 예약`
- `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘` -> `SEM 예약`
- `XRD 예약 가능한 시간 찾아줘` -> `XRD 예약`
- unknown equipment reservation request -> `장비 예약`
- non-reservation chat -> use a short truncated title, but keep it much shorter than the full prompt

### Rules

- Remove dates from visible room titles.
- Remove times from visible room titles.
- Prefer `{equipmentName} 예약` when equipment is detected.
- Keep title length short, ideally under 12 Korean characters or around 16 visible characters.
- Apply the same title style in:
  - left sidebar chat history
  - chat header title

### Suggested implementation

Create a helper such as:

```js
function buildRoomTitleFromPrompt(prompt) {
  const equipment = detectEquipment(prompt);
  if (equipment) return `${equipment} 예약`;
  if (prompt.includes("예약")) return "장비 예약";
  return truncatePrompt(prompt, 16);
}
```

Equipment detection should at least handle:

- SEM
- XRD
- AFM
- E-beam
- Furnace #1, Furnace #2, Furnace #3, Furnace #4 if present

### Acceptance criteria

- A prompt containing `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘` creates/displays the room title `SEM 예약`.
- Chat history no longer shows long date/time prompt titles.
- Chat header no longer shows long date/time prompt titles.

---

## 2. Widen the central chat panel

### Current issue

The central chat area is too narrow, leaving a lot of unused empty space between the left sidebar and the right dock/panel.

### Required change

- Increase the maximum width of the central chat panel.
- The chat thread card, chat header, reservation review card container, and bottom input should share a wider consistent width.
- Use the available center workspace more efficiently.
- Do not let the right dock overlay push or shrink the chat panel.

### Suggested sizing

Current chat width appears too narrow. Use a wider target such as:

- chat container max width: about `760px` to `880px`
- message area width: same as chat container
- reservation review card should not feel squeezed
- bottom prompt input should align with the chat thread width

Use responsive constraints so it still works on smaller screens:

```js
width: "min(880px, calc(100vw - 420px))"
```

or an equivalent layout-safe approach.

### Acceptance criteria

- The central chat panel is visibly wider than now.
- Reservation review card has more breathing room.
- The bottom input aligns with the wider chat panel.
- The layout still does not collide with the left sidebar or right calendar dock.

---

## 3. Fix reservation date/time parsing for explicit July requests

### Current issue

The user requested:

`7월 3일 오후 2시부터 2시간동안 SEM 예약해줘`

But the reservation review card shows:

`내일 14:00 - 15:00`

This is wrong. The explicit date and duration were ignored or overwritten by the demo reservation logic.

### Required change

- Explicit date/time/duration in the user prompt must be preserved.
- Do not fall back to the old demo result `내일 14:00 - 15:00` when the user gives a specific date.
- For `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘`, the review card should show:
  - equipment: `SEM`
  - date/time label: `7월 3일 14:00 - 16:00`
  - duration: 2 hours
- The actual reservation payload sent to the backend should match the parsed date/time.

### Key suspected cause

There may still be demo logic that detects `SEM` + `예약` + `오후 2시` and then builds a hard-coded review result with:

`내일 14:00 - 15:00`

This must be replaced or bypassed when explicit date/duration is present.

### Required parsing behavior

Handle at least these Korean prompt patterns:

- `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘`
- `7월 3일 오후 2시에 SEM 1시간 예약해줘`
- `7월 3일 14시부터 16시까지 SEM 예약해줘`
- `내일 오후 2시에 SEM 1시간 예약해줘`

### Date interpretation

- If month/day are explicit, use that month/day in the current year unless the date has already passed and the app has a known policy to use next year.
- Since this is a demo app, using current year is acceptable, but keep it consistent.
- If the prompt says `내일`, compute tomorrow based on the current local date.
- Use Korean local time expectations for 오전/오후 parsing.

### Duration interpretation

- `2시간동안`, `2시간 동안`, `2시간` should result in a two-hour reservation.
- If start is 14:00 and duration is 2 hours, end should be 16:00.
- If an explicit end time is provided, use that end time.
- If duration is missing, default may remain 1 hour.

### Reservation review card

The review card must display the parsed time, not the hard-coded demo time.

For the tested prompt, expected display:

`7월 3일 14:00 - 16:00`

Not:

`내일 14:00 - 15:00`

### Backend payload

Ensure the backend reservation payload uses the same parsed start/end times shown in the card.

### Acceptance criteria

- Sending `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘` shows `7월 3일 14:00 - 16:00` in the review card.
- Confirming the reservation creates the reservation for July 3, 14:00-16:00, not tomorrow 14:00-15:00.
- The left chat history and chat header title show `SEM 예약`.
- No hard-coded `내일 14:00 - 15:00` appears unless the user actually asks for that time.

---

## Final instruction

Only fix these three items in this pass:

1. concise room title generation such as `SEM 예약`
2. wider central chat panel
3. correct parsing and display of explicit date/time/duration reservation prompts, especially July 3 SEM 14:00-16:00

Do not redesign the left sidebar menu, right calendar dock, or main calendar in this pass.
