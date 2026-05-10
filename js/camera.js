// wrap same logic as detect.js but with a clean API; no dom side-effects at load
//may need to adjust starting brightness/contrast/saturation thresholds :(
const Camera = (() => {
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
  };

  const GRID = 16, DISPLAY = 8, STABILITY = 4;

  let _video, _overlayEl, _overlayCtx, _sampleEl, _sampleCtx;
  let _tileGrid, _objectGrid, _boardState;
  let _tilePend, _objectPend, _tileSta, _objectSta;
  let _tilesOn = false, _objectsOn = false;
  let _animId = null, _scanRound = 0;
  let _blackT = 35, _satT = 30, _bright = 100, _contr = 100;
  let _onFrame = null;

  function _mk() {
    return Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(null));
  }
  function _mkN() {
    return Array.from({ length: DISPLAY }, () => Array(DISPLAY).fill(0));
  }

  function _reset() {
    _tileGrid   = _mk(); _objectGrid = _mk(); _boardState = _mk();
    _tilePend   = _mk(); _objectPend = _mk();
    _tileSta    = _mkN(); _objectSta = _mkN();
  }

  function _hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    const s = mx === 0 ? 0 : d / mx, v = mx;
    if (d !== 0) {
      switch (mx) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 255, v: v * 255 };
  }

  function _tile(r, g, b) {
    const { h, s, v } = _hsv(r, g, b);
    if (s < 55 && h >= 185 && h <= 235 && v >= 120 && v < 205) return 'concrete_tile';
    if (h >= 90  && h <= 150 && s >= _satT && s < 120 && v > 185) return 'grass_tile';
    if (h >= 190 && h <= 222 && s >= _satT && s < 120 && v > 210) return 'water_tile';
    if (h >= 22  && h <= 48  && s >= 40   && s < 140 && v >= 130 && v < 220) return 'dirt_tile';
    return null;
  }

  function _obj(r, g, b) {
    const { h, s, v } = _hsv(r, g, b);
    if (v < _blackT) return 'trash_can';
    if (h >= 88  && h <= 145 && s > 75  && v >= 20  && v < 85)  return 'subway_station';
    if (h >= 198 && h <= 232 && s > 150 && v < 160)             return 'fountain';
    if (h >= 18  && h <= 40  && s > 130 && v >= 40  && v < 140) return 'bench';
    if (h >= 100 && h <= 168 && s >= 150 && v >= 50  && v < 180) return 'tree';
    if (h >= 145 && h <= 178 && s >= 180 && v >= 180)            return 'reg_fence';
    if (h >= 42  && h <= 68  && s >= 180 && v >= 180)            return 'lights_lamps';
    if (h >= 15  && h <= 42  && s >= 160 && v >= 160)            return 'dog_park';
    if ((h < 12 || h >= 348) && s >= 180 && v >= 90)             return 'spiked_fence';
    if (h >= 255 && h <= 298 && s >= 115 && v >= 140)            return 'bathroom';
    if (h >= 298 && h <= 348 && s >= 75  && v >= 180)            return 'playground';
    return null;
  }

  function _sample(ctx, cx, cy, cw, ch) {
    const m = 0.2;
    const sx = Math.round(cx + cw * m), sy = Math.round(cy + ch * m);
    const sw = Math.max(1, Math.round(cw * (1 - 2 * m)));
    const sh = Math.max(1, Math.round(ch * (1 - 2 * m)));
    const d = ctx.getImageData(sx, sy, sw, sh).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
    return { r: r/n, g: g/n, b: b/n };
  }

  function _vote(raw, tr, tc) {
    const cnt = {};
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
      const k = raw[tr*2+dr][tc*2+dc];
      if (k) cnt[k] = (cnt[k] || 0) + 1;
    }
    let best = null, bn = 0;
    for (const [k, n] of Object.entries(cnt)) if (n > bn) { best = k; bn = n; }
    return best;
  }

  function _frame() {
    _animId = requestAnimationFrame(_frame);
    if (!_video || _video.readyState < 2) return;

    const vw = _video.videoWidth, vh = _video.videoHeight;
    _sampleEl.width = vw; _sampleEl.height = vh;
    _sampleCtx.filter = `brightness(${_bright}%) contrast(${_contr}%)`;
    _sampleCtx.drawImage(_video, 0, 0, vw, vh);
    _sampleCtx.filter = 'none';

    const dw = _overlayEl.width  = _overlayEl.offsetWidth  || 400;
    const dh = _overlayEl.height = _overlayEl.offsetHeight || 400;
    const vcw = vw/GRID, vch = vh/GRID;
    const ddw = dw/DISPLAY, ddh = dh/DISPLAY;
    const dcw = dw/GRID,   dch = dh/GRID;

    _overlayCtx.clearRect(0, 0, dw, dh);

    let run = -1;
    if (_tilesOn && _objectsOn) { run = _scanRound; _scanRound = (_scanRound+1)%2; }
    else if (_tilesOn)   run = 0;
    else if (_objectsOn) run = 1;

    if (run >= 0) {
      const clf  = run === 0 ? _tile   : _obj;
      const pend = run === 0 ? _tilePend   : _objectPend;
      const sta  = run === 0 ? _tileSta    : _objectSta;
      const comm = run === 0 ? _tileGrid   : _objectGrid;
      const raw  = [];
      for (let row = 0; row < GRID; row++) {
        raw.push([]);
        for (let col = 0; col < GRID; col++) {
          const avg = _sample(_sampleCtx, col*vcw, row*vch, vcw, vch);
          raw[row].push(clf(avg.r, avg.g, avg.b));
        }
      }
      for (let r = 0; r < DISPLAY; r++) for (let c = 0; c < DISPLAY; c++) {
        const v = _vote(raw, r, c);
        if (v === pend[r][c]) sta[r][c]++;
        else { pend[r][c] = v; sta[r][c] = 1; }
        if (sta[r][c] >= STABILITY) comm[r][c] = v;
      }
    }

    for (let r = 0; r < DISPLAY; r++) for (let c = 0; c < DISPLAY; c++) {
      _boardState[r][c] = _objectGrid[r][c] ?? _tileGrid[r][c];
    }

    // Draw colored overlay
    for (let r = 0; r < DISPLAY; r++) for (let c = 0; c < DISPLAY; c++) {
      const k = _boardState[r][c];
      if (k) {
        const ox = c*ddw, oy = r*ddh;
        _overlayCtx.strokeStyle = COLORS[k].hex;
        _overlayCtx.lineWidth   = 2;
        _overlayCtx.strokeRect(ox+1, oy+1, ddw-2, ddh-2);
        _overlayCtx.fillStyle   = COLORS[k].hex;
        _overlayCtx.globalAlpha = 0.25;
        _overlayCtx.fillRect(ox+1, oy+1, ddw-2, ddh-2);
        _overlayCtx.globalAlpha = 1;
      }
    }

    // Fine grid
    _overlayCtx.strokeStyle = 'rgba(255,255,255,0.15)';
    _overlayCtx.lineWidth   = 1;
    _overlayCtx.beginPath();
    for (let i = 0; i <= GRID; i++) {
      _overlayCtx.moveTo(i*dcw, 0); _overlayCtx.lineTo(i*dcw, dh);
      _overlayCtx.moveTo(0, i*dch); _overlayCtx.lineTo(dw, i*dch);
    }
    _overlayCtx.stroke();

    // Major grid
    _overlayCtx.strokeStyle = 'rgba(255,255,255,0.65)';
    _overlayCtx.lineWidth   = 2;
    _overlayCtx.beginPath();
    for (let i = 0; i <= DISPLAY; i++) {
      _overlayCtx.moveTo(i*ddw, 0); _overlayCtx.lineTo(i*ddw, dh);
      _overlayCtx.moveTo(0, i*ddh); _overlayCtx.lineTo(dw, i*ddh);
    }
    _overlayCtx.stroke();

    if (_onFrame) _onFrame(_boardState);
  }

  _reset();

  return {
    COLORS,

    init(videoEl, overlayEl, sampleEl) {
      _video      = videoEl;
      _overlayEl  = overlayEl;
      _overlayCtx = overlayEl.getContext('2d');
      _sampleEl   = sampleEl;
      _sampleCtx  = sampleEl.getContext('2d', { willReadFrequently: true });
    },

    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        });
        _video.srcObject = stream;
        await _video.play();
        if (!_animId) _animId = requestAnimationFrame(_frame);
        return true;
      } catch (e) {
        console.warn('Camera unavailable:', e.message);
        return false;
      }
    },

    startTiles() {
      _tileGrid = _mk(); _tilePend = _mk(); _tileSta = _mkN();
      _tilesOn  = true;
    },

    stopTiles() { _tilesOn = false; },

    startObjects() {
      _objectGrid = _mk(); _objectPend = _mk(); _objectSta = _mkN();
      _objectsOn  = true;
    },

    stopObjects() { _objectsOn = false; },

    reset() {
      _tilesOn = false; _objectsOn = false;
      _reset();
    },

    stopStream() {
      if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
      if (_video && _video.srcObject) {
        _video.srcObject.getTracks().forEach(t => t.stop());
        _video.srcObject = null;
      }
    },

    getBoardState() { return _boardState; },
    onFrame(cb)     { _onFrame = cb; },

    get isRunning() { return _animId !== null; },
  };
})();
