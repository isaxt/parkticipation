//HSV detection ranges (h:0-360, s:0-255, v:0-255)
const COLORS = {
  trash_can:      { label: 'Trash Can',      hex: '#111111' },
  subway_station: { label: 'Subway Station', hex: '#263818' },
  fountain:       { label: 'Fountain',       hex: '#004d99' },
  bench:          { label: 'Bench',          hex: '#6b3300' },
  concrete_tile:  { label: 'Concrete Tile',  hex: '#71777e' },
  grass_tile:     { label: 'Grass Tile',     hex: '#d0f9bb' },
  water_tile:     { label: 'Water Tile',     hex: '#a8d4f8' },
  dirt_tile:      { label: 'Dirt Tile',      hex: '#7c5131' },
  tree:           { label: 'Tree',           hex: '#107a5c' },
  reg_fence:      { label: 'Reg Fence',      hex: '#00ffaa' },
  lights_lamps:   { label: 'Lights/Lamps',   hex: '#ffd700' },
  dog_park:       { label: 'Dog Park',       hex: '#de7a4b' },
  spiked_fence:   { label: 'Spiked Fence',   hex: '#cc0000' },
  bathroom:       { label: 'Bathroom',       hex: '#aa7ae4' },
  playground:     { label: 'Playground',     hex: '#ff6fb7' },
  // test_pink:      { label: 'Test Pink',      hex: '#FFB3C6' },
};

const GRID               = 16; // sampling resolution
const DISPLAY            = 8;  // board/overlay tile resolution (each tile = 2×2 sample cells)
const STABILITY_THRESHOLD = 4;  // frames a classification must hold before committing

let tileGrid        = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
let objectGrid      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
let boardState      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
let tilePending     = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
let objectPending   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
let tileStability   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
let objectStability = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
let scanRound       = 0; // 0 = tiles, 1 = objects
let animId = null;
let blackThreshold = 35;
let satThreshold   = 30;
let brightness     = 100;
let contrast       = 100;
let showColors      = true;
let tilesScanning   = false;
let objectsScanning = false;

let video, overlay, overlayCtx, sampleCanvas, sampleCtx, boardEl;

// color math thanks random github gist: https://gist.github.com/mjackson/5311256

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 255, v: v * 255 };
}

// Round 1: tiles only
function classifyTile(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < 55 && h >= 185 && h <= 235 && v >= 120 && v < 205) return 'concrete_tile';
  if (h >= 90 && h <= 150 && s >= satThreshold && s < 120 && v > 185) return 'grass_tile';
  if (h >= 190 && h <= 222 && s >= satThreshold && s < 120 && v > 210) return 'water_tile';
  if (h >= 22 && h <= 48 && s >= 40 && s < 140 && v >= 130 && v < 220) return 'dirt_tile';
  // pastel pink test color — low-sat pink, kept below playground's s≥75 floor
  // if (h >= 325 && s >= 15 && s < 80 && v >= 200) return 'test_pink';
  return null;
}

// Round 2: objects only
function classifyObject(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < blackThreshold) return 'trash_can';
  if (h >= 88 && h <= 145 && s > 75 && v >= 20 && v < 85) return 'subway_station';
  if (h >= 198 && h <= 232 && s > 150 && v < 160) return 'fountain';
  if (h >= 18 && h <= 40 && s > 130 && v >= 40 && v < 140) return 'bench';
  if (h >= 100 && h <= 168 && s >= 150 && v >= 50 && v < 180) return 'tree';
  if (h >= 145 && h <= 178 && s >= 180 && v >= 180) return 'reg_fence';
  if (h >= 42 && h <= 68 && s >= 180 && v >= 180) return 'lights_lamps';
  if (h >= 15 && h <= 42 && s >= 160 && v >= 160) return 'dog_park';
  if ((h < 12 || h >= 348) && s >= 180 && v >= 90) return 'spiked_fence';
  if (h >= 255 && h <= 298 && s >= 115 && v >= 140) return 'bathroom';
  if (h >= 298 && h <= 348 && s >= 75 && v >= 180) return 'playground';
  return null;
}

function sampleCell(ctx, cx, cy, cw, ch) {
  const m = 0.2;
  const sx = Math.round(cx + cw * m);
  const sy = Math.round(cy + ch * m);
  const sw = Math.max(1, Math.round(cw * (1 - 2 * m)));
  const sh = Math.max(1, Math.round(ch * (1 - 2 * m)));
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let rSum = 0, gSum = 0, bSum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; n++;
  }
  return { r: rSum / n, g: gSum / n, b: bSum / n };
}

// Plurality vote over a 2×2 block of the raw 16×16 grid.
function voteBlock(rawGrid, tileRow, tileCol) {
  const counts = {};
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const key = rawGrid[tileRow * 2 + dr][tileCol * 2 + dc];
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }
  let best = null, bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

function processFrame() {
  animId = requestAnimationFrame(processFrame);
  if (!video || video.readyState < 2) return;

  const vw = video.videoWidth, vh = video.videoHeight;
  sampleCanvas.width  = vw;
  sampleCanvas.height = vh;
  sampleCtx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  sampleCtx.drawImage(video, 0, 0, vw, vh);
  sampleCtx.filter = 'none';

  const dw = overlay.width  = overlay.offsetWidth  || 400;
  const dh = overlay.height = overlay.offsetHeight || 400;

  // sample cell dimensions
  const vcw = vw / GRID, vch = vh / GRID;
  // display cell dimensions (2× sample cell)
  const ddw = dw / DISPLAY, ddh = dh / DISPLAY;
  // fine grid cell dimensions on overlay
  const dcw = dw / GRID,   dch = dh / GRID;

  overlayCtx.clearRect(0, 0, dw, dh);

  // Determine which round to run this frame
  let roundToRun = -1;
  if (tilesScanning && objectsScanning) {
    roundToRun = scanRound;
    scanRound  = (scanRound + 1) % 2;
  } else if (tilesScanning) {
    roundToRun = 0;
  } else if (objectsScanning) {
    roundToRun = 1;
  }

  if (roundToRun >= 0) {
    const classifier    = roundToRun === 0 ? classifyTile  : classifyObject;
    const pending       = roundToRun === 0 ? tilePending   : objectPending;
    const stability     = roundToRun === 0 ? tileStability : objectStability;
    const committedGrid = roundToRun === 0 ? tileGrid      : objectGrid;

    const rawGrid = [];
    for (let row = 0; row < GRID; row++) {
      rawGrid.push([]);
      for (let col = 0; col < GRID; col++) {
        const avg = sampleCell(sampleCtx, col * vcw, row * vch, vcw, vch);
        rawGrid[row].push(classifier(avg.r, avg.g, avg.b));
      }
    }

    for (let row = 0; row < DISPLAY; row++) {
      for (let col = 0; col < DISPLAY; col++) {
        const voted = voteBlock(rawGrid, row, col);
        if (voted === pending[row][col]) {
          stability[row][col]++;
        } else {
          pending[row][col]   = voted;
          stability[row][col] = 1;
        }
        if (stability[row][col] >= STABILITY_THRESHOLD) {
          committedGrid[row][col] = voted;
        }
      }
    }
  }

  // Always merge from both grids — frozen data persists after a round ends
  for (let row = 0; row < DISPLAY; row++) {
    for (let col = 0; col < DISPLAY; col++) {
      boardState[row][col] = objectGrid[row][col] ?? tileGrid[row][col];
    }
  }

  // Draw colored 8×8 tile overlays using committed (stable) boardState
  if (showColors) {
    for (let row = 0; row < DISPLAY; row++) {
      for (let col = 0; col < DISPLAY; col++) {
        const key = boardState[row][col];
        const ox = col * ddw, oy = row * ddh;
        if (key) {
          overlayCtx.strokeStyle = COLORS[key].hex;
          overlayCtx.lineWidth = 2;
          overlayCtx.strokeRect(ox + 1, oy + 1, ddw - 2, ddh - 2);
          overlayCtx.fillStyle = COLORS[key].hex;
          overlayCtx.globalAlpha = 0.2;
          overlayCtx.fillRect(ox + 1, oy + 1, ddw - 2, ddh - 2);
          overlayCtx.globalAlpha = 1;
        }
      }
    }
  }

  // Draw 16×16 fine grid lines
  overlayCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  overlayCtx.lineWidth = 1;
  overlayCtx.beginPath();
  for (let i = 0; i <= GRID; i++) {
    overlayCtx.moveTo(i * dcw, 0); overlayCtx.lineTo(i * dcw, dh);
    overlayCtx.moveTo(0, i * dch); overlayCtx.lineTo(dw, i * dch);
  }
  overlayCtx.stroke();

  // Draw 8×8 major grid lines
  overlayCtx.strokeStyle = 'rgba(255,255,255,0.75)';
  overlayCtx.lineWidth = 2;
  overlayCtx.beginPath();
  for (let i = 0; i <= DISPLAY; i++) {
    overlayCtx.moveTo(i * ddw, 0); overlayCtx.lineTo(i * ddw, dh);
    overlayCtx.moveTo(0, i * ddh); overlayCtx.lineTo(dw, i * ddh);
  }
  overlayCtx.stroke();

  if (showColors) {
    updateBoard();
  }
}

//board dom
function buildBoard() {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${DISPLAY}, 1fr)`;
  for (let i = 0; i < DISPLAY * DISPLAY; i++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    const label = document.createElement('span');
    label.className = 'cell-label';
    cell.appendChild(label);
    boardEl.appendChild(cell);
  }
}

function updateBoard() {
  for (let row = 0; row < DISPLAY; row++) {
    for (let col = 0; col < DISPLAY; col++) {
      const cell = boardEl.children[row * DISPLAY + col];
      const key  = boardState[row][col];
      if (cell.dataset.color === (key ?? '')) continue;
      cell.dataset.color = key ?? '';
      if (key) {
        cell.style.setProperty('--cell-color', COLORS[key].hex);
        cell.querySelector('.cell-label').textContent = COLORS[key].label;
        cell.classList.add('active');
      } else {
        cell.style.removeProperty('--cell-color');
        cell.querySelector('.cell-label').textContent = '';
        cell.classList.remove('active');
      }
    }
  }
}

//temp here
function buildLegend() {
  const legend = document.getElementById('legend');
  Object.entries(COLORS).forEach(([, info]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.style.setProperty('--swatch-color', info.hex);
    item.innerHTML = `
      <div class="swatch"></div>
      <span class="legend-label">${info.label}</span>
    `;
    legend.appendChild(item);
  });
}

//start camera and processing
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }
    });
    video.srcObject = stream;
    await video.play();
    document.getElementById('startBtn').textContent = 'Camera Running';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('resetBtn').disabled = false;
    document.getElementById('toggleBtn').disabled = false;
    document.getElementById('tilesBtn').disabled = false;
    document.getElementById('objectsBtn').disabled = false;
    animId = requestAnimationFrame(processFrame);
  } catch (err) {
    alert('Camera error: ' + err.message);
  }
}

//init
window.addEventListener('DOMContentLoaded', () => {
  video        = document.getElementById('video');
  overlay      = document.getElementById('overlay');
  overlayCtx   = overlay.getContext('2d');
  sampleCanvas = document.getElementById('sampleCanvas');
  sampleCtx    = sampleCanvas.getContext('2d', { willReadFrequently: true });
  boardEl      = document.getElementById('board');

  buildBoard();
  buildLegend();

  document.getElementById('startBtn').addEventListener('click', startCamera);

  function clearAllState() {
    tileGrid        = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
    objectGrid      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
    boardState      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
    tilePending     = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
    objectPending   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
    tileStability   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
    objectStability = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
    scanRound       = 0;
  }

  document.getElementById('resetBtn').addEventListener('click', () => {
    clearAllState();
    updateBoard();
  });

  document.getElementById('toggleBtn').addEventListener('click', () => {
    showColors = !showColors;
    const btn = document.getElementById('toggleBtn');
    btn.textContent = showColors ? 'Grid Only' : 'Color Detection';
    btn.classList.toggle('active', showColors);
    if (!showColors) {
      clearAllState();
      updateBoard();
    }
  });

  document.getElementById('tilesBtn').addEventListener('click', () => {
    tilesScanning = !tilesScanning;
    const btn = document.getElementById('tilesBtn');
    if (tilesScanning) {
      // clear tile layer so fresh scan builds from scratch
      tileGrid      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
      tilePending   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
      tileStability = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
      btn.textContent = 'End Tiles';
      btn.classList.add('active');
    } else {
      btn.textContent = 'Start Tiles';
      btn.classList.remove('active');
    }
  });

  document.getElementById('objectsBtn').addEventListener('click', () => {
    objectsScanning = !objectsScanning;
    const btn = document.getElementById('objectsBtn');
    if (objectsScanning) {
      objectGrid      = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
      objectPending   = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
      objectStability = Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
      btn.textContent = 'End Objects';
      btn.classList.add('active');
    } else {
      btn.textContent = 'Start Objects';
      btn.classList.remove('active');
    }
  });

  //might remove these later if we can get autocalibration lol
  document.getElementById('brightnessSlider').addEventListener('input', e => {
    brightness = +e.target.value;
    document.getElementById('brightnessVal').textContent = e.target.value;
  });
  document.getElementById('contrastSlider').addEventListener('input', e => {
    contrast = +e.target.value;
    document.getElementById('contrastVal').textContent = e.target.value;
  });
  document.getElementById('blackThreshold').addEventListener('input', e => {
    blackThreshold = +e.target.value;
    document.getElementById('blackVal').textContent = e.target.value;
  });
  document.getElementById('satThreshold').addEventListener('input', e => {
    satThreshold = +e.target.value;
    document.getElementById('satVal').textContent = e.target.value;
  });
});
