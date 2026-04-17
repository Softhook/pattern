# Kindle Scribe Design Brief — Dungeon Roguelike

## Device Constraints

| Constraint | Value | Design Response |
|---|---|---|
| Display type | E-ink (11″, 300 PPI) | Black/white only; `background(255)` every frame clears ghosting |
| Refresh rate | ~500 ms full, ~100 ms partial | `noLoop()` + `redraw()` — only redraw on player action |
| CSS viewport | ~930 × 1236 px portrait (11″ model at ~300 PPI, Silk DPR ≈ 2) | `pixelDensity(1)` keeps rendering 1:1 with CSS pixels; no subpixel blur. Layout is fully dynamic via `windowWidth/windowHeight` — adapts to any reported viewport. |
| Input | EMR stylus (pen pointer) + finger touch | Tap-to-move; no buttons that could be clipped off-screen |
| Browser | Kindle Silk (Chromium-based) | Standard Pointer / Touch Events supported; no alert() modals |
| Keyboard | Optional physical cover | Arrow keys + WASD as full keyboard fallback |

---

## Control Scheme — Tap Adjacent Cell to Move

The previous D-pad button layout was drawn at a fixed Y offset that fell below the visible viewport on the Kindle Scribe's portrait aspect ratio, making controls invisible. The replacement interaction model:

1. **Valid move hints** — At the start of every turn, each of the up to four orthogonally adjacent floor cells is outlined with a bold 5 px inset border. The player can only tap marked cells.
2. **Tap / stylus press** — `mousePressed()` (p5.js maps pen pointer events here) converts the stylus coordinate to a grid column/row. If that cell matches a valid move hint, `move(dx, dy)` is called.
3. **Touch fallback** — `touchStarted()` mirrors the same logic for fingertip input.
4. **Keyboard fallback** — `keyPressed()` handles Arrow keys and WASD. The canvas carries `tabindex="0"` so it is focusable without a pointing device.

---

## Visual Design for E-Ink

- **Pure black / white** — fills are `0` or `255` only; no grey mid-tones that e-ink renders inconsistently.
- **Monospace font** — glyph width is predictable; symbols (`@`, `E`, `<`, `$`) center reliably in cells.
- **Cell size 72 px** — exceeds the WCAG 2.5.5 44 px minimum for pointer targets; accommodates the ~2 mm stylus tip diameter at 300 PPI.
- **Stats bar (top)** — 68 px black bar with white text. Placed at top so it is never scrolled off on a portrait screen.
- **Status bar (bottom)** — 50 px light-grey bar describes the last game event in plain text (no modal dialogs). Acts as an accessible live region.
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
