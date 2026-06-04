# LabFlow gijun branch focused layout-only handoff

Branch: `gijun`

## Scope

Fix only the following focused UI issues. Do not modify the left sidebar menu design except the chat-history secondary text visibility. Do not rework the calendar contents or other features in this pass.

## User feedback summary

1. The whole main screen feels shifted to the right.
2. The right calendar dock should not push the center content away when it opens; there appears to be enough space for it to open as an overlay or fixed side panel.
3. The left sidebar itself is fine.
4. In chat history, secondary info such as `메시지 8개` can be hidden or made much lighter.
5. The right collapsible tab label currently reads from bottom to top. Change it so the label reads from top to bottom.

---

## 1. Fix main content right-shift

### Current issue

The Home hero/prompt area appears visually shifted to the right. The central objects are not perceived as centered.

### Required change

- Center the Home hero, prompt input, and chat content within the actual available main area.
- Do not center against the full viewport if that causes visual imbalance with the left sidebar.
- Do not make the left sidebar responsible for this fix; the sidebar layout is acceptable.
- Review the main layout grid/flex settings in `App.jsx` and the Home/CommandCenter layout styles.

### Acceptance criteria

- On the initial Home screen, the title and prompt input visually sit in the center of the main workspace.
- The screen no longer feels globally shifted to the right.
- The fix still works when the viewport is resized.

---

## 2. Right dock should not push the center content

### Current issue

When the right collapsible calendar dock opens, the center content should not move away unnecessarily. There is enough visual room for the dock to open without forcing the main Home content to re-center or shift.

### Required change

- Make the right dock behave like a fixed/overlay side panel or otherwise remove it from the layout calculation that controls center alignment.
- Opening the dock should not resize or push the main content area.
- Closing/opening the dock should feel like a contextual overlay on the right side.
- Keep the dock attached to the right edge.

### Acceptance criteria

- Opening the right dock does not shift the Home title/prompt/chat area.
- Closing the right dock also does not cause a visible reflow of the central content.
- The dock remains usable and visually attached to the right side.

---

## 3. Chat history secondary text

### Current issue

Secondary text in the chat history, such as `메시지 8개`, adds visual noise.

### Required change

- Either hide the secondary message-count text or make it much lighter/subtler.
- Keep the room title visible.
- Keep the `+ 새 대화` button and room list.
- Do not redesign the main sidebar navigation.

### Acceptance criteria

- Chat history looks calmer.
- Message-count text no longer draws attention.
- Left sidebar navigation remains unchanged.

---

## 4. Right collapsed tab label direction

### Current issue

The collapsed right tab label currently reads from bottom to top.

### Required change

- Change the vertical label direction so it reads from top to bottom.
- The Korean label `캘린더` should visually start at the top and continue downward.
- Adjust CSS `writing-mode`, `text-orientation`, transform/rotate usage, or markup order as needed.
- Keep the arrow direction intuitive:
  - closed state: arrow indicates opening into the screen
  - open state: arrow indicates closing back to the right edge

### Suggested implementation note

If the current implementation uses `writing-mode: vertical-rl` or a rotation transform that causes bottom-to-top reading, switch to a top-to-bottom layout. Possible approaches:

- Use `writing-mode: vertical-rl` with adjusted character order/transform only if it reads correctly.
- Or render each Korean character in a vertical flex column in the order `캘`, `린`, `더`.
- Avoid rotating the entire word 180 degrees.

### Acceptance criteria

- The collapsed tab label reads top-to-bottom.
- The label no longer appears upside-down or bottom-to-top.
- The tab remains compact and attached to the right side.

---

## Final instruction

Only implement these four focused changes in this pass:

1. main content centering/right-shift fix
2. right dock open state not pushing center content
3. chat history secondary text made subtle or hidden
4. right collapsed tab label direction changed to top-to-bottom

Do not rework unrelated sidebar menu styling, calendar data, reservation logic, or the broader chat architecture in this pass.
