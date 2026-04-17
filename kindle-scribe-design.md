# Kindle Scribe Design Brief — Dungeon Roguelike

## Device Constraints

| Constraint | Value | Design Response |
|---|---|---|
| Display type | E-ink (11″, 300 PPI) | Black/white only; `background(255)` every frame clears ghosting |
| Refresh rate | ~500 ms full, ~100 ms partial | `noLoop()` + `redraw()` — only redraw on player action |
| CSS viewport | ~930 × 1236 px portrait (11″ model at ~300 PPI, Silk DPR ≈ 2) | `pixelDensity(1)` keeps rendering 1:1 with CSS pixels; no subpixel blur. Layout is fully dynamic via `windowWidth/windowHeight` — adapts to any reported viewport. |
| Input | EMR stylus (pen pointer) + finger touch | Tap-to-move; no buttons that could be clipped off-screen |
| Browser | Kindle Silk (Chromium-based) | Standard Pointer / Touch Events supported; no alert() modals |
| Keyboard | Optional physical cover | Arrow keys + WASD (orthogonal) + Q/E/Z/C (diagonal) |

---

## Control Scheme — Tap Adjacent Cell to Move

The previous D-pad button layout was drawn at a fixed Y offset that fell below the visible viewport on the Kindle Scribe's portrait aspect ratio, making controls invisible. The replacement interaction model:

1. **Valid move hints** — At the start of every turn, each of the up to eight adjacent floor cells (orthogonal + diagonal) is outlined with a bold border. The player can only tap marked cells.
2. **Tap / stylus press** — `pointerdown` listener on the canvas is the primary Kindle path; `mousePressed()` remains as p5 fallback. Coordinates are converted to grid column/row and matched to valid move hints.
3. **Touch fallback** — `touchStarted()` mirrors the same logic for fingertip input.
4. **Keyboard fallback** — `keyPressed()` handles Arrow keys + WASD (orthogonal) and Q/E/Z/C (diagonal). The canvas carries `tabindex="0"` so it is focusable without a pointing device.

---

## Kindle Findings (Observed + Root Cause)

### What was observed on device

- Top bar and maze were visible.
- Entities (player, enemy, gold, stairs) were not visible.
- Bottom status bar was also missing.
- Android phone rendered correctly, so issue was Kindle-browser specific.

### Root cause identified

- Kindle reported: `ERR:ctx.roudRect is not a function`.
- The issue was triggered by rounded-corner `rect(...)` calls in p5, which route to the canvas `roundRect` API path.
- On Kindle Silk, that path is unavailable/buggy, causing a mid-frame exception.
- When the exception happened before status rendering, both entities and bottom bar appeared to disappear.

### Fix strategy applied

- Removed all rounded-corner rectangle calls from active graphics code (no `rect(..., radius)`).
- Kept defensive mid-frame `try/catch`; if any render error occurs, app switches to compatibility entities and keeps status visible.
- Status bar now left-prioritizes error text (`ERR:...`) so clipping does not hide diagnostics.
- Added explicit compatibility marker and entity counts in status text for live diagnostics.
- Added direct `pointerdown` input listener to improve stylus interaction reliability on Silk.
- Current verified build with this fix: `Kindle Build v1.6.2`.

---

## Known Silk Incompatibilities

Use this as a guardrail for future rendering and input changes.

- **Canvas rounded rectangles via p5 `rect(..., radius)`**
	- Symptom: `ERR:ctx.roudRect is not a function` (or `roundRect` failure)
	- Effect: Mid-frame render abort; entities/status can disappear
	- Rule: **Do not use radius args on `rect()`** in Kindle-targeted rendering paths
	- Safe alternative: Plain `rect(x, y, w, h)` only

- **Right-clipped diagnostics in narrow status bars**
	- Symptom: Error text not visible even though failures are happening
	- Effect: False impression that there is no error
	- Rule: Put `ERR:...` text first in the status line
	- Safe alternative: Left-priority diagnostics, then gameplay/status text

- **Pointer event inconsistency when relying on a single event type**
	- Symptom: Stylus taps not always mapped through `mousePressed()` on Silk
	- Effect: Intermittent non-responsive controls
	- Rule: Use canvas `pointerdown` as primary path, keep p5 mouse/touch handlers as fallback
	- Safe alternative: Single shared `handleTapAt(px, py)` function called by all input paths

- **Silent failure from unguarded mid-frame draw code**
	- Symptom: Top/maze render, but entities or bottom bar vanish
	- Effect: Incomplete frame with no obvious stack trace on device
	- Rule: Wrap risky mid-frame drawing in `try/catch` and keep status rendering outside/after guard
	- Safe alternative: Fallback renderer (`rect`-only entities) + on-screen `ERR:...` reporting

---

## Visual Design for E-Ink

- **Pure black / white** — fills are `0` or `255` only; no grey mid-tones that e-ink renders inconsistently.
- **Monospace font** — glyph width is predictable; symbols (`@`, `E`, `<`, `$`) center reliably in cells.
- **Cell size 72 px** — exceeds the WCAG 2.5.5 44 px minimum for pointer targets; accommodates the ~2 mm stylus tip diameter at 300 PPI.
- **Stats bar (top)** — 68 px black bar with white text. Placed at top so it is never scrolled off on a portrait screen.
- **Status bar (bottom)** — 50 px light-grey bar describes the last game event in plain text (no modal dialogs). Acts as an accessible live region.
- **Diagnostics-first status text** — render errors are shown first (`ERR:...`) so they remain visible on narrow/clipped lines.
- **Move hints** — thick border (5 px) is clearly visible on e-ink without relying on colour.
- **No alert()** — native browser modals on Kindle are unreliable; game-over state is rendered as a full-canvas screen, dismissed by any tap or key press.

---

## Accessibility Checklist

| Criterion | Approach |
|---|---|
| WCAG 1.4.3 Contrast | Black on white = 21:1 (AAA) |
| WCAG 2.5.5 Target Size | 72 × 72 px cells (min 44 px) |
| WCAG 2.1.1 Keyboard | Arrow keys + WASD; canvas is focusable |
| WCAG 4.1.2 Name/Role/Value | `role="application"`, `aria-label` on canvas |
| No modal dialogs | All state communicated on-canvas |
| Touch input | `touchStarted()` handles finger taps |
| Pointer input | `mousePressed()` handles EMR stylus |
