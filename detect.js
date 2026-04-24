// Each entry: display hex used in the UI, and HSV detection ranges (h:0-360, s:0-255, v:0-255)
const COLORS = {
  trash_can:      { label: 'Trash Can',      hex: '#111111' },
  subway_station: { label: 'Subway Station', hex: '#0d2b0d' },
  fountain:       { label: 'Fountain',       hex: '#004d99' },
  bench:          { label: 'Bench',          hex: '#6b3300' },
  concrete_tile:  { label: 'Concrete Tile',  hex: '#9ea7b0' },
  grass_tile:     { label: 'Grass Tile',     hex: '#d4f5c4' },
  water_tile:     { label: 'Water Tile',     hex: '#bbdefb' },
  dirt_tile:      { label: 'Dirt Tile',      hex: '#a08c70' },
  tree:           { label: 'Tree',           hex: '#00ff00' },
  reg_fence:      { label: 'Reg Fence',      hex: '#00ffaa' },
  lights_lamps:   { label: 'Lights/Lamps',   hex: '#ffd700' },
  dog_park:       { label: 'Dog Park',       hex: '#f77030' },
  spiked_fence:   { label: 'Spiked Fence',   hex: '#cc0000' },
  bathroom:       { label: 'Bathroom',       hex: '#9955ee' },
  playground:     { label: 'Playground',     hex: '#ff80c0' },
};

const GRID = 8;

let boardState = Array.from({ length: GRID }, () => Array(GRID).fill(null));
let animId = null;
let blackThreshold = 35;
let satThreshold   = 30;

let video, overlay, overlayCtx, sampleCanvas, sampleCtx, boardEl;

// ─── Color Math ──────────────────────────────────────────────────────────────

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

// Returns a COLORS key string, or null for unrecognized/empty.
// Checks proceed from dark/unsaturated → saturated, most specific first.
function classifyColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  // ── Dark ──────────────────────────────────────────────────────────────────
  if (v < blackThreshold) return 'trash_can';

  // Very dark green (subway station): green hue, saturated, very low value
  if (h >= 100 && h <= 145 && s > 120 && v >= 20 && v < 85) return 'subway_station';

  // Dark navy blue (fountain): blue hue, saturated, low value
  if (h >= 198 && h <= 232 && s > 150 && v < 150) return 'fountain';

  // Dark brown (bench): warm hue, saturated, low-medium value
  if (h >= 18 && h <= 40 && s > 130 && v >= 40 && v < 140) return 'bench';

  // ── Neutral / Low-saturation ──────────────────────────────────────────────
  // Concrete tile: gray with blue cast, medium value
  if (s < 55 && h >= 185 && h <= 235 && v >= 120 && v < 205) return 'concrete_tile';

  // Grass tile: pale mint, very low saturation, green hue, high value
  if (h >= 90 && h <= 150 && s >= satThreshold && s < 75 && v > 185) return 'grass_tile';

  // Water tile: pale blue, low-medium saturation, very high value
  if (h >= 190 && h <= 222 && s >= satThreshold && s < 120 && v > 210) return 'water_tile';

  // Dirt tile: warm tan, medium saturation, medium-high value
  if (h >= 22 && h <= 48 && s >= 40 && s < 140 && v >= 130 && v < 220) return 'dirt_tile';

  // ── Saturated ─────────────────────────────────────────────────────────────
  // Bright green (tree): pure lime, very saturated, bright
  if (h >= 100 && h <= 145 && s >= 200 && v >= 160) return 'tree';

  // Cyan/turquoise (reg fence): H between green and blue, very saturated
  if (h >= 145 && h <= 178 && s >= 180 && v >= 180) return 'reg_fence';

  // Yellow (lights/lamps)
  if (h >= 42 && h <= 68 && s >= 180 && v >= 180) return 'lights_lamps';

  // Orange (dog park)
  if (h >= 15 && h <= 42 && s >= 160 && v >= 160) return 'dog_park';

  // Red (spiked fence): wraps around 0°
  if ((h < 12 || h >= 348) && s >= 180 && v >= 90) return 'spiked_fence';

  // Purple (bathroom)
  if (h >= 255 && h <= 298 && s >= 120 && v >= 140) return 'bathroom';

  // Pink (playground): magenta-pink
  if (h >= 298 && h <= 348 && s >= 75 && v >= 180) return 'playground';

  return null;
}

// ─── Cell Sampling ───────────────────────────────────────────────────────────

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

// ─── Frame Loop ──────────────────────────────────────────────────────────────

function processFrame() {
  animId = requestAnimationFrame(processFrame);
  if (!video || video.readyState < 2) return;

  const vw = video.videoWidth, vh = video.videoHeight;
  sampleCanvas.width  = vw;
  sampleCanvas.height = vh;
  sampleCtx.drawImage(video, 0, 0, vw, vh);

  const dw = overlay.width  = overlay.offsetWidth  || 400;
  const dh = overlay.height = overlay.offsetHeight || 400;
  const dcw = dw / GRID, dch = dh / GRID;
  const vcw = vw / GRID,  vch = vh / GRID;

  overlayCtx.clearRect(0, 0, dw, dh);

  const newState = [];
  for (let row = 0; row < GRID; row++) {
    newState.push([]);
    for (let col = 0; col < GRID; col++) {
      const avg   = sampleCell(sampleCtx, col * vcw, row * vch, vcw, vch);
      const key   = classifyColor(avg.r, avg.g, avg.b);
      newState[row].push(key);

      const ox = col * dcw, oy = row * dch;
      if (key) {
        overlayCtx.strokeStyle = COLORS[key].hex;
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(ox + 1, oy + 1, dcw - 2, dch - 2);
        overlayCtx.fillStyle = COLORS[key].hex;
        overlayCtx.globalAlpha = 0.2;
        overlayCtx.fillRect(ox + 1, oy + 1, dcw - 2, dch - 2);
        overlayCtx.globalAlpha = 1;
      } else {
        overlayCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        overlayCtx.lineWidth = 1;
        overlayCtx.strokeRect(ox + 1, oy + 1, dcw - 2, dch - 2);
      }
    }
  }

  boardState = newState;
  updateBoard();
}

// ─── Board DOM ───────────────────────────────────────────────────────────────

function buildBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < GRID * GRID; i++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    const label = document.createElement('span');
    label.className = 'cell-label';
    cell.appendChild(label);
    boardEl.appendChild(cell);
  }
}

function updateBoard() {
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const cell = boardEl.children[row * GRID + col];
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

// ─── Legend ──────────────────────────────────────────────────────────────────

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

// ─── Camera ──────────────────────────────────────────────────────────────────

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
    });
    video.srcObject = stream;
    await video.play();
    document.getElementById('startBtn').textContent = 'Camera Running';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('resetBtn').disabled = false;
    animId = requestAnimationFrame(processFrame);
  } catch (err) {
    alert('Camera error: ' + err.message);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

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

  document.getElementById('resetBtn').addEventListener('click', () => {
    boardState = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    updateBoard();
  });

  const blackSlider = document.getElementById('blackThreshold');
  const satSlider   = document.getElementById('satThreshold');

  blackSlider.addEventListener('input', e => {
    blackThreshold = +e.target.value;
    document.getElementById('blackVal').textContent = e.target.value;
  });
  satSlider.addEventListener('input', e => {
    satThreshold = +e.target.value;
    document.getElementById('satVal').textContent = e.target.value;
  });
});
