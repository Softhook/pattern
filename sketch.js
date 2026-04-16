let step = 0;

function setup() {
  // Fixed size for testing on MacBook; change to windowWidth/Height for Scribe
  createCanvas(windowWidth, windowHeight);
  noLoop(); 
  
  // Visual settings
  strokeWeight(4);
  textSize(32);
}

function draw() {
  // 1. Clear the canvas (Crucial for E-ink to prevent ghosting)
  background(255); 

  // 2. Force the random generator to a specific state based on 'step'
  // If 'step' changes, the maze MUST change.
  randomSeed(step + 100); 
  
  // 3. Draw the Maze
  stroke(0);
  let spacing = 50; 
  for (let x = 0; x < width; x += spacing) {
    for (let y = 0; y < height; y += spacing) {
      if (random(1) > 0.5) {
        line(x, y, x + spacing, y + spacing);
      } else {
        line(x + spacing, y, x, y + spacing);
      }
    }
  }

  // 4. UI Overlay (high contrast for Scribe)
  noStroke();
  fill(0);
  rect(0, 0, 180, 50);
  fill(255);
  text("STEP: " + step, 15, 35);
  
  console.log("Redrew maze for step: " + step);
}

// mousePressed works on MacBook clicks AND Scribe taps
function mousePressed() {
  step++;
  redraw(); 
  return false; 
}