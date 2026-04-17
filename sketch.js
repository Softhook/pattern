'use strict';

const APP_VERSION = 'Kindle Build v2.0.0';
const CELL_SIZE = 72;
const STATS_H = 68;
const MSG_H = 50;

const DIRECTIONS = [
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
];

const ENEMY_DEFS = {
  skull: {
    hpDamage: 1,
    aggroRange: 6,
    moveChance: 0.7,
    draw: 'skull'
  },
  brute: {
    hpDamage: 2,
    aggroRange: 4,
    moveChance: 0.5,
    draw: 'brute'
  }
};

const ITEM_DEFS = {
  gold: {
    draw: 'gold',
    pickupMessage: (item, game) => `Picked up ${item.amount} gold! Total: $${game.player.gold}`
  },
  potion: {
    draw: 'potion',
    pickupMessage: (item, game, healed) => `Drank potion (+${healed} HP). HP: ${game.player.hp}`
  },
  weapon: {
    draw: 'weapon',
    pickupMessage: (_item, game) => `Found weapon tier ${game.player.weaponTier}.`
  }
};

let game = null;

// Legacy globals preserved for compatibility with existing tests/debug tooling.
let grid = [];
let cols = 0;
let rows = 0;
let player = null;
let enemies = [];
let goldItems = [];
let stairs = { x: 0, y: 0 };
let level = 1;
let statusMsg = 'Tap a highlighted adjacent cell (diagonals allowed).';
let gameOver = false;
let spriteRenderFailed = false;
let entityDrawError = '';
let renderPhaseError = '';
let gameCanvas = null;
let lastTapCell = null;

class GridEntity {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind;
  }
}

class PlayerEntity extends GridEntity {
  constructor(x, y) {
    super(x, y, 'player');
    this.hp = 5;
    this.gold = 0;
    this.weaponTier = 0;
  }

  resetForNewRun() {
    this.x = 1;
    this.y = 1;
    this.hp = 5;
    this.gold = 0;
    this.weaponTier = 0;
  }
}

class EnemyEntity extends GridEntity {
  constructor(x, y, kind) {
    super(x, y, kind);
    this.spec = ENEMY_DEFS[kind] || ENEMY_DEFS.skull;
  }
}

class ItemEntity extends GridEntity {
  constructor(x, y, kind, amount = 0) {
    super(x, y, kind);
    this.amount = amount;
    this.spec = ITEM_DEFS[kind] || ITEM_DEFS.gold;
  }
}

class StairsEntity extends GridEntity {
  constructor(x, y) {
    super(x, y, 'stairs');
  }
}

class LevelGenerator {
  generate(levelNumber, mapCols, mapRows, currentPlayer) {
    randomSeed(999 + levelNumber);

    const wallChance = min(0.15 + levelNumber * 0.02, 0.30);
    const generatedGrid = this.buildGrid(mapCols, mapRows, wallChance);

    // Keep start safe.
    currentPlayer.x = 1;
    currentPlayer.y = 1;
    generatedGrid[1][1] = 0;
    generatedGrid[2][1] = 0;
    generatedGrid[1][2] = 0;

    const stairsEntity = this.placeStairs(generatedGrid, mapCols, mapRows);
    const items = this.placeItems(generatedGrid, mapCols, mapRows, levelNumber, stairsEntity);
    const enemyList = this.placeEnemies(generatedGrid, mapCols, mapRows, levelNumber);

    return {
      grid: generatedGrid,
      stairs: stairsEntity,
      items,
      enemies: enemyList
    };
  }

  buildGrid(mapCols, mapRows, wallChance) {
    const generatedGrid = [];
    for (let i = 0; i < mapCols; i++) {
      generatedGrid[i] = [];
      for (let j = 0; j < mapRows; j++) {
        generatedGrid[i][j] = (i === 0 || i === mapCols - 1 || j === 0 || j === mapRows - 1)
          ? 1
          : (random() < wallChance ? 1 : 0);
      }
    }
    return generatedGrid;
  }

  placeStairs(generatedGrid, mapCols, mapRows) {
    const sx = floor(random(mapCols / 2, mapCols - 2));
    const sy = floor(random(mapRows / 2, mapRows - 2));
    generatedGrid[sx][sy] = 0;
    return new StairsEntity(sx, sy);
  }

  placeItems(generatedGrid, mapCols, mapRows, levelNumber, stairsEntity) {
    const items = [];
    const totalItems = 4 + levelNumber;

    for (let i = 0; i < totalItems; i++) {
      const floorCell = this.pickRandomFloorCell(generatedGrid, mapCols, mapRows);
      if (!floorCell) continue;

      if (floorCell.x === stairsEntity.x && floorCell.y === stairsEntity.y) continue;

      const roll = random();
      if (roll < 0.70) {
        const amount = 5 + levelNumber * 2;
        items.push(new ItemEntity(floorCell.x, floorCell.y, 'gold', amount));
      } else if (roll < 0.88) {
        items.push(new ItemEntity(floorCell.x, floorCell.y, 'potion', 2));
      } else {
        items.push(new ItemEntity(floorCell.x, floorCell.y, 'weapon', 1));
      }
    }

    return items;
  }

  placeEnemies(generatedGrid, mapCols, mapRows, levelNumber) {
    const enemyList = [];
    const enemyCount = floor(2 + levelNumber * 1.5);

    for (let i = 0; i < enemyCount; i++) {
      const floorCell = this.pickRandomFloorCell(generatedGrid, mapCols, mapRows, 3);
      if (!floorCell) continue;
      const kind = random() < 0.75 ? 'skull' : 'brute';
      enemyList.push(new EnemyEntity(floorCell.x, floorCell.y, kind));
    }

    return enemyList;
  }

  pickRandomFloorCell(generatedGrid, mapCols, mapRows, min = 1) {
    for (let i = 0; i < 25; i++) {
      const x = floor(random(min, mapCols - 1));
      const y = floor(random(min, mapRows - 1));
      if (generatedGrid[x] && generatedGrid[x][y] === 0) return { x, y };
    }
    return null;
  }
}

class Renderer {
  constructor(ownerGame) {
    this.game = ownerGame;
  }

  drawFrame() {
    background(255);

    if (this.game.gameOver) {
      this.drawGameOver();
      return;
    }

    this.drawStats();
    this.drawGrid();

    try {
      this.game.spriteRenderFailed = false;
      this.drawMoveHints();
      this.drawEntitiesNice();
      this.game.entityDrawError = '';
      this.game.renderPhaseError = '';
    } catch (err) {
      this.game.spriteRenderFailed = true;
      const msg = err && err.message ? err.message : 'unknown draw error';
      this.game.entityDrawError = msg;
      this.game.renderPhaseError = msg;
      this.drawEntitiesCompat();
    }

    this.drawStatusBar();
  }

  drawStats() {
    const g = this.game;
    fill(0); noStroke();
    rect(0, 0, width, STATS_H);
    fill(255); noStroke();
    textSize(18); textAlign(LEFT, CENTER);

    let hearts = '';
    for (let i = 0; i < g.player.hp; i++) hearts += '♥';

    text(`  ${APP_VERSION} | B${g.level}F | ${hearts} | $${g.player.gold} | W:${g.player.weaponTier}`, 0, STATS_H / 2);
  }

  drawGrid() {
    const g = this.game;
    for (let i = 0; i < g.cols; i++) {
      for (let j = 0; j < g.rows; j++) {
        const x = i * CELL_SIZE;
        const y = STATS_H + j * CELL_SIZE;
        if (g.grid[i][j] === 1) {
          fill(0); noStroke();
          rect(x, y, CELL_SIZE, CELL_SIZE);
        } else {
          noFill(); stroke(200); strokeWeight(1);
          rect(x, y, CELL_SIZE, CELL_SIZE);
        }
      }
    }
  }

  drawMoveHints() {
    const moves = this.game.getValidMoves();
    noFill();

    for (const m of moves) {
      const isDiagonal = abs(m.dx) === 1 && abs(m.dy) === 1;
      stroke(0);
      strokeWeight(isDiagonal ? 3 : 5);
      const x = m.nx * CELL_SIZE + 6;
      const y = STATS_H + m.ny * CELL_SIZE + 6;
      rect(x, y, CELL_SIZE - 12, CELL_SIZE - 12);
    }
  }

  drawEntitiesNice() {
    this.drawStairsSprite(this.game.stairs.x, this.game.stairs.y);

    for (const item of this.game.items) {
      if (item.kind === 'gold') this.drawGoldSprite(item.x, item.y);
      if (item.kind === 'potion') this.drawPotionSprite(item.x, item.y);
      if (item.kind === 'weapon') this.drawWeaponSprite(item.x, item.y);
    }

    for (const enemy of this.game.enemies) {
      if (enemy.kind === 'brute') this.drawBruteSprite(enemy.x, enemy.y);
      else this.drawEnemySprite(enemy.x, enemy.y);
    }

    this.drawPlayerSprite(this.game.player.x, this.game.player.y);
  }

  drawEntitiesCompat() {
    const g = this.game;

    if (g.lastTapCell && g.lastTapCell.x >= 0 && g.lastTapCell.y >= 0 && g.lastTapCell.x < g.cols && g.lastTapCell.y < g.rows) {
      const tx = g.lastTapCell.x * CELL_SIZE;
      const ty = STATS_H + g.lastTapCell.y * CELL_SIZE;
      noFill(); stroke(0); strokeWeight(3);
      rect(tx + 4, ty + 4, CELL_SIZE - 8, CELL_SIZE - 8);
    }

    noStroke();

    const drawBadge = (gx, gy) => {
      const x = gx * CELL_SIZE;
      const y = STATS_H + gy * CELL_SIZE;
      fill(255);
      rect(x + 6, y + 6, CELL_SIZE - 12, CELL_SIZE - 12);
      fill(0);
      rect(x + 6, y + 6, CELL_SIZE - 12, 4);
      rect(x + 6, y + CELL_SIZE - 10, CELL_SIZE - 12, 4);
      rect(x + 6, y + 6, 4, CELL_SIZE - 12);
      rect(x + CELL_SIZE - 10, y + 6, 4, CELL_SIZE - 12);
      return { x, y };
    };

    drawBadge(g.stairs.x, g.stairs.y);
    fill(0);
    rect(g.stairs.x * CELL_SIZE + 8, STATS_H + g.stairs.y * CELL_SIZE + 8, CELL_SIZE - 16, CELL_SIZE - 16);

    for (const item of g.items) {
      const p = drawBadge(item.x, item.y);
      fill(0);
      rect(p.x + 16, p.y + 16, CELL_SIZE - 32, CELL_SIZE - 32);
      if (item.kind !== 'gold') {
        fill(255);
        rect(p.x + 26, p.y + 26, CELL_SIZE - 52, CELL_SIZE - 52);
      }
    }

    for (const enemy of g.enemies) {
      const p = drawBadge(enemy.x, enemy.y);
      fill(0);
      rect(p.x + 10, p.y + 10, CELL_SIZE - 20, CELL_SIZE - 20);
      fill(255);
      rect(p.x + 18, p.y + 24, CELL_SIZE - 36, 8);
    }

    const p = drawBadge(g.player.x, g.player.y);
    fill(0);
    rect(p.x + 10, p.y + 10, CELL_SIZE - 20, CELL_SIZE - 20);
    fill(255);
    rect(p.x + CELL_SIZE / 2 - 4, p.y + 22, 8, CELL_SIZE - 44);
    rect(p.x + 22, p.y + CELL_SIZE / 2 - 4, CELL_SIZE - 44, 8);
  }

  drawStatusBar() {
    const g = this.game;
    fill(230); noStroke();
    rect(0, height - MSG_H, width, MSG_H);
    fill(0); textSize(17); textAlign(LEFT, CENTER);

    const modeTag = g.spriteRenderFailed ? '[COMPAT] ' : '';
    const errPrefix = g.renderPhaseError ? `ERR:${g.renderPhaseError}  |  ` : '';
    const counts = `P:${g.player.x},${g.player.y} E:${g.enemies.length} I:${g.items.length} S:${g.stairs.x},${g.stairs.y}`;
    text(`  ${errPrefix}${modeTag}${g.statusMsg} | ${counts}`, 0, height - MSG_H + MSG_H / 2);
  }

  drawGameOver() {
    const g = this.game;
    fill(255); noStroke();
    rect(0, 0, width, height);
    fill(0); textAlign(CENTER, CENTER);
    textSize(34);
    text('DUNGEON CLAIMS ANOTHER SOUL', width / 2, height / 2 - 50);
    textSize(22);
    text(`Floor B${g.level}F | Gold: $${g.player.gold}`, width / 2, height / 2 + 10);
    textSize(18);
    text('Tap anywhere or press any key to restart', width / 2, height / 2 + 60);
  }

  drawPlayerSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;
    const cx = px + s / 2;
    const cy = py + s / 2;

    fill(0); noStroke();
    arc(cx, cy - s * 0.21, s * 0.34, s * 0.34, PI, TWO_PI);
    rect(px + s * 0.26, py + s * 0.30, s * 0.48, s * 0.07);

    fill(255);
    ellipse(cx, cy - s * 0.09, s * 0.20, s * 0.18);

    fill(0);
    beginShape();
    vertex(cx - s * 0.24, cy);
    vertex(cx + s * 0.24, cy);
    vertex(cx + s * 0.17, cy + s * 0.22);
    vertex(cx - s * 0.17, cy + s * 0.22);
    endShape(CLOSE);

    fill(255);
    rect(cx - s * 0.03, cy + s * 0.02, s * 0.06, s * 0.17);
    rect(cx - s * 0.10, cy + s * 0.08, s * 0.20, s * 0.05);

    fill(0);
    rect(px + s * 0.24, py + s * 0.64, s * 0.14, s * 0.26);
    rect(px + s * 0.62, py + s * 0.64, s * 0.14, s * 0.26);

    strokeWeight(4); stroke(0); noFill();
    line(cx + s * 0.28, cy + s * 0.14, cx + s * 0.44, cy - s * 0.30);
    line(cx + s * 0.20, cy - s * 0.04, cx + s * 0.38, cy - s * 0.04);
    noStroke();
  }

  drawEnemySprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;
    const cx = px + s / 2;
    const cy = py + s / 2;

    fill(0); noStroke();
    arc(cx, cy - s * 0.06, s * 0.48, s * 0.48, PI, TWO_PI);
    rect(px + s * 0.26, py + s * 0.40, s * 0.48, s * 0.24);

    fill(255);
    ellipse(cx - s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);
    ellipse(cx + s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);
    rect(cx - s * 0.03, cy + s * 0.06, s * 0.06, s * 0.07);
    rect(px + s * 0.31, py + s * 0.56, s * 0.07, s * 0.10);
    rect(px + s * 0.44, py + s * 0.56, s * 0.07, s * 0.10);
    rect(px + s * 0.57, py + s * 0.56, s * 0.07, s * 0.10);

    fill(0);
    triangle(cx - s * 0.22, py + s * 0.14, cx - s * 0.10, py + s * 0.14, cx - s * 0.16, py);
    triangle(cx + s * 0.10, py + s * 0.14, cx + s * 0.22, py + s * 0.14, cx + s * 0.16, py);
  }

  drawBruteSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;

    fill(0); noStroke();
    rect(px + s * 0.16, py + s * 0.20, s * 0.68, s * 0.60);

    fill(255);
    rect(px + s * 0.28, py + s * 0.34, s * 0.14, s * 0.10);
    rect(px + s * 0.58, py + s * 0.34, s * 0.14, s * 0.10);

    fill(255);
    rect(px + s * 0.34, py + s * 0.58, s * 0.32, s * 0.08);
  }

  drawStairsSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;

    fill(0); noStroke();
    const stepH = s * 0.13;
    const startX = px + s * 0.12;
    const startY = py + s * 0.20;
    const fullW = s * 0.76;

    for (let i = 0; i < 4; i++) {
      const stepW = fullW - i * (fullW / 4);
      const sx = startX + i * (fullW / 4);
      const sy = startY + i * (stepH + s * 0.03);
      rect(sx, sy, stepW, stepH);
    }

    const ax = px + s * 0.50;
    const ay = py + s * 0.82;
    strokeWeight(3); stroke(0); noFill();
    line(ax - s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
    line(ax + s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
    noStroke();
  }

  drawGoldSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;
    const cx = px + s / 2;
    const cy = py + s / 2;

    fill(0); noStroke();
    ellipse(cx, cy, s * 0.54, s * 0.54);
    fill(255);
    ellipse(cx, cy, s * 0.36, s * 0.36);
    fill(0);
    ellipse(cx, cy, s * 0.14, s * 0.14);
    fill(255);
    arc(cx - s * 0.08, cy - s * 0.08, s * 0.10, s * 0.10, PI, TWO_PI);
  }

  drawPotionSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;

    fill(0); noStroke();
    rect(px + s * 0.34, py + s * 0.16, s * 0.32, s * 0.14);
    rect(px + s * 0.24, py + s * 0.30, s * 0.52, s * 0.48);

    fill(255);
    rect(px + s * 0.33, py + s * 0.42, s * 0.34, s * 0.24);
  }

  drawWeaponSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;

    stroke(0); strokeWeight(4); noFill();
    line(px + s * 0.25, py + s * 0.75, px + s * 0.75, py + s * 0.25);
    line(px + s * 0.20, py + s * 0.80, px + s * 0.35, py + s * 0.65);
    line(px + s * 0.65, py + s * 0.35, px + s * 0.80, py + s * 0.20);
    noStroke();
  }
}

class DungeonGame {
  constructor() {
    this.cols = 0;
    this.rows = 0;
    this.grid = [];
    this.level = 1;
    this.player = new PlayerEntity(1, 1);
    this.enemies = [];
    this.items = [];
    this.stairs = new StairsEntity(0, 0);
    this.statusMsg = 'Tap a highlighted adjacent cell (diagonals allowed).';
    this.gameOver = false;

    this.spriteRenderFailed = false;
    this.entityDrawError = '';
    this.renderPhaseError = '';
    this.lastTapCell = null;

    this.levelGenerator = new LevelGenerator();
    this.renderer = new Renderer(this);
    this.canvas = null;
  }

  setup() {
    pixelDensity(1);

    this.canvas = createCanvas(windowWidth, windowHeight);
    gameCanvas = this.canvas;

    this.canvas.attribute('role', 'application');
    this.canvas.attribute('aria-label', 'Dungeon roguelike. Tap a highlighted adjacent cell to move, diagonals are allowed, or use keyboard.');
    this.canvas.attribute('tabindex', '0');
    this.canvas.style('touch-action', 'none');

    this.canvas.elt.addEventListener('pointerdown', (evt) => {
      const rect = this.canvas.elt.getBoundingClientRect();
      const px = evt.clientX - rect.left;
      const py = evt.clientY - rect.top;
      this.handleTapAt(px, py);
      evt.preventDefault();
    }, { passive: false });

    noLoop();
    textFont('monospace');

    this.recalculateDimensions();
    this.generateLevel();
    this.syncLegacyGlobals();
  }

  recalculateDimensions() {
    this.cols = ceil(width / CELL_SIZE);
    this.rows = floor((height - STATS_H - MSG_H) / CELL_SIZE);
  }

  generateLevel() {
    const data = this.levelGenerator.generate(this.level, this.cols, this.rows, this.player);
    this.grid = data.grid;
    this.stairs = data.stairs;
    this.items = data.items;
    this.enemies = data.enemies;
    this.statusMsg = `Floor B${this.level}F - Tap a highlighted adjacent cell.`;
    this.gameOver = false;
    this.syncLegacyGlobals();
  }

  draw() {
    this.renderer.drawFrame();
    this.syncLegacyGlobals();
  }

  getValidMoves() {
    return DIRECTIONS
      .map((d) => ({ dx: d.dx, dy: d.dy, nx: this.player.x + d.dx, ny: this.player.y + d.dy }))
      .filter((m) => m.nx >= 0 && m.ny >= 0 && m.nx < this.cols && m.ny < this.rows && this.grid[m.nx][m.ny] === 0);
  }

  move(dx, dy) {
    if (this.gameOver) return;

    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) return;
    if (this.grid[nx][ny] === 1) return;

    // Combat check.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.x === nx && enemy.y === ny) {
        this.enemies.splice(i, 1);
        const damage = max(1, enemy.spec.hpDamage - this.player.weaponTier);
        this.player.hp -= damage;
        if (this.player.hp <= 0) {
          this.statusMsg = 'You have been defeated...';
          this.gameOver = true;
        } else {
          this.statusMsg = `Defeated ${enemy.kind}. HP remaining: ${this.player.hp}`;
        }
        this.finishTurn();
        return;
      }
    }

    // Item pickup check.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.x === nx && item.y === ny) {
        this.applyItemPickup(item);
        this.items.splice(i, 1);
      }
    }

    // Stairs check.
    if (nx === this.stairs.x && ny === this.stairs.y) {
      this.level += 1;
      this.generateLevel();
      redraw();
      return;
    }

    this.player.x = nx;
    this.player.y = ny;

    if (!this.statusMsg.startsWith('Picked') && !this.statusMsg.startsWith('Drank') && !this.statusMsg.startsWith('Found')) {
      this.statusMsg = '';
    }

    this.moveEnemies();
    this.finishTurn();
  }

  applyItemPickup(item) {
    if (item.kind === 'gold') {
      this.player.gold += item.amount;
      this.statusMsg = ITEM_DEFS.gold.pickupMessage(item, this);
      return;
    }

    if (item.kind === 'potion') {
      const before = this.player.hp;
      this.player.hp = min(9, this.player.hp + item.amount);
      const healed = this.player.hp - before;
      this.statusMsg = ITEM_DEFS.potion.pickupMessage(item, this, healed);
      return;
    }

    if (item.kind === 'weapon') {
      this.player.weaponTier += 1;
      this.statusMsg = ITEM_DEFS.weapon.pickupMessage(item, this);
    }
  }

  moveEnemies() {
    for (const enemy of this.enemies) {
      if (dist(enemy.x, enemy.y, this.player.x, this.player.y) >= enemy.spec.aggroRange) continue;
      if (random() > enemy.spec.moveChance) continue;

      const dx = this.player.x > enemy.x ? 1 : this.player.x < enemy.x ? -1 : 0;
      const dy = this.player.y > enemy.y ? 1 : this.player.y < enemy.y ? -1 : 0;

      if (this.canWalk(enemy.x + dx, enemy.y)) {
        enemy.x += dx;
      } else if (this.canWalk(enemy.x, enemy.y + dy)) {
        enemy.y += dy;
      } else if (this.canWalk(enemy.x + dx, enemy.y + dy)) {
        enemy.x += dx;
        enemy.y += dy;
      }
    }
  }

  canWalk(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && this.grid[x][y] === 0;
  }

  finishTurn() {
    this.syncLegacyGlobals();
    redraw();
  }

  handleTapAt(px, py) {
    if (this.gameOver) {
      this.player.resetForNewRun();
      this.level = 1;
      this.generateLevel();
      redraw();
      return false;
    }

    const gx = floor(px / CELL_SIZE);
    const gy = floor((py - STATS_H) / CELL_SIZE);
    this.lastTapCell = { x: gx, y: gy };

    const moves = this.getValidMoves();
    for (const m of moves) {
      if (m.nx === gx && m.ny === gy) {
        this.move(m.dx, m.dy);
        return false;
      }
    }

    this.statusMsg = `Tap a highlighted adjacent cell (diagonals allowed). Last tap: ${gx},${gy}`;
    this.finishTurn();
    return false;
  }

  keyPressed() {
    if (this.gameOver) {
      this.player.resetForNewRun();
      this.level = 1;
      this.generateLevel();
      redraw();
      return false;
    }

    if (keyCode === UP_ARROW || key === 'w' || key === 'W') this.move(0, -1);
    if (keyCode === DOWN_ARROW || key === 's' || key === 'S') this.move(0, 1);
    if (keyCode === LEFT_ARROW || key === 'a' || key === 'A') this.move(-1, 0);
    if (keyCode === RIGHT_ARROW || key === 'd' || key === 'D') this.move(1, 0);

    if (key === 'q' || key === 'Q') this.move(-1, -1);
    if (key === 'e' || key === 'E') this.move(1, -1);
    if (key === 'z' || key === 'Z') this.move(-1, 1);
    if (key === 'c' || key === 'C') this.move(1, 1);

    return false;
  }

  windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    this.recalculateDimensions();
    this.generateLevel();
  }

  syncLegacyGlobals() {
    grid = this.grid;
    cols = this.cols;
    rows = this.rows;
    player = this.player;
    enemies = this.enemies;
    goldItems = this.items.filter((i) => i.kind === 'gold');
    stairs = this.stairs;
    level = this.level;
    statusMsg = this.statusMsg;
    gameOver = this.gameOver;
    spriteRenderFailed = this.spriteRenderFailed;
    entityDrawError = this.entityDrawError;
    renderPhaseError = this.renderPhaseError;
    lastTapCell = this.lastTapCell;
  }
}

// p5 lifecycle wrappers.
function setup() {
  game = new DungeonGame();
  game.setup();
}

function draw() {
  if (game) game.draw();
}

function mousePressed() {
  if (!game) return false;
  return game.handleTapAt(mouseX, mouseY);
}

function touchStarted() {
  if (!game) return false;
  return game.handleTapAt(mouseX, mouseY);
}

function keyPressed() {
  if (!game) return false;
  return game.keyPressed();
}

function windowResized() {
  if (game) game.windowResized();
}

// Legacy function wrappers retained for compatibility with tests/scripts.
function move(dx, dy) {
  if (game) game.move(dx, dy);
}

function getValidMoves() {
  if (!game) return [];
  return game.getValidMoves();
}

function handleTapAt(px, py) {
  if (!game) return false;
  return game.handleTapAt(px, py);
}

function drawPlayerSprite(gc, gr) {
  if (game) game.renderer.drawPlayerSprite(gc, gr);
}

function drawEnemySprite(gc, gr) {
  if (game) game.renderer.drawEnemySprite(gc, gr);
}

function drawStairsSprite(gc, gr) {
  if (game) game.renderer.drawStairsSprite(gc, gr);
}

function drawGoldSprite(gc, gr) {
  if (game) game.renderer.drawGoldSprite(gc, gr);
}
