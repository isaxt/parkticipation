// ─── Color → Attribute Map ────────────────────────────────────────────────────
const COLOR_ATTRIBUTES = {
  red:    { label: 'Red',    hex: '#e53935', attribute: 'Park Zone'        },
  orange: { label: 'Orange', hex: '#fb8c00', attribute: 'Recreation Area'  },
  yellow: { label: 'Yellow', hex: '#fdd835', attribute: 'Picnic Area'      },
  green:  { label: 'Green',  hex: '#43a047', attribute: 'Garden'           },
  cyan:   { label: 'Cyan',   hex: '#00acc1', attribute: 'Water Feature'    },
  blue:   { label: 'Blue',   hex: '#1e88e5', attribute: 'Pathway'          },
  purple: { label: 'Purple', hex: '#8e24aa', attribute: 'Art Installation' },
  pink:   { label: 'Pink',   hex: '#e91e63', attribute: 'Seating Area'     },
  white:  { label: 'White',  hex: '#f5f5f5', attribute: 'Open Space'       },
  black:  { label: 'Black',  hex: '#424242', attribute: 'Barrier'          },
  empty:  { label: 'Empty',  hex: '#2a2a3e', attribute: '—'                },
};

const GRID = 8;

// ─── State ────────────────────────────────────────────────────────────────────
let boardState = Array.from({ length: GRID }, () => Array(GRID).fill('empty'));
let animId = null;
let brightnessThreshold = 40;
let saturationThreshold = 45;

// DOM refs set in init
let video, overlay, overlayCtx, sampleCanvas, sampleCtx, boardEl;

// ─── Color Math ───────────────────────────────────────────────────────────────
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

function classifyColor(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (v < brightnessThreshold) return 'black';
  if (s < saturationThreshold) return v > 180 ? 'white' : 'empty';

  if (h < 15 || h >= 345) return 'red';
  if (h < 40)             return 'orange';
  if (h < 75)             return 'yellow';
  if (h < 160)            return 'green';
  if (h < 200)            return 'cyan';
  if (h < 260)            return 'blue';
  if (h < 300)            return 'purple';
  return 'pink';
}

// Sample the center 60% of a cell to avoid grid-line contamination
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

// ─── Frame Loop ───────────────────────────────────────────────────────────────
function processFrame() {
  animId = requestAnimationFrame(processFrame);
  if (!video || video.readyState < 2) return;

  const vw = video.videoWidth, vh = video.videoHeight;
  sampleCanvas.width = vw;
  sampleCanvas.height = vh;
  sampleCtx.drawImage(video, 0, 0, vw, vh);

  const dw = overlay.width  = overlay.offsetWidth  || 400;
  const dh = overlay.height = overlay.offsetHeight || 400;
  const sx = dw / GRID, sy = dh / GRID;       // display cell size
  const vcw = vw / GRID,  vch = vh / GRID;    // video cell size

  overlayCtx.clearRect(0, 0, dw, dh);

  const newState = [];
  for (let row = 0; row < GRID; row++) {
    newState.push([]);
    for (let col = 0; col < GRID; col++) {
      const avg = sampleCell(sampleCtx, col * vcw, row * vch, vcw, vch);
      const color = classifyColor(avg.r, avg.g, avg.b);
      newState[row].push(color);

      // Draw grid overlay on camera feed
      const ox = col * sx, oy = row * sy;
      overlayCtx.strokeStyle = color === 'empty' ? 'rgba(255,255,255,0.25)' : COLOR_ATTRIBUTES[color].hex;
      overlayCtx.lineWidth = color === 'empty' ? 1 : 2;
      overlayCtx.strokeRect(ox + 1, oy + 1, sx - 2, sy - 2);

      if (color !== 'empty') {
        overlayCtx.fillStyle = COLOR_ATTRIBUTES[color].hex;
        overlayCtx.globalAlpha = 0.25;
        overlayCtx.fillRect(ox + 1, oy + 1, sx - 2, sy - 2);
        overlayCtx.globalAlpha = 1;
        overlayCtx.fillStyle = COLOR_ATTRIBUTES[color].hex;
        overlayCtx.fillRect(ox + 3, oy + 3, 12, 12);
      }
    }
  }

  boardState = newState;
  updateBoard();
}

// ─── Board DOM ────────────────────────────────────────────────────────────────
function buildBoard() {
  boardEl.innerHTML = '';
  for (let i = 0; i < GRID * GRID; i++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    boardEl.appendChild(cell);
  }
}

function updateBoard() {
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const cell = boardEl.children[row * GRID + col];
      const key = boardState[row][col];
      const info = COLOR_ATTRIBUTES[key];
      if (cell.dataset.color === key) continue; // skip if unchanged
      cell.dataset.color = key;
      cell.style.setProperty('--cell-color', info.hex);
      cell.title = `[${row},${col}] ${info.label} — ${info.attribute}`;
    }
  }
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function buildLegend() {
  const grid = document.getElementById('legendGrid');
  Object.entries(COLOR_ATTRIBUTES).forEach(([key, info]) => {
    if (key === 'empty') return;
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.style.setProperty('--swatch-color', info.hex);
    item.innerHTML = `
      <div class="swatch"></div>
      <span class="legend-label">${info.label}</span>
      <span class="legend-attr">${info.attribute}</span>
    `;
    grid.appendChild(item);
  });
}

// ─── Camera ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
    });
    video.srcObject = stream;
    await video.play();
    document.getElementById('startBtn').textContent = 'Camera Running';
    document.getElementById('startBtn').disabled = true;
    document.getElementById('calibrateBtn').disabled = false;
    animId = requestAnimationFrame(processFrame);
  } catch (err) {
    alert('Camera error: ' + err.message);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
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

  const bSlider  = document.getElementById('brightnessThreshold');
  const sSlider  = document.getElementById('saturationThreshold');
  const bVal     = document.getElementById('brightnessVal');
  const sVal     = document.getElementById('saturationVal');

  bSlider.addEventListener('input', e => {
    brightnessThreshold = +e.target.value;
    bVal.textContent = e.target.value;
  });
  sSlider.addEventListener('input', e => {
    saturationThreshold = +e.target.value;
    sVal.textContent = e.target.value;
  });

  // Calibrate: snapshot current board as "empty" baseline (placeholder for future use)
  document.getElementById('calibrateBtn').addEventListener('click', () => {
    boardState = Array.from({ length: GRID }, () => Array(GRID).fill('empty'));
    updateBoard();
  });
});
