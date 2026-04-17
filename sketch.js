// ── Kindle Scribe Optimized Roguelike ────────────────────────────────────────
// Controls: Tap / stylus the highlighted adjacent cell to move.
//           Arrow keys and WASD also work (keyboard cover / accessibility).
// No modal alerts. All feedback is rendered on-canvas.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const APP_VERSION = 'Kindle Build v1.4.0';
const CELL_SIZE = 72;   // px — well above the 44 px WCAG 2.5.5 min; suits EMR stylus
const STATS_H   = 68;   // px — HUD bar at the top
const MSG_H     = 50;   // px — status bar at the bottom

let grid = [];
let cols, rows;
let player    = { x: 1, y: 1, hp: 5, gold: 0 };
let enemies   = [];
let goldItems = [];
let stairs    = { x: 0, y: 0 };
let level     = 1;
let statusMsg = "Tap a highlighted cell to move. Find the stairs (<).";
let gameOver  = false;
let spriteRenderFailed = false;
let gameCanvas = null;
let lastTapCell = null;

// ── Setup ─────────────────────────────────────────────────────────────────────
function setup() {
  pixelDensity(1); // 1:1 CSS-px mapping — critical for e-ink sharpness & performance

  let cnv = createCanvas(windowWidth, windowHeight);
  gameCanvas = cnv;
  // ARIA: expose the canvas as an interactive application to assistive technology
  cnv.attribute('role',       'application');
  cnv.attribute('aria-label', 'Dungeon roguelike. Tap a highlighted adjacent cell to move, or use arrow keys.');
  cnv.attribute('tabindex',   '0'); // make canvas focusable for keyboard input
  cnv.style('touch-action', 'none');

  // Kindle/Silk reliability: pointerdown catches stylus input even if mousePressed/touchStarted are inconsistent.
  cnv.elt.addEventListener('pointerdown', function (evt) {
    const rect = cnv.elt.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;
    handleTapAt(px, py);
    evt.preventDefault();
  }, { passive: false });

  noLoop();
  textFont('monospace');

  cols = floor(width  / CELL_SIZE);
  rows = floor((height - STATS_H - MSG_H) / CELL_SIZE);

  generateLevel();
}

// ── Level Generation ──────────────────────────────────────────────────────────
function generateLevel() {
  randomSeed(999 + level);
  grid = []; enemies = []; goldItems = [];

  let wallChance = min(0.15 + level * 0.02, 0.30);

  for (let i = 0; i < cols; i++) {
    grid[i] = [];
    for (let j = 0; j < rows; j++) {
      grid[i][j] = (i === 0 || i === cols - 1 || j === 0 || j === rows - 1)
        ? 1 : (random() < wallChance ? 1 : 0);
    }
  }

  // Guarantee open start area
  player.x = 1; player.y = 1;
  grid[1][1] = 0; grid[2][1] = 0; grid[1][2] = 0;

  // Stairs — place in far quadrant
  stairs.x = floor(random(cols / 2, cols - 2));
  stairs.y = floor(random(rows / 2, rows - 2));
  grid[stairs.x][stairs.y] = 0;

  let goldCount = 3 + level;
  for (let i = 0; i < goldCount; i++) {
    let rx = floor(random(1, cols - 1));
    let ry = floor(random(1, rows - 1));
    if (grid[rx][ry] === 0 && !(rx === stairs.x && ry === stairs.y))
      goldItems.push({ x: rx, y: ry });
  }

  let enemyCount = floor(2 + level * 1.5);
  for (let i = 0; i < enemyCount; i++) {
    let rx = floor(random(3, cols - 1));
    let ry = floor(random(3, rows - 1));
    if (grid[rx][ry] === 0) enemies.push({ x: rx, y: ry });
  }

  statusMsg = `Floor B${level}F — Tap a highlighted cell to move.`;
  gameOver  = false;
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
  background(255); // Full white — minimises e-ink ghosting

  if (gameOver) { drawGameOver(); return; }

  drawStats();
  drawGrid();
  drawMoveHints();
  drawEntities();
  drawStatusBar();
}

function drawStats() {
  fill(0); noStroke();
  rect(0, 0, width, STATS_H);
  fill(255); noStroke();
  textSize(19); textAlign(LEFT, CENTER);
  // ♥ repeated for HP gives a visual count readable at e-ink contrast
  let hearts = '';
  for (let i = 0; i < player.hp; i++) hearts += '♥';
  text(`  ${APP_VERSION}  |  B${level}F  |  ${hearts}  |  $${player.gold}`, 0, STATS_H / 2);
}

function drawGrid() {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let x = i * CELL_SIZE;
      let y = STATS_H + j * CELL_SIZE;
      if (grid[i][j] === 1) {
        fill(0); noStroke();
        rect(x, y, CELL_SIZE, CELL_SIZE);
      } else {
        noFill(); stroke(200); strokeWeight(1);
        rect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

// Bold inset border on each valid adjacent cell — the primary Kindle Scribe control
function drawMoveHints() {
  let moves = getValidMoves();
  noFill(); stroke(0); strokeWeight(5);
  for (let m of moves) {
    let x = m.nx * CELL_SIZE + 6;
    let y = STATS_H + m.ny * CELL_SIZE + 6;
    rect(x, y, CELL_SIZE - 12, CELL_SIZE - 12, 4);
  }
}

function drawEntities() {
  // Kindle-first path: always use simple high-contrast blocks.
  // This avoids browser-specific canvas quirks and guarantees visibility.
  drawFallbackEntities();
}

// ── Sprites ───────────────────────────────────────────────────────────────────
// All sprites are pixel masks rendered with plain rect() calls for Silk reliability.

const PLAYER_MASK = [
  "00111100",
  "01111110",
  "01111110",
  "00111100",
  "00111100",
  "01111110",
  "01100110",
  "11000011"
];

const ENEMY_MASK = [
  "00111100",
  "01111110",
  "11111111",
  "11011011",
  "11111111",
  "01100110",
  "01100110",
  "00111100"
];

const STAIRS_MASK = [
  "11111111",
  "01111111",
  "00111111",
  "00011111",
  "00001111",
  "00000111",
  "00000011",
  "00000001"
];

const GOLD_MASK = [
  "00111100",
  "01111110",
  "11000011",
  "11011011",
  "11011011",
  "11000011",
  "01111110",
  "00111100"
];

function drawSpriteMask(gc, gr, mask, invertCenter) {
  let px = gc * CELL_SIZE;
  let py = STATS_H + gr * CELL_SIZE;
  let s = CELL_SIZE;
  let cell = s / 8;

  noStroke();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (mask[r][c] === "1") {
        fill(0);
        rect(px + c * cell, py + r * cell, cell + 0.3, cell + 0.3);
      }
    }
  }

  // Optional center cut-out for contrast detail (used by coin)
  if (invertCenter) {
    fill(255);
    rect(px + 3 * cell, py + 3 * cell, 2 * cell, 2 * cell);
  }
}

function drawPlayerSprite(gc, gr) {
  drawSpriteMask(gc, gr, PLAYER_MASK, false);
}

function drawEnemySprite(gc, gr) {
  drawSpriteMask(gc, gr, ENEMY_MASK, false);
}

function drawStairsSprite(gc, gr) {
  drawSpriteMask(gc, gr, STAIRS_MASK, false);
}

function drawGoldSprite(gc, gr) {
  drawSpriteMask(gc, gr, GOLD_MASK, true);
}

function drawFallbackEntities() {
  // Mark the last tapped cell so interaction feedback is visible on e-ink.
  if (lastTapCell && lastTapCell.x >= 0 && lastTapCell.y >= 0 && lastTapCell.x < cols && lastTapCell.y < rows) {
    let tx = lastTapCell.x * CELL_SIZE;
    let ty = STATS_H + lastTapCell.y * CELL_SIZE;
    noFill();
    stroke(0);
    strokeWeight(3);
    rect(tx + 4, ty + 4, CELL_SIZE - 8, CELL_SIZE - 8);
  }

  noStroke();

  function drawBadge(gx, gy) {
    let x = gx * CELL_SIZE;
    let y = STATS_H + gy * CELL_SIZE;
    fill(255);
    rect(x + 6, y + 6, CELL_SIZE - 12, CELL_SIZE - 12);
    fill(0);
    rect(x + 6, y + 6, CELL_SIZE - 12, 4);
    rect(x + 6, y + CELL_SIZE - 10, CELL_SIZE - 12, 4);
    rect(x + 6, y + 6, 4, CELL_SIZE - 12);
    rect(x + CELL_SIZE - 10, y + 6, 4, CELL_SIZE - 12);
    return { x, y };
  }

  // Stairs fallback: descending steps pattern on a white badge.
  let sx = stairs.x * CELL_SIZE;
  let sy = STATS_H + stairs.y * CELL_SIZE;
  drawBadge(stairs.x, stairs.y);
  fill(0);
  rect(sx + 8,  sy + 12, CELL_SIZE - 16, 8);
  rect(sx + 16, sy + 24, CELL_SIZE - 24, 8);
  rect(sx + 24, sy + 36, CELL_SIZE - 32, 8);
  rect(sx + 32, sy + 48, CELL_SIZE - 40, 8);

  // Gold fallback: black square with white centre on a white badge.
  for (let g of goldItems) {
    let x = g.x * CELL_SIZE;
    let y = STATS_H + g.y * CELL_SIZE;
    drawBadge(g.x, g.y);
    fill(0); rect(x + 16, y + 16, CELL_SIZE - 32, CELL_SIZE - 32);
    fill(255); rect(x + 28, y + 28, CELL_SIZE - 56, CELL_SIZE - 56);
  }

  // Enemy fallback: filled block with white eye bar on a white badge.
  for (let e of enemies) {
    let x = e.x * CELL_SIZE;
    let y = STATS_H + e.y * CELL_SIZE;
    drawBadge(e.x, e.y);
    fill(0); rect(x + 10, y + 10, CELL_SIZE - 20, CELL_SIZE - 20);
    fill(255); rect(x + 18, y + 24, CELL_SIZE - 36, 8);
  }

  // Player fallback: solid black with white cross on a white badge.
  let px = player.x * CELL_SIZE;
  let py = STATS_H + player.y * CELL_SIZE;
  drawBadge(player.x, player.y);
  fill(0); rect(px + 10, py + 10, CELL_SIZE - 20, CELL_SIZE - 20);
  fill(255); rect(px + CELL_SIZE / 2 - 4, py + 22, 8, CELL_SIZE - 44);
  rect(px + 22, py + CELL_SIZE / 2 - 4, CELL_SIZE - 44, 8);

  spriteRenderFailed = true;
}

function drawStatusBar() {
  fill(230); noStroke();
  rect(0, height - MSG_H, width, MSG_H);
  fill(0); textSize(18); textAlign(LEFT, CENTER);
  let modeTag = spriteRenderFailed ? "[COMPAT] " : "";
  let counts = `P:${player.x},${player.y} E:${enemies.length} G:${goldItems.length} S:${stairs.x},${stairs.y}`;
  text("  " + modeTag + statusMsg + "  |  " + counts, 0, height - MSG_H + MSG_H / 2);
}

function drawGameOver() {
  fill(255); noStroke(); rect(0, 0, width, height);
  fill(0); textAlign(CENTER, CENTER);
  textSize(34);
  text("DUNGEON CLAIMS ANOTHER SOUL", width / 2, height / 2 - 50);
  textSize(22);
  text(`Floor B${level}F  |  Gold: $${player.gold}`, width / 2, height / 2 + 10);
  textSize(18);
  text("Tap anywhere or press any key to restart", width / 2, height / 2 + 60);
}

// ── Game Logic ────────────────────────────────────────────────────────────────
function getValidMoves() {
  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
  return dirs
    .map(d => ({ dx: d.dx, dy: d.dy, nx: player.x + d.dx, ny: player.y + d.dy }))
    .filter(m =>
      m.nx >= 0 && m.ny >= 0 && m.nx < cols && m.ny < rows &&
      grid[m.nx][m.ny] === 0
    );
}

function move(dx, dy) {
  if (gameOver) return;
  let nx = player.x + dx;
  let ny = player.y + dy;
  if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || grid[nx][ny] === 1) return;

  // Combat
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x === nx && enemies[i].y === ny) {
      enemies.splice(i, 1);
      player.hp--;
      if (player.hp <= 0) {
        statusMsg = "You have been defeated...";
        gameOver = true;
      } else {
        statusMsg = `Struck an enemy! HP remaining: ${player.hp}`;
      }
      finishTurn();
      return;
    }
  }

  // Gold
  for (let i = goldItems.length - 1; i >= 0; i--) {
    if (goldItems[i].x === nx && goldItems[i].y === ny) {
      let g = 5 + level * 2;
      goldItems.splice(i, 1);
      player.gold += g;
      statusMsg = `Picked up ${g} gold! Total: $${player.gold}`;
    }
  }

  // Stairs
  if (nx === stairs.x && ny === stairs.y) {
    level++;
    generateLevel();
    redraw();
    return;
  }

  player.x = nx;
  player.y = ny;
  if (!statusMsg.startsWith("Picked")) statusMsg = "";
  moveEnemies();
  finishTurn();
}

function moveEnemies() {
  for (let e of enemies) {
    if (dist(e.x, e.y, player.x, player.y) < 6) {
      let dx = player.x > e.x ? 1 : player.x < e.x ? -1 : 0;
      let dy = player.y > e.y ? 1 : player.y < e.y ? -1 : 0;
      if (random() > 0.3) {
        if (grid[e.x + dx] && grid[e.x + dx][e.y] === 0) e.x += dx;
        else if (grid[e.x] && grid[e.x][e.y + dy] === 0) e.y += dy;
      }
    }
  }
}

function finishTurn() { redraw(); }

// ── Input Handling ────────────────────────────────────────────────────────────

function handleTapAt(px, py) {
  if (gameOver) {
    player.hp = 5; player.gold = 0; level = 1;
    generateLevel(); redraw();
    return false;
  }

  let gx = floor(px / CELL_SIZE);
  let gy = floor((py - STATS_H) / CELL_SIZE);
  lastTapCell = { x: gx, y: gy };

  let moves = getValidMoves();
  for (let m of moves) {
    if (m.nx === gx && m.ny === gy) {
      move(m.dx, m.dy);
      return false;
    }
  }

  statusMsg = `Tap a highlighted adjacent cell. Last tap: ${gx},${gy}`;
  redraw();
  return false;
}

// Primary: tap / stylus press on an adjacent highlighted cell
function mousePressed() {
  return handleTapAt(mouseX, mouseY);
}

// Touch fallback (finger touch, Kindle Scribe on-screen tap without stylus)
function touchStarted() {
  return handleTapAt(mouseX, mouseY);
}

// Keyboard fallback: arrow keys + WASD (keyboard cover, accessibility)
function keyPressed() {
  if (gameOver) {
    player.hp = 5; player.gold = 0; level = 1;
    generateLevel(); redraw();
    return false;
  }
  if (keyCode === UP_ARROW    || key === 'w' || key === 'W') move(0, -1);
  if (keyCode === DOWN_ARROW  || key === 's' || key === 'S') move(0,  1);
  if (keyCode === LEFT_ARROW  || key === 'a' || key === 'A') move(-1, 0);
  if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') move(1,  0);
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  cols = floor(width  / CELL_SIZE);
  rows = floor((height - STATS_H - MSG_H) / CELL_SIZE);
  generateLevel();
}