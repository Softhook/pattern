'use strict';

const APP_VERSION = 'v2.0.0';
const CELL_SIZE = 72;
const STATS_H = 68;
const MSG_H = 50;
const BASE_VISION_RADIUS = 2;
const TORCH_VISION_RADIUS = 3;
const TORCH_DURATION_MOVES = 30;

const PLAYER_DEFAULTS = { x: 1, y: 1, hp: 5, gold: 0, weaponTier: 0 };

const DIRECTIONS = [
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
];

const KEY_MAP = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], W: [0, -1], s: [0, 1], S: [0, 1],
  a: [-1, 0], A: [-1, 0], d: [1, 0], D: [1, 0],
  q: [-1, -1], Q: [-1, -1], e: [1, -1], E: [1, -1],
  z: [-1, 1], Z: [-1, 1], c: [1, 1], C: [1, 1]
};

const ENEMY_DEFS = {
  skull:  { hpDamage: 1, aggroRange: 6, moveChance: 0.7 },
  brute:  { hpDamage: 2, aggroRange: 4, moveChance: 0.5 },
  archer: { hpDamage: 1, aggroRange: 3, moveChance: 0, isRanged: true, range: 3 }
};

const ITEM_DEFS = {
  gold: {
    apply(item, g) { g.player.gold += item.amount; },
    msg: (item) => `Picked up ${item.amount} gold!`
  },
  potion: {
    apply(item, g) {
      const before = g.player.hp;
      g.player.hp = min(9, g.player.hp + item.amount);
      item._healed = g.player.hp - before;
    },
    msg: (item) => `Drank potion (+${item._healed} HP)`
  },
  weapon: {
    apply(_item, g) { g.player.weaponTier += 1; },
    msg: (_item, g) => `Found weapon ${g.player.weaponTier}.`
  },
  torch: {
    apply(_item, g) {
      g.torchMovesRemaining = TORCH_DURATION_MOVES;
      g._reveal();
    },
    msg: () => `Lit torch! Vision +1 for ${TORCH_DURATION_MOVES} moves.`
  }
};

const ITEM_TABLE = [
  { cutoff: 0.70, kind: 'gold',   amt: (lvl) => 5 + lvl * 2 },
  { cutoff: 0.88, kind: 'potion', amt: () => 2 },
  { cutoff: 0.96, kind: 'weapon', amt: () => 1 },
  { cutoff: 1.00, kind: 'torch',  amt: () => 1 }
];

let game = null;

// ─── Entities ────────────────────────────────────────────────

class GridEntity {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
  }
}

class PlayerEntity extends GridEntity {
  constructor() {
    super(PLAYER_DEFAULTS.x, PLAYER_DEFAULTS.y, 'player');
    Object.assign(this, PLAYER_DEFAULTS);
  }
  reset() { Object.assign(this, PLAYER_DEFAULTS); }
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
  }
}

// ─── Level Generator ─────────────────────────────────────────

class LevelGenerator {
  generate(level, cols, rows, player) {
    randomSeed(999 + level);

    const wallChance = min(0.15 + level * 0.02, 0.30);
    const grid = this._buildGrid(cols, rows, wallChance);

    const stairs = this._placeStairs(grid, cols, rows);

    let pCell = null;
    for (let i = 0; i < 50; i++) {
      const cell = this._pickFloor(grid, cols, rows);
      if (cell && dist(cell.x, cell.y, stairs.x, stairs.y) > 4) {
        pCell = cell;
        break;
      }
    }
    if (!pCell) pCell = { x: 1, y: 1 };
    
    player.x = pCell.x; player.y = pCell.y;
    grid[player.x][player.y] = 0;
    if (player.x + 1 < cols - 1) grid[player.x + 1][player.y] = 0;
    if (player.y + 1 < rows - 1) grid[player.x][player.y + 1] = 0;

    const items  = this._placeItems(grid, cols, rows, level, stairs);
    const enemies = this._placeEnemies(grid, cols, rows, level);

    return { grid, stairs, items, enemies };
  }

  _buildGrid(cols, rows, wallChance) {
    return Array.from({ length: cols }, (_, i) =>
      Array.from({ length: rows }, (_, j) =>
        (i === 0 || i === cols - 1 || j === 0 || j === rows - 1 || random() < wallChance) ? 1 : 0
      )
    );
  }

  _placeStairs(grid, cols, rows) {
    const sx = floor(random(cols / 2, cols - 2));
    const sy = floor(random(rows / 2, rows - 2));
    grid[sx][sy] = 0;
    return new GridEntity(sx, sy, 'stairs');
  }

  _placeItems(grid, cols, rows, level, stairs) {
    const items = [];
    for (let i = 0, n = 4 + level; i < n; i++) {
      const cell = this._pickFloor(grid, cols, rows);
      if (!cell || (cell.x === stairs.x && cell.y === stairs.y)) continue;
      const roll = random();
      const entry = ITEM_TABLE.find(e => roll < e.cutoff);
      items.push(new ItemEntity(cell.x, cell.y, entry.kind, entry.amt(level)));
    }
    return items;
  }

  _placeEnemies(grid, cols, rows, level) {
    const enemies = [];
    for (let i = 0, n = floor(2 + level * 1.5); i < n; i++) {
      const cell = this._pickFloor(grid, cols, rows, 3);
      if (!cell) continue;
      const r = random();
      const kind = r < 0.60 ? 'skull' : (r < 0.85 ? 'brute' : 'archer');
      enemies.push(new EnemyEntity(cell.x, cell.y, kind));
    }
    return enemies;
  }

  _pickFloor(grid, cols, rows, minCoord = 1) {
    for (let i = 0; i < 25; i++) {
      const x = floor(random(minCoord, cols - 1));
      const y = floor(random(minCoord, rows - 1));
      if (grid[x]?.[y] === 0) return { x, y };
    }
    return null;
  }
}

// ─── Renderer ────────────────────────────────────────────────

class Renderer {
  constructor(game) { this.game = game; }

  // Shared coordinate setup for all sprite methods.
  _cell(gc, gr) {
    const px = gc * CELL_SIZE, py = STATS_H + gr * CELL_SIZE, s = CELL_SIZE;
    return { px, py, s, cx: px + s / 2, cy: py + s / 2 };
  }

  drawFrame() {
    background(255);
    if (this.game.gameOver) return this._drawGameOver();
    this._drawStats();
    this._drawGrid();
    this._drawMoveHints();
    this._drawEntities();
    this._drawStatusBar();
  }

  _drawStats() {
    const g = this.game;
    fill(0); noStroke(); rect(0, 0, width, STATS_H);
    fill(255); textSize(18); textAlign(LEFT, CENTER);

    const hearts = '♥'.repeat(g.player.hp);
    const torch = g.torchMovesRemaining > 0 ? g.torchMovesRemaining : '-';
    text(`  ${hearts} | Level ${g.level} | £${g.player.gold} | W:${g.player.weaponTier} | T:${torch}`, 0, STATS_H / 2);
  }

  _drawGrid() {
    const g = this.game;
    for (let i = 0; i < g.cols; i++) {
      for (let j = 0; j < g.rows; j++) {
        const x = i * CELL_SIZE, y = STATS_H + j * CELL_SIZE;
        const vis = g.isVisible(i, j), disc = g.isDiscovered(i, j);
        const isWall = g.grid[i][j] === 1;

        // Undiscovered or wall → black fill; visible floor → no fill; discovered floor → white fill
        if (!vis && !disc) {
          fill(0); noStroke();
        } else if (isWall) {
          fill(0); noStroke();
        } else if (vis) {
          noFill(); stroke(0); strokeWeight(1);
        } else {
          fill(255); stroke(0); strokeWeight(1);
        }
        rect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  _drawMoveHints() {
    const moves = this.game.getValidMoves().filter(m => this.game.isVisible(m.nx, m.ny));
    noFill(); stroke(0); strokeWeight(3);
    for (const m of moves) {
      rect(m.nx * CELL_SIZE + 6, STATS_H + m.ny * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12);
    }
  }

  _drawEntities() {
    const g = this.game;

    if (g.isVisible(g.stairs.x, g.stairs.y)) this._drawStairs(g.stairs.x, g.stairs.y);

    const itemSprites = { gold: '_drawGold', potion: '_drawPotion', weapon: '_drawWeapon', torch: '_drawTorch' };
    for (const item of g.items) {
      if (g.isVisible(item.x, item.y) && itemSprites[item.kind]) this[itemSprites[item.kind]](item.x, item.y);
    }

    for (const e of g.enemies) {
      if (g.isVisible(e.x, e.y)) {
        if (e.kind === 'brute') this._drawBrute(e.x, e.y);
        else if (e.kind === 'archer') this._drawArcher(e.x, e.y);
        else this._drawSkull(e.x, e.y);
      }
    }

    this._drawPlayer(g.player.x, g.player.y);
  }

  _drawStatusBar() {
    fill(255); noStroke(); rect(0, height - MSG_H, width, MSG_H);
    fill(0); textSize(17); textAlign(LEFT, CENTER);
    text(`  ${this.game.statusMsg}`, 0, height - MSG_H / 2);
  }

  _drawGameOver() {
    const g = this.game;
    fill(255); noStroke(); rect(0, 0, width, height);
    fill(0); textAlign(CENTER, CENTER);
    textSize(34); text('DUNGEON CLAIMS ANOTHER SOUL', width / 2, height / 2 - 50);
    textSize(22); text(`Level ${g.level} | Gold: $${g.player.gold}`, width / 2, height / 2 + 10);
    textSize(18); text('Tap anywhere or press any key to restart', width / 2, height / 2 + 60);
  }

  _drawPlayer(gc, gr) {
    const { px, py, s, cx, cy } = this._cell(gc, gr);
    fill(0); noStroke();
    arc(cx, cy - s * 0.21, s * 0.34, s * 0.34, PI, TWO_PI);
    rect(px + s * 0.26, py + s * 0.30, s * 0.48, s * 0.07);
    fill(255); ellipse(cx, cy - s * 0.09, s * 0.20, s * 0.18);
    fill(0);
    beginShape();
    vertex(cx - s * 0.24, cy); vertex(cx + s * 0.24, cy);
    vertex(cx + s * 0.17, cy + s * 0.22); vertex(cx - s * 0.17, cy + s * 0.22);
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

  _drawSkull(gc, gr) {
    const { px, py, s, cx, cy } = this._cell(gc, gr);
    fill(0); noStroke();
    arc(cx, cy - s * 0.06, s * 0.48, s * 0.48, PI, TWO_PI);
    rect(px + s * 0.26, py + s * 0.40, s * 0.48, s * 0.24);
    fill(255);
    ellipse(cx - s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);
    ellipse(cx + s * 0.10, cy - s * 0.10, s * 0.16, s * 0.16);
    rect(cx - s * 0.03, cy + s * 0.06, s * 0.06, s * 0.07);
    for (const off of [0.31, 0.44, 0.57]) rect(px + s * off, py + s * 0.56, s * 0.07, s * 0.10);
  }

  _drawArcher(gc, gr) {
    const { px, py, s, cx, cy } = this._cell(gc, gr);
    fill(0); noStroke();
    triangle(cx, py + s * 0.1, px + s * 0.8, py + s * 0.8, px + s * 0.2, py + s * 0.8);
    fill(255);
    rect(cx - s * 0.15, cy + s * 0.05, s * 0.3, s * 0.08);
    stroke(0); noFill(); strokeWeight(3);
    arc(px + s * 0.7, cy + s * 0.1, s * 0.4, s * 0.4, -PI/2, PI/2);
    line(px + s * 0.7, cy - s * 0.1, px + s * 0.7, cy + s * 0.3);
    noStroke();
  }

  _drawBrute(gc, gr) {
    const { px, py, s } = this._cell(gc, gr);
    fill(0); noStroke();
    rect(px + s * 0.16, py + s * 0.20, s * 0.68, s * 0.60);
    fill(255);
    rect(px + s * 0.28, py + s * 0.34, s * 0.14, s * 0.10);
    rect(px + s * 0.58, py + s * 0.34, s * 0.14, s * 0.10);
    rect(px + s * 0.34, py + s * 0.58, s * 0.32, s * 0.08);
  }

  _drawStairs(gc, gr) {
    const { px, py, s } = this._cell(gc, gr);
    fill(0); noStroke();
    const stepH = s * 0.13, startX = px + s * 0.12, startY = py + s * 0.20, fullW = s * 0.76;
    for (let i = 0; i < 4; i++) {
      rect(startX + i * (fullW / 4), startY + i * (stepH + s * 0.03), fullW - i * (fullW / 4), stepH);
    }
    const ax = px + s * 0.50, ay = py + s * 0.82;
    strokeWeight(3); stroke(0); noFill();
    line(ax - s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
    line(ax + s * 0.14, ay - s * 0.10, ax, ay + s * 0.06);
    noStroke();
  }

  _drawGold(gc, gr) {
    const { s, cx, cy } = this._cell(gc, gr);
    fill(0); noStroke(); ellipse(cx, cy, s * 0.54, s * 0.54);
    fill(255); ellipse(cx, cy, s * 0.36, s * 0.36);
    fill(0);   ellipse(cx, cy, s * 0.14, s * 0.14);
    fill(255); arc(cx - s * 0.08, cy - s * 0.08, s * 0.10, s * 0.10, PI, TWO_PI);
  }

  _drawPotion(gc, gr) {
    const { px, py, s } = this._cell(gc, gr);
    fill(0); noStroke();
    rect(px + s * 0.34, py + s * 0.16, s * 0.32, s * 0.14);
    rect(px + s * 0.24, py + s * 0.30, s * 0.52, s * 0.48);
    fill(255); rect(px + s * 0.33, py + s * 0.42, s * 0.34, s * 0.24);
  }

  _drawWeapon(gc, gr) {
    const { px, py, s } = this._cell(gc, gr);
    stroke(0); strokeWeight(4); noFill();
    line(px + s * 0.25, py + s * 0.75, px + s * 0.75, py + s * 0.25);
    line(px + s * 0.20, py + s * 0.80, px + s * 0.35, py + s * 0.65);
    line(px + s * 0.65, py + s * 0.35, px + s * 0.80, py + s * 0.20);
    noStroke();
  }

  _drawTorch(gc, gr) {
    const { px, py, s, cx } = this._cell(gc, gr);
    fill(0); noStroke();
    rect(cx - s * 0.05, py + s * 0.26, s * 0.10, s * 0.42);
    rect(cx - s * 0.10, py + s * 0.64, s * 0.20, s * 0.08);
    fill(255);
    beginShape();
    vertex(cx, py + s * 0.12); vertex(cx + s * 0.12, py + s * 0.28);
    vertex(cx, py + s * 0.34); vertex(cx - s * 0.12, py + s * 0.28);
    endShape(CLOSE);
  }

  // Legacy aliases for test compatibility
  drawPlayerSprite(gc, gr) { this._drawPlayer(gc, gr); }
  drawEnemySprite(gc, gr)  { this._drawSkull(gc, gr); }
  drawStairsSprite(gc, gr) { this._drawStairs(gc, gr); }
  drawGoldSprite(gc, gr)   { this._drawGold(gc, gr); }
}

// ─── Game ────────────────────────────────────────────────────

class DungeonGame {
  constructor() {
    this.cols = 0; this.rows = 0; this.grid = [];
    this.level = 1;
    this.player = new PlayerEntity();
    this.enemies = []; this.items = [];
    this.stairs = new GridEntity(0, 0, 'stairs');
    this.statusMsg = '';
    this.gameOver = false;
    this.torchMovesRemaining = 0;
    this.discovered = [];
    this._bootShown = false;
    this._gen = new LevelGenerator();
    this.renderer = new Renderer(this);
    this.canvas = null;
  }

  setup() {
    pixelDensity(1); noSmooth();
    this.canvas = createCanvas(windowWidth, windowHeight);
    this.canvas.attribute('role', 'application');
    this.canvas.attribute('aria-label', 'Dungeon roguelike. Tap a highlighted adjacent cell to move, diagonals are allowed, or use keyboard.');
    this.canvas.attribute('tabindex', '0');
    this.canvas.style('touch-action', 'none');
    this.canvas.elt.addEventListener('pointerdown', (e) => {
      const r = this.canvas.elt.getBoundingClientRect();
      this.handleTapAt(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    }, { passive: false });
    noLoop(); textFont('monospace');
    this._recalc();
    this._genLevel();
  }

  _recalc() {
    this.cols = ceil(width / CELL_SIZE);
    this.rows = floor((height - STATS_H - MSG_H) / CELL_SIZE);
  }

  _genLevel() {
    const d = this._gen.generate(this.level, this.cols, this.rows, this.player);
    Object.assign(this, { grid: d.grid, stairs: d.stairs, items: d.items, enemies: d.enemies });
    this.discovered = Array.from({ length: this.cols }, () => Array(this.rows).fill(false));
    this._reveal();
    this.statusMsg = this._bootShown ? `Level ${this.level}` : `${APP_VERSION} | Level ${this.level}`;
    this._bootShown = true;
    this.gameOver = false;
  }

  _restart() {
    this.player.reset();
    this.level = 1;
    this.torchMovesRemaining = 0;
    this._genLevel();
    redraw();
  }

  draw() { this.renderer.drawFrame(); }

  getValidMoves() {
    return DIRECTIONS
      .map(d => ({ dx: d.dx, dy: d.dy, nx: this.player.x + d.dx, ny: this.player.y + d.dy }))
      .filter(m => this._walkable(m.nx, m.ny));
  }

  move(dx, dy) {
    if (this.gameOver) return;
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (!this._walkable(nx, ny)) return;

    // Combat
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.x === nx && e.y === ny) {
        this.enemies.splice(i, 1);
        const dmg = max(1, e.spec.hpDamage - this.player.weaponTier);
        this.player.hp -= dmg;
        this.statusMsg = this.player.hp <= 0
          ? (this.gameOver = true, 'You have been defeated...')
          : `Defeated ${e.kind}. HP remaining: ${this.player.hp}`;
        return void redraw();
      }
    }

    // Item pickup
    let pickedUp = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.x === nx && item.y === ny) {
        const def = ITEM_DEFS[item.kind];
        def.apply(item, this);
        this.statusMsg = def.msg(item, this);
        this.items.splice(i, 1);
        pickedUp = true;
      }
    }

    // Stairs
    if (nx === this.stairs.x && ny === this.stairs.y) {
      this.level++;
      this._genLevel();
      return void redraw();
    }

    this.player.x = nx; this.player.y = ny;
    this._consumeTorch();
    this._reveal();
    if (!pickedUp) this.statusMsg = '';
    this._moveEnemies();
    redraw();
  }

  _clearLine(x0, y0, x1, y1) {
    let dx = abs(x1 - x0), dy = abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while(true) {
      if (this.grid[x0][y0] === 1) return false;
      if (x0 === x1 && y0 === y1) return true;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  _moveEnemies() {
    let rangedMsg = '';
    for (const e of this.enemies) {
      if (dist(e.x, e.y, this.player.x, this.player.y) > e.spec.aggroRange) continue;

      if (e.spec.isRanged) {
        if (dist(e.x, e.y, this.player.x, this.player.y) <= e.spec.range) {
          if (this._clearLine(e.x, e.y, this.player.x, this.player.y)) {
            this.player.hp -= e.spec.hpDamage;
            rangedMsg = `Shot by ${e.kind}! `;
            if (this.player.hp <= 0) this.gameOver = true;
          }
        }
        continue;
      }

      if (random() > e.spec.moveChance) continue;
      const dx = Math.sign(this.player.x - e.x);
      const dy = Math.sign(this.player.y - e.y);
      if      (this._walkable(e.x + dx, e.y))      e.x += dx;
      else if (this._walkable(e.x, e.y + dy))      e.y += dy;
      else if (this._walkable(e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; }
    }
    if (this.gameOver) this.statusMsg = 'You have been defeated...';
    else if (rangedMsg) this.statusMsg = rangedMsg + this.statusMsg;
  }

  _walkable(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && this.grid[x][y] === 0;
  }

  getVisionRadius() {
    return this.torchMovesRemaining > 0 ? TORCH_VISION_RADIUS : BASE_VISION_RADIUS;
  }

  isVisible(x, y) {
    const r = this.getVisionRadius();
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows
      && abs(x - this.player.x) <= r && abs(y - this.player.y) <= r;
  }

  isDiscovered(x, y) {
    return !!(this.discovered[x]?.[y]);
  }

  _reveal() {
    const r = this.getVisionRadius(), px = this.player.x, py = this.player.y;
    for (let x = px - r; x <= px + r; x++) {
      for (let y = py - r; y <= py + r; y++) {
        if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.discovered[x][y] = true;
      }
    }
  }

  _consumeTorch() {
    if (this.torchMovesRemaining <= 0) return;
    if (--this.torchMovesRemaining === 0) this.statusMsg = 'Torch burned out. Vision back to normal.';
  }

  handleTapAt(px, py) {
    if (this.gameOver) return this._restart(), false;
    const gx = floor(px / CELL_SIZE), gy = floor((py - STATS_H) / CELL_SIZE);
    const m = this.getValidMoves().find(m => m.nx === gx && m.ny === gy);
    if (m) { this.move(m.dx, m.dy); return false; }
    this.statusMsg = `Tap a highlighted adjacent cell (diagonals allowed). Last tap: ${gx},${gy}`;
    redraw();
    return false;
  }

  keyPressed() {
    if (this.gameOver) return this._restart(), false;
    const dir = KEY_MAP[key] || KEY_MAP[
      keyCode === UP_ARROW ? 'ArrowUp' : keyCode === DOWN_ARROW ? 'ArrowDown'
      : keyCode === LEFT_ARROW ? 'ArrowLeft' : keyCode === RIGHT_ARROW ? 'ArrowRight' : ''
    ];
    if (dir) this.move(...dir);
    return false;
  }

  windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    this._recalc();
    this._genLevel();
  }
}

// ─── p5 lifecycle ────────────────────────────────────────────

function publishApi() {
  window.dungeon = {
    getGame: () => game,
    move: (dx, dy) => game?.move(dx, dy),
    getValidMoves: () => game?.getValidMoves() ?? [],
    handleTapAt: (px, py) => game?.handleTapAt(px, py) ?? false
  };
}

publishApi();

function setup()         { game = new DungeonGame(); game.setup(); publishApi(); }
function draw()          { game?.draw(); }
function mousePressed()  { return game?.handleTapAt(mouseX, mouseY) ?? false; }
function touchStarted()  { return game?.handleTapAt(mouseX, mouseY) ?? false; }
function keyPressed()    { return game?.keyPressed() ?? false; }
function windowResized() { game?.windowResized(); }
