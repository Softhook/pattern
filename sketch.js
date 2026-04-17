// ── Kindle Scribe Optimized Roguelike ────────────────────────────────────────
// Controls: Tap / stylus the highlighted adjacent cell to move.
//           Arrow keys and WASD also work (keyboard cover / accessibility).
// No modal alerts. All feedback is rendered on-canvas.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

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

// ── Setup ─────────────────────────────────────────────────────────────────────
function setup() {
  pixelDensity(1); // 1:1 CSS-px mapping — critical for e-ink sharpness & performance

  let cnv = createCanvas(windowWidth, windowHeight);
  // ARIA: expose the canvas as an interactive application to assistive technology
  cnv.attribute('role',       'application');
  cnv.attribute('aria-label', 'Dungeon roguelike. Tap a highlighted adjacent cell to move, or use arrow keys.');
  cnv.attribute('tabindex',   '0'); // make canvas focusable for keyboard input

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
  textSize(24); textAlign(LEFT, CENTER);
  // ♥ repeated for HP gives a visual count readable at e-ink contrast
  let hearts = '';
  for (let i = 0; i < player.hp; i++) hearts += '♥';
  text(`  B${level}F   ${hearts}   $${player.gold}`, 0, STATS_H / 2);
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
  drawStairsSprite(stairs.x, stairs.y);
  for (let g of goldItems) drawGoldSprite(g.x, g.y);
  for (let e of enemies)   drawEnemySprite(e.x, e.y);
  drawPlayerSprite(player.x, player.y);
}

// ── Sprites ───────────────────────────────────────────────────────────────────
// All sprites receive grid column (gc) and row (gr).
// px/py = pixel top-left of cell; cx/cy = pixel centre. s = CELL_SIZE.

function drawPlayerSprite(gc, gr) {
  let px = gc * CELL_SIZE, py = STATS_H + gr * CELL_SIZE;
  let s = CELL_SIZE, cx = px + s / 2, cy = py + s / 2;

  fill(0); noStroke();

  // Helmet dome
  arc(cx, cy - s * 0.21, s * 0.34, s * 0.34, PI, TWO_PI);
  // Helmet brim (horizontal bar)
  rect(px + s * 0.26, py + s * 0.30, s * 0.48, s * 0.07, 2);

  // Face (white oval inside helmet)
  fill(255);
  ellipse(cx, cy - s * 0.09, s * 0.20, s * 0.18);

  // Body / breastplate (trapezoid — wider at shoulders)
  fill(0);
  beginShape();
  vertex(cx - s * 0.24, cy - s * 0.00);
  vertex(cx + s * 0.24, cy - s * 0.00);
  vertex(cx + s * 0.17, cy + s * 0.22);
  vertex(cx - s * 0.17, cy + s * 0.22);
  endShape(CLOSE);
  // Breastplate cross detail (white)
  fill(255);
  rect(cx - s * 0.03, cy + s * 0.02, s * 0.06, s * 0.17);
  rect(cx - s * 0.10, cy + s * 0.08, s * 0.20, s * 0.05);

  // Legs
  fill(0);
  rect(px + s * 0.24, py + s * 0.64, s * 0.14, s * 0.26, 3);
  rect(px + s * 0.62, py + s * 0.64, s * 0.14, s * 0.26, 3);

  // Sword (right side) — blade + crossguard
  strokeWeight(4); stroke(0); noFill();
  line(cx + s * 0.28, cy + s * 0.14, cx + s * 0.44, cy - s * 0.30); // blade
  line(cx + s * 0.20, cy - s * 0.04, cx + s * 0.38, cy - s * 0.04); // guard
  noStroke();
}

function drawEnemySprite(gc, gr) {
  let px = gc * CELL_SIZE, py = STATS_H + gr * CELL_SIZE;
  let s = CELL_SIZE, cx = px + s / 2, cy = py + s / 2;

  fill(0); noStroke();

  // Skull dome (filled arc)
  arc(cx, cy - s * 0.06, s * 0.48, s * 0.48, PI, TWO_PI);

  // Cheekbones / jaw — rounded rectangle
  rect(px + s * 0.26, py + s * 0.40, s * 0.48, s * 0.24, 4);

  // Eye sockets (white)
  fill(255);
  ellipse(cx - s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);
  ellipse(cx + s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);

  // Nose hole (white)
  rect(cx - s * 0.03, cy + s * 0.06, s * 0.06, s * 0.07);

  // Teeth — white gaps cut into jaw
  fill(255);
  rect(px + s * 0.31, py + s * 0.56, s * 0.07, s * 0.10);
  rect(px + s * 0.44, py + s * 0.56, s * 0.07, s * 0.10);
  rect(px + s * 0.57, py + s * 0.56, s * 0.07, s * 0.10);

  // Horns (two filled triangles above dome)
  fill(0);
  triangle(cx - s * 0.22, py + s * 0.14,
           cx - s * 0.10, py + s * 0.14,
           cx - s * 0.16, py + s * 0.00);
  triangle(cx + s * 0.10, py + s * 0.14,
           cx + s * 0.22, py + s * 0.14,
           cx + s * 0.16, py + s * 0.00);
}

function drawStairsSprite(gc, gr) {
  let px = gc * CELL_SIZE, py = STATS_H + gr * CELL_SIZE;
  let s = CELL_SIZE;

  fill(0); noStroke();

  // Four descending steps — each shifts right and down
  let stepH  = s * 0.13;
  let startX = px + s * 0.12;
  let startY = py + s * 0.20;
  let fullW  = s * 0.76;

  for (let i = 0; i < 4; i++) {
    let stepW = fullW - i * (fullW / 4);
    let sx    = startX + i * (fullW / 4);
    let sy    = startY + i * (stepH + s * 0.03);
    rect(sx, sy, stepW, stepH, 2);
  }

  // Down-arrow below steps
  let ax = px + s * 0.50, ay = py + s * 0.82;
  strokeWeight(3); stroke(0); noFill();
  line(ax - s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
  line(ax + s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
  noStroke();
}

function drawGoldSprite(gc, gr) {
  let px = gc * CELL_SIZE, py = STATS_H + gr * CELL_SIZE;
  let s = CELL_SIZE, cx = px + s / 2, cy = py + s / 2;

  fill(0); noStroke();
  // Coin outer circle
  ellipse(cx, cy, s * 0.54, s * 0.54);
  // Inner ring (white)
  fill(255);
  ellipse(cx, cy, s * 0.36, s * 0.36);
  // Centre dot (black)
  fill(0);
  ellipse(cx, cy, s * 0.14, s * 0.14);
  // Shine arc (white highlight, top-left)
  fill(255);
  arc(cx - s * 0.08, cy - s * 0.08, s * 0.10, s * 0.10, PI, TWO_PI);
}

function drawStatusBar() {
  fill(230); noStroke();
  rect(0, height - MSG_H, width, MSG_H);
  fill(0); textSize(18); textAlign(LEFT, CENTER);
  text("  " + statusMsg, 0, height - MSG_H + MSG_H / 2);
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

// Primary: tap / stylus press on an adjacent highlighted cell
function mousePressed() {
  if (gameOver) {
    player.hp = 5; player.gold = 0; level = 1;
    generateLevel(); redraw();
    return false;
  }

  let gx = floor(mouseX / CELL_SIZE);
  let gy = floor((mouseY - STATS_H) / CELL_SIZE);

  let moves = getValidMoves();
  for (let m of moves) {
    if (m.nx === gx && m.ny === gy) {
      move(m.dx, m.dy);
      return false;
    }
  }
  return false;
}

// Touch fallback (finger touch, Kindle Scribe on-screen tap without stylus)
function touchStarted() {
  mousePressed();
  return false; // prevent browser scroll
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