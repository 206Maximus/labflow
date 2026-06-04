# LabFlow gijun branch follow-up UI handoff

Branch: `gijun`

## Purpose

This is the next Codex handoff for visible UI corrections. Handle these items before continuing larger feature polish.

## Latest user feedback

1. The right collapsible sidebar is reversed.
2. Objects placed in the center are not actually centered on the screen.
3. The calendar should display only 오전 9시 to 오후 6시.
4. The left sidebar menu still shows a visible border after clicking.
5. The prompt input send/enter arrow is too long and visually unbalanced.

## Priority order

1. Fix the right collapsible sidebar direction.
2. Fix the left sidebar clicked/active/focus border issue.
3. Fix central layout alignment.
4. Limit the calendar visible time range to 09:00-18:00.
5. Adjust the prompt input send arrow size/proportion.

---

## 1. Right collapsible sidebar direction

### Current issue

The right collapsible calendar dock looks reversed. It should feel attached to the right side of the app and open inward from the right edge.

### Required change

- Keep only one vertical collapsed tab.
- Anchor the collapsed tab to the right edge of the content/viewport.
- In collapsed state, the tab should visually indicate that it opens leftward into the screen.
- In opened state, the close button should visually indicate that it closes rightward back to the edge.
- Avoid a floating tab that looks detached from the right edge.
- Avoid a second duplicate vertical tab.

### Acceptance criteria

- Only one right-side collapsed tab is visible.
- The dock opens from the right edge into the page.
- The arrow direction matches the open/close behavior.
- The dock no longer feels reversed.

---

## 2. Left sidebar active/click border issue

### Current issue

The left sidebar menu items still show a visible border after clicking.

### Required change

- Remove visible borders from menu items in all mouse interaction states: default, hover, selected, and focus after mouse click.
- Keep selected state using only background color, text color, font weight, and icon background/color.
- Avoid layout shift when active state changes.
- Preserve keyboard accessibility with a subtle `:focus-visible` style only.

### Suggested implementation

- Do not use visible `borderColor` in `menuItemActive`.
- If inline styles are used, set menu item border to `1px solid transparent` permanently.
- Override mouse-click focus rings if needed.
- If using CSS, use `:focus-visible` for keyboard focus and suppress `:focus:not(:focus-visible)`.

### Acceptance criteria

- Clicking a sidebar menu item does not create a visible black or blue border.
- The selected menu item remains visually selected through background and text/icon color.
- Keyboard tab focus is still visible through `focus-visible` only.

---

## 3. Center layout alignment

### Current issue

The central Home/chat objects are not visually centered. They appear shifted within the page.

### Required change

- The Home hero, prompt input, result/chat area, and main center objects must be centered within the usable main content area.
- The calculation should account for the left sidebar, top bar, right dock collapsed/open width, and content padding/gap.
- The page should not feel like objects are centered against the full viewport while ignoring the left sidebar.

### Suggested implementation

- Re-check `App.jsx` workspace grid and `CommandCenter.jsx` shell/mainStage styles.
- The main content area should own the centering, not the full viewport.
- Avoid unnecessary `auto` columns or right-side dock width affecting the center unexpectedly.
- Use a max-width inner container with balanced left/right padding.

### Acceptance criteria

- Initial Home prompt area is visually centered.
- Chat thread and input are visually centered after submitting a prompt.
- The layout still works on narrower screens.

---

## 4. Calendar time range: only 09:00-18:00

### Current issue

The calendar currently shows a wider time range than needed.

### Required change

- Main calendar should display only 오전 9시 to 오후 6시.
- Use 09:00 as the first visible time slot and 18:00 as the end boundary.
- This applies to FullCalendar week/day time-grid views.
- Mini calendars in the right dock can stay compact, but if they show time slots, align them with 09:00-18:00 as well.

### Suggested implementation

For `FullCalendar`, set `slotMinTime` to `09:00:00` and `slotMaxTime` to `18:00:00`.

Also keep `businessHours` aligned with Monday-Friday, 09:00-18:00.

### Acceptance criteria

- Week/day calendar starts at 오전 9시.
- Week/day calendar ends at 오후 6시.
- No 오전 7시, 오전 8시, 오후 7시, 오후 8시 slots are visible.

---

## 5. Prompt input send arrow proportion

### Current issue

The arrow icon in the prompt input send/enter button is too long and visually unbalanced.

### Required change

- Reduce the arrow visual size.
- Make the send button proportion feel balanced with the input field height.
- The button should look like a polished send button, not like an oversized stretched arrow.

### Suggested implementation

- Prefer replacing the text arrow with a small SVG icon.
- If keeping a text arrow, reduce `fontSize`, `lineHeight`, and possibly button size.
- Suggested visual target:
  - button width/height around 40px
  - border radius around 10px
  - icon size around 18px
  - centered vertically and horizontally

### Acceptance criteria

- The send arrow no longer looks vertically too long.
- The send button feels balanced with the prompt input.
- The button remains easy to click.

---

## Final note for Codex

Prioritize these visible UI correctness issues before continuing larger feature work. The right dock direction, sidebar border, true centering, calendar 09:00-18:00 range, and send-arrow proportion are small but important polish issues.
