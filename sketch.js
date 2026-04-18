'use strict';

const APP_VERSION = 'v2.0.0';
const CELL_SIZE = 72;
const STATS_H = 68;
const MSG_H = 50;
const BASE_VISION_RADIUS = 2;
const TORCH_VISION_RADIUS = 3;
const TORCH_DURATION_MOVES = 30;

const DIRECTIONS = [
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
];

const ENEMY_DEFS = {
  skull: {
    hpDamage: 1,
    aggroRange: 6,
    moveChance: 0.7
  },
  brute: {
    hpDamage: 2,
    aggroRange: 4,
    moveChance: 0.5
  }
};

const ITEM_DEFS = {
  gold: {
    pickupMessage: (item, game) => `Picked up ${item.amount} gold!`
  },
  potion: {
    pickupMessage: (item, game, healed) => `Drank potion (+${healed} HP)`
  },
  weapon: {
    pickupMessage: (_item, game) => `Found weapon ${game.player.weaponTier}.`
  },
  torch: {
    pickupMessage: (_item, _game) => `Lit torch! Vision +1 for ${TORCH_DURATION_MOVES} moves.`
  }
};

let game = null;

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
      } else if (roll < 0.96) {
        items.push(new ItemEntity(floorCell.x, floorCell.y, 'weapon', 1));
      } else {
        items.push(new ItemEntity(floorCell.x, floorCell.y, 'torch', 1));
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

    this.drawMoveHints();
    this.drawEntitiesNice();

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

    const torchStatus = g.torchMovesRemaining > 0 ? g.torchMovesRemaining : '-';
    text(`  ${hearts} | Level ${g.level} | £${g.player.gold} | W:${g.player.weaponTier} | T:${torchStatus}`, 0, STATS_H / 2);
  }

  drawGrid() {
    const g = this.game;
    for (let i = 0; i < g.cols; i++) {
      for (let j = 0; j < g.rows; j++) {
        const x = i * CELL_SIZE;
        const y = STATS_H + j * CELL_SIZE;

        const isVisible = g.isVisibleCell(i, j);
        const isDiscovered = g.isDiscoveredCell(i, j);
        const isWall = g.grid[i][j] === 1;

        if (isVisible) {
          if (isWall) {
            fill(0); noStroke();
            rect(x, y, CELL_SIZE, CELL_SIZE);
          } else {
            noFill(); stroke(0); strokeWeight(1);
            rect(x, y, CELL_SIZE, CELL_SIZE);
          }
          continue;
        }

        if (isDiscovered) {
          if (isWall) {
            fill(0); noStroke();
            rect(x, y, CELL_SIZE, CELL_SIZE);
          } else {
            fill(255); stroke(0); strokeWeight(1);
            rect(x, y, CELL_SIZE, CELL_SIZE);
          }
          continue;
        }

        fill(0); noStroke();
        rect(x, y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  drawMoveHints() {
    const moves = this.game.getValidMoves().filter((m) => this.game.isVisibleCell(m.nx, m.ny));
    noFill();

    for (const m of moves) {
      const isDiagonal = abs(m.dx) === 1 && abs(m.dy) === 1;
      stroke(0);
      strokeWeight(3);
      const x = m.nx * CELL_SIZE + 6;
      const y = STATS_H + m.ny * CELL_SIZE + 6;
      rect(x, y, CELL_SIZE - 12, CELL_SIZE - 12);
    }
  }

  drawEntitiesNice() {
    if (this.game.isVisibleCell(this.game.stairs.x, this.game.stairs.y)) {
      this.drawStairsSprite(this.game.stairs.x, this.game.stairs.y);
    }

    for (const item of this.game.items) {
      if (!this.game.isVisibleCell(item.x, item.y)) continue;
      if (item.kind === 'gold') this.drawGoldSprite(item.x, item.y);
      if (item.kind === 'potion') this.drawPotionSprite(item.x, item.y);
      if (item.kind === 'weapon') this.drawWeaponSprite(item.x, item.y);
      if (item.kind === 'torch') this.drawTorchSprite(item.x, item.y);
    }

    for (const enemy of this.game.enemies) {
      if (!this.game.isVisibleCell(enemy.x, enemy.y)) continue;
      if (enemy.kind === 'brute') this.drawBruteSprite(enemy.x, enemy.y);
      else this.drawEnemySprite(enemy.x, enemy.y);
    }

    this.drawPlayerSprite(this.game.player.x, this.game.player.y);
  }

  drawStatusBar() {
    const g = this.game;
    fill(255); noStroke();
    rect(0, height - MSG_H, width, MSG_H);
    fill(0); textSize(17); textAlign(LEFT, CENTER);
    text(`  ${g.statusMsg}`, 0, height - MSG_H + MSG_H / 2);
  }

  drawGameOver() {
    const g = this.game;
    fill(255); noStroke();
    rect(0, 0, width, height);
    fill(0); textAlign(CENTER, CENTER);
    textSize(34);
    text('DUNGEON CLAIMS ANOTHER SOUL', width / 2, height / 2 - 50);
    textSize(22);
    text(`Level ${g.level} | Gold: $${g.player.gold}`, width / 2, height / 2 + 10);
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

  drawTorchSprite(gc, gr) {
    const px = gc * CELL_SIZE;
    const py = STATS_H + gr * CELL_SIZE;
    const s = CELL_SIZE;
    const cx = px + s / 2;

    fill(0); noStroke();
    rect(cx - s * 0.05, py + s * 0.26, s * 0.10, s * 0.42);
    rect(cx - s * 0.10, py + s * 0.64, s * 0.20, s * 0.08);

    fill(255);
    beginShape();
    vertex(cx, py + s * 0.12);
    vertex(cx + s * 0.12, py + s * 0.28);
    vertex(cx, py + s * 0.34);
    vertex(cx - s * 0.12, py + s * 0.28);
    endShape(CLOSE);
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
    this.statusMsg = '';
    this.gameOver = false;
    this.torchMovesRemaining = 0;
    this.discovered = [];
    this.hasShownBootVersion = false;

    this.levelGenerator = new LevelGenerator();
    this.renderer = new Renderer(this);
    this.canvas = null;
  }

  setup() {
    pixelDensity(1);
    noSmooth();

    this.canvas = createCanvas(windowWidth, windowHeight);

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
    this.discovered = this.createDiscoveredGrid();
    this.revealAroundPlayer();
    if (!this.hasShownBootVersion) {
      this.statusMsg = `${APP_VERSION} | Level ${this.level}`;
      this.hasShownBootVersion = true;
    } else {
      this.statusMsg = `Level ${this.level}`;
    }
    this.gameOver = false;
  }

  draw() {
    this.renderer.drawFrame();
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
    this.consumeTorchChargeIfActive();
    this.revealAroundPlayer();

    if (!this.statusMsg.startsWith('Picked')
      && !this.statusMsg.startsWith('Drank')
      && !this.statusMsg.startsWith('Found')
      && !this.statusMsg.startsWith('Lit torch')
      && !this.statusMsg.startsWith('Torch burned out')) {
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
      return;
    }

    if (item.kind === 'torch') {
      this.torchMovesRemaining = TORCH_DURATION_MOVES;
      this.statusMsg = ITEM_DEFS.torch.pickupMessage(item, this);
      this.revealAroundPlayer();
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

  createDiscoveredGrid() {
    const cells = [];
    for (let i = 0; i < this.cols; i++) {
      cells[i] = [];
      for (let j = 0; j < this.rows; j++) {
        cells[i][j] = false;
      }
    }
    return cells;
  }

  getVisionRadius() {
    return this.torchMovesRemaining > 0 ? TORCH_VISION_RADIUS : BASE_VISION_RADIUS;
  }

  isVisibleCell(x, y) {
    const radius = this.getVisionRadius();
    return x >= 0
      && y >= 0
      && x < this.cols
      && y < this.rows
      && abs(x - this.player.x) <= radius
      && abs(y - this.player.y) <= radius;
  }

  isDiscoveredCell(x, y) {
    return !!(this.discovered[x] && this.discovered[x][y]);
  }

  revealAroundPlayer() {
    const radius = this.getVisionRadius();
    for (let x = this.player.x - radius; x <= this.player.x + radius; x++) {
      for (let y = this.player.y - radius; y <= this.player.y + radius; y++) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        this.discovered[x][y] = true;
      }
    }
  }

  consumeTorchChargeIfActive() {
    if (this.torchMovesRemaining <= 0) return;
    this.torchMovesRemaining = max(0, this.torchMovesRemaining - 1);
    if (this.torchMovesRemaining === 0) {
      this.statusMsg = 'Torch burned out. Vision back to normal.';
    }
  }

  finishTurn() {
    redraw();
  }

  handleTapAt(px, py) {
    if (this.gameOver) {
      this.player.resetForNewRun();
      this.level = 1;
      this.torchMovesRemaining = 0;
      this.generateLevel();
      redraw();
      return false;
    }

    const gx = floor(px / CELL_SIZE);
    const gy = floor((py - STATS_H) / CELL_SIZE);

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
      this.torchMovesRemaining = 0;
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
}

function publishApi() {
  window.dungeon = {
    getGame: () => game,
    move: (dx, dy) => game && game.move(dx, dy),
    getValidMoves: () => game ? game.getValidMoves() : [],
    handleTapAt: (px, py) => game ? game.handleTapAt(px, py) : false
  };
}

// Publish immediately so tests/debug tooling can detect the API even before p5 setup.
publishApi();

// p5 lifecycle wrappers.
function setup() {
  game = new DungeonGame();
  game.setup();
  publishApi();
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
