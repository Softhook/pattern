/**
 * kindle-scribe-tests.js
 * Browser-console tests for the dungeon sketch.
 *
 * How to run:
 * 1. Open index.html in a browser.
 * 2. Open DevTools Console.
 * 3. Paste this file and press Enter.
 */

(function KindleScribeTests() {
  'use strict';

  let passed = 0;
  let failed = 0;

  function assert(condition, description, detail) {
    if (condition) {
      console.log(`%c PASS %c ${description}`, 'color:green;font-weight:bold', 'color:inherit');
      passed++;
    } else {
      const suffix = detail ? ` -- ${detail}` : '';
      console.warn(`%c FAIL %c ${description}${suffix}`, 'color:red;font-weight:bold', 'color:inherit');
      failed++;
    }
  }

  function getGame() {
    return window.dungeon && typeof window.dungeon.getGame === 'function'
      ? window.dungeon.getGame()
      : null;
  }

  // 1) Core constants
  assert(typeof CELL_SIZE !== 'undefined', '[Config] CELL_SIZE is defined');
  assert(typeof STATS_H !== 'undefined', '[Config] STATS_H is defined');
  assert(typeof MSG_H !== 'undefined', '[Config] MSG_H is defined');
  assert(CELL_SIZE >= 44, '[A11y] CELL_SIZE is at least 44 px', `CELL_SIZE=${CELL_SIZE}`);

  // 2) Canvas and accessibility attributes
  const canvas = document.querySelector('canvas');
  assert(canvas !== null, '[HTML] Canvas exists');
  assert(canvas && canvas.getAttribute('role') === 'application', '[A11y] Canvas has role=application');
  assert(canvas && (canvas.getAttribute('aria-label') || '').length > 10, '[A11y] Canvas has descriptive aria-label');
  assert(canvas && canvas.getAttribute('tabindex') === '0', '[A11y] Canvas is keyboard focusable');

  // 3) Viewport
  const viewport = document.querySelector('meta[name="viewport"]');
  assert(viewport !== null, '[HTML] Viewport meta exists');
  assert(viewport && viewport.content.includes('user-scalable=no'), '[Kindle] Viewport disables pinch zoom');

  // 4) Input handlers
  assert(typeof mousePressed === 'function', '[Input] mousePressed exists');
  assert(typeof touchStarted === 'function', '[Input] touchStarted exists');
  assert(typeof keyPressed === 'function', '[Input] keyPressed exists');
  assert(typeof windowResized === 'function', '[Input] windowResized exists');

  // 5) Public runtime API
  assert(typeof window.dungeon === 'object', '[API] window.dungeon is exposed');
  assert(window.dungeon && typeof window.dungeon.getGame === 'function', '[API] getGame() exists');
  assert(window.dungeon && typeof window.dungeon.move === 'function', '[API] move(dx,dy) exists');
  assert(window.dungeon && typeof window.dungeon.getValidMoves === 'function', '[API] getValidMoves() exists');
  assert(window.dungeon && typeof window.dungeon.handleTapAt === 'function', '[API] handleTapAt(px,py) exists');

  const game = getGame();
  assert(game !== null, '[State] Game instance is available');

  // 6) No blocking dialogs
  const srcText = Array.from(document.scripts).map((s) => s.textContent || '').join('\n');
  assert(!srcText.includes('alert('), '[A11y] No alert() calls in inline scripts');

  // 7) Movement model
  if (game) {
    const moves = window.dungeon.getValidMoves();
    assert(Array.isArray(moves), '[Input] getValidMoves returns array');

    if (moves.length > 0) {
      const m = moves[0];
      assert('dx' in m && 'dy' in m && 'nx' in m && 'ny' in m, '[Input] Move object has dx/dy/nx/ny');
    } else {
      console.warn('%c SKIP %c No valid moves from current position', 'color:orange;font-weight:bold', 'color:inherit');
    }

    // Diagonal movement: set up a controlled local area, then restore state.
    const originalPos = { x: game.player.x, y: game.player.y };
    const tx = Math.min(Math.max(2, originalPos.x), game.cols - 3);
    const ty = Math.min(Math.max(2, originalPos.y), game.rows - 3);

    let diagonalTested = false;

    if (game.grid[tx] && game.grid[tx + 1] && game.grid[tx - 1]) {
      const saved = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          saved.push({ x: tx + dx, y: ty + dy, value: game.grid[tx + dx][ty + dy] });
          game.grid[tx + dx][ty + dy] = 0;
        }
      }

      const target = { x: tx + 1, y: ty + 1 };

      const enemyAtTarget = game.enemies.find((e) => e.x === target.x && e.y === target.y);
      const itemAtTarget = game.items.find((i) => i.x === target.x && i.y === target.y);
      const stairsAtTarget = game.stairs.x === target.x && game.stairs.y === target.y;

      const enemySaved = enemyAtTarget ? { x: enemyAtTarget.x, y: enemyAtTarget.y } : null;
      const itemSaved = itemAtTarget ? { x: itemAtTarget.x, y: itemAtTarget.y } : null;
      const stairsSaved = { x: game.stairs.x, y: game.stairs.y };

      if (enemyAtTarget) {
        enemyAtTarget.x = tx - 1;
        enemyAtTarget.y = ty - 1;
      }
      if (itemAtTarget) {
        itemAtTarget.x = tx - 1;
        itemAtTarget.y = ty;
      }
      if (stairsAtTarget) {
        game.stairs.x = tx;
        game.stairs.y = ty - 1;
      }

      game.player.x = tx;
      game.player.y = ty;
      game.gameOver = false;

      window.dungeon.move(1, 1);
      const diagonalWorked = game.player.x === target.x && game.player.y === target.y;
      assert(diagonalWorked, '[Input] Diagonal movement works (dx=1, dy=1)');
      diagonalTested = true;

      // Restore local mutations
      for (const cell of saved) {
        game.grid[cell.x][cell.y] = cell.value;
      }
      if (enemyAtTarget && enemySaved) {
        enemyAtTarget.x = enemySaved.x;
        enemyAtTarget.y = enemySaved.y;
      }
      if (itemAtTarget && itemSaved) {
        itemAtTarget.x = itemSaved.x;
        itemAtTarget.y = itemSaved.y;
      }
      game.stairs.x = stairsSaved.x;
      game.stairs.y = stairsSaved.y;
      game.player.x = originalPos.x;
      game.player.y = originalPos.y;
    }

    if (!diagonalTested) {
      console.warn('%c SKIP %c Could not construct a safe diagonal test area', 'color:orange;font-weight:bold', 'color:inherit');
    }

    // State presence
    assert(typeof game.gameOver === 'boolean', '[State] gameOver flag is boolean');
    assert(typeof game.statusMsg === 'string', '[State] statusMsg exists');
    assert(typeof game.level === 'number', '[State] level is numeric');

    // Sprite draw methods remain available on renderer.
    assert(game.renderer && typeof game.renderer.drawPlayerSprite === 'function', '[Sprite] drawPlayerSprite exists');
    assert(game.renderer && typeof game.renderer.drawEnemySprite === 'function', '[Sprite] drawEnemySprite exists');
    assert(game.renderer && typeof game.renderer.drawStairsSprite === 'function', '[Sprite] drawStairsSprite exists');
    assert(game.renderer && typeof game.renderer.drawGoldSprite === 'function', '[Sprite] drawGoldSprite exists');
  }

  // 8) Pixel density/layout sanity
  if (canvas) {
    const canvasCSSWidth = canvas.offsetWidth;
    const canvasAttrWidth = parseInt(canvas.getAttribute('width') || '0', 10);
    assert(canvasAttrWidth <= canvasCSSWidth * 1.1, '[Kindle] pixelDensity(1) buffer width is close to CSS width');
  }

  const total = passed + failed;
  const color = failed === 0 ? 'color:green;font-weight:bold' : 'color:red;font-weight:bold';
  console.log(`%c\\n-- Kindle Scribe Tests: ${passed} / ${total} passed --`, color);
})();
