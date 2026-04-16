let grid = [];
let cols, rows;
let cellSize = 60; 
let player = { x: 1, y: 1, hp: 5, gold: 0 };
let enemies = [];
let goldItems = [];
let stairs = { x: 0, y: 0 };
let level = 1;

function setup() {
  pixelDensity(1); // Crucial for Kindle performance
  createCanvas(windowWidth, windowHeight);
  noLoop();
  
  // Calculate grid to fill most of the screen, leaving ~180px for buttons/stats
  cols = floor(width / cellSize);
  rows = floor((height - 180) / cellSize); 
  
  generateLevel();
}

function generateLevel() {
  // Use a combination of level and a base seed for variety
  randomSeed(999 + level);
  grid = [];
  enemies = [];
  goldItems = [];
  
  // 1. Difficulty Scaling: Increase wall density slightly per level (capped at 30%)
  let wallChance = min(0.15 + (level * 0.02), 0.30);
  
  for (let i = 0; i < cols; i++) {
    grid[i] = [];
    for (let j = 0; j < rows; j++) {
      if (i === 0 || i === cols - 1 || j === 0 || j === rows - 1) {
        grid[i][j] = 1; // Perimeter walls
      } else {
        grid[i][j] = random(1) < wallChance ? 1 : 0;
      }
    }
  }

  // 2. Clear Player Start Area
  player.x = 1; 
  player.y = 1;
  grid[1][1] = 0;
  grid[2][1] = 0;
  grid[1][2] = 0;

  // 3. Place Staircase (<) - Usually far from the start
  stairs.x = floor(random(cols / 2, cols - 1));
  stairs.y = floor(random(rows / 2, rows - 1));
  grid[stairs.x][stairs.y] = 0; 

  // 4. Place Gold ($) - More gold in deeper levels
  let goldCount = 3 + level;
  for (let i = 0; i < goldCount; i++) {
    let rx = floor(random(1, cols - 1));
    let ry = floor(random(1, rows - 1));
    if (grid[rx][ry] === 0 && (rx !== stairs.x || ry !== stairs.y)) {
      goldItems.push({ x: rx, y: ry });
    }
  }

  // 5. Place Enemies (E) - Increases by 1.5 per level
  let enemyCount = floor(2 + (level * 1.5));
  for (let i = 0; i < enemyCount; i++) {
    let rx = floor(random(3, cols - 1));
    let ry = floor(random(3, rows - 1));
    if (grid[rx][ry] === 0) enemies.push({ x: rx, y: ry });
  }
}

function draw() {
  background(255); // Full white clear to reduce ghosting

  // Draw Grid/Walls
  stroke(0);
  strokeWeight(2);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (grid[i][j] === 1) {
        fill(0);
        rect(i * cellSize, j * cellSize, cellSize, cellSize);
      } else {
        noFill();
        // Thin grid lines for floor reference
        stroke(230);
        rect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }

  // Draw Staircase (<) - Bold to stand out
  textAlign(CENTER, CENTER);
  fill(0);
  textSize(cellSize * 0.9);
  text("<", stairs.x * cellSize + cellSize/2, stairs.y * cellSize + cellSize/2);

  // Draw Gold ($)
  textSize(cellSize * 0.6);
  for (let g of goldItems) {
    text("$", g.x * cellSize + cellSize/2, g.y * cellSize + cellSize/2);
  }

  // Draw Enemies (E)
  for (let e of enemies) {
    fill(0);
    rect(e.x * cellSize + 8, e.y * cellSize + 8, cellSize - 16, cellSize - 16);
    fill(255);
    textSize(cellSize * 0.5);
    text("E", e.x * cellSize + cellSize/2, e.y * cellSize + cellSize/2);
  }

  // Draw Player (@)
  fill(0);
  textSize(cellSize * 0.8);
  text("@", player.x * cellSize + cellSize/2, player.y * cellSize + cellSize/2);

  drawUI();
}

function drawUI() {
  // Stats Bar
  fill(0);
  noStroke();
  rect(0, rows * cellSize, width, 50);
  fill(255);
  textSize(22);
  textAlign(LEFT, CENTER);
  text(` FLOOR: B${level}F  HP: ${player.hp}  GOLD: ${player.gold}`, 20, rows * cellSize + 25);
  
  // D-Pad Controls
  let cx = width / 2;
  let cy = height - 70;
  drawBtn(cx, cy - 55, "UP");
  drawBtn(cx, cy + 55, "DN");
  drawBtn(cx - 90, cy, "LF");
  drawBtn(cx + 90, cy, "RT");
}

function drawBtn(x, y, txt) {
  fill(255); stroke(0); strokeWeight(3);
  rectMode(CENTER);
  rect(x, y, 80, 50, 5);
  fill(0); noStroke();
  textSize(20);
  textAlign(CENTER, CENTER);
  text(txt, x, y);
  rectMode(CORNER);
}

function move(dx, dy) {
  if (player.hp <= 0) return;

  let nx = player.x + dx;
  let ny = player.y + dy;

  if (grid[nx][ny] === 1) return; // Wall hit

  // Combat Check
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].x === nx && enemies[i].y === ny) {
      enemies.splice(i, 1);
      player.hp--;
      if (player.hp <= 0) alert("Dungeon Claims Another Soul...");
      finishTurn();
      return;
    }
  }

  // Gold Check
  for (let i = goldItems.length - 1; i >= 0; i--) {
    if (goldItems[i].x === nx && goldItems[i].y === ny) {
      goldItems.splice(i, 1);
      player.gold += 5 + (level * 2);
    }
  }

  // Staircase Check
  if (nx === stairs.x && ny === stairs.y) {
    level++;
    generateLevel();
    redraw();
    return;
  }

  player.x = nx;
  player.y = ny;
  
  moveEnemies();
  finishTurn();
}

function moveEnemies() {
  for (let e of enemies) {
    // Only move if player is within range (aggro)
    if (dist(e.x, e.y, player.x, player.y) < 6) {
      let dx = player.x > e.x ? 1 : player.x < e.x ? -1 : 0;
      let dy = player.y > e.y ? 1 : player.y < e.y ? -1 : 0;
      
      // Simple pathfinding: try X then Y
      if (random() > 0.3) { // 70% chance to move (gives player a break)
        if (grid[e.x + dx][e.y] === 0) e.x += dx;
        else if (grid[e.x][e.y + dy] === 0) e.y += dy;
      }
    }
  }
}

function finishTurn() {
  redraw();
}

function mousePressed() {
  let cx = width / 2;
  let cy = height - 70;
  if (dist(mouseX, mouseY, cx, cy - 55) < 35) move(0, -1);
  if (dist(mouseX, mouseY, cx, cy + 55) < 35) move(0, 1);
  if (dist(mouseX, mouseY, cx - 90, cy) < 45) move(-1, 0);
  if (dist(mouseX, mouseY, cx + 90, cy) < 45) move(1, 0);
  return false;
}