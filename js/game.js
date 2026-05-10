//state
const G = {
  screenIdx : 0,
  roles     : [],   // 4 assigned roles
  r1Winner  : null,
  r2Winner  : null,
  timer     : null,
  cameraOk  : false,
};

const FLOW = [
  'lobby',
  'intro-1', 'intro-2', 'intro-3', 'intro-4', 'intro-5', 'intro-6',
  'card-deal', 'role-reveal',
  'r1-intro', 'r1-play', 'vote-rules', 'r1-discuss', 'r1-vote',
  'r2-intro', 'r2-play', 'r2-discuss', 'r2-vote', 'end',
];

//func helpers
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = $('screen-' + name);
  if (el) el.classList.add('active');
}

// Tracked timeouts so they can be cancelled on screen skip
const _pending = [];
function after(ms, fn) {
  const id = setTimeout(fn, ms);
  _pending.push(id);
  return id;
}
function clearPending() {
  _pending.splice(0).forEach(clearTimeout);
}

function advance() {
  if (G.screenIdx < FLOW.length - 1) {
    G.screenIdx++;
    enterScreen(FLOW[G.screenIdx]);
  }
}

//oard renderer (shared between play and discuss screens)
function buildBoard(el) {
  el.innerHTML = '';
  el.style.gridTemplateColumns = 'repeat(8, 1fr)';
  for (let i = 0; i < 64; i++) {
    const cell = document.createElement('div');
    cell.className = 'play-cell';
    el.appendChild(cell);
  }
  el._built = true;
}

function updateBoard(el, state) {
  if (!el._built) buildBoard(el);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const cell = el.children[r * 8 + c];
    const key  = state[r][c];
    const col  = key && Camera.COLORS[key] ? Camera.COLORS[key].hex : '#e0e0d8';
    cell.style.background = col;
    cell.title = key ? Camera.COLORS[key].label : '';
  }
}

// smll card HTML (used in discussion/vote screens)
function roleChip(role) {
  return `
    <div class="role-chip">
      <img src="${role.card}" alt="${role.name}" class="role-chip-img">
      <div class="role-chip-name">${role.name}</div>
      <div class="role-chip-dots">${renderVoteDots(role.votePower)}</div>
    </div>
  `;
}

//camera mount helper
function mountCamera(slotEl) {
  const cam = $('cam-mount');
  if (!cam || !slotEl) return;
  slotEl.appendChild(cam);
  cam.style.display = 'block';
}

function unmountCamera() {
  const cam = $('cam-mount');
  if (cam) {
    cam.style.display = 'none';
    document.body.appendChild(cam);
  }
}

// screen enter functions
function enterScreen(name) {
  clearPending();
  if (G.timer) { G.timer.stop(); G.timer = null; }
  Camera.onFrame(null);
  AudioMgr.stop();
  unmountCamera();
  showScreen(name);
  ENTERS[name]?.();
}

const ENTERS = {

  lobby() {
    $('screen-lobby').addEventListener('click', advance, { once: true });
    const strip = $('lobby-role-strip');
    if (strip) {
      strip.innerHTML = ALL_ROLES.map(r =>
        `<img src="${r.card}" class="lobby-role-icon" title="${r.name}">`
      ).join('');
    }
  },

  //onboarding narration 
  //auto-advances when the audio ends
  'intro-1'() { AudioMgr.play('initial_1', advance); },
  'intro-2'() { AudioMgr.play('initial_2', advance); },
  'intro-3'() { AudioMgr.play('initial_3', advance); },
  'intro-4'() { AudioMgr.play('initial_4', advance); },
  'intro-5'() { AudioMgr.play('initial_5', advance); },
  'intro-6'() { AudioMgr.play('initial_6', advance); },

  'card-deal'() {
    G.roles = pickFourRoles();
    const container = $('deal-cards');
    if (container) {
      container.querySelectorAll('.deal-card').forEach((card, i) => {
        card.style.animationDelay = `${i * 0.18}s`;
        card.classList.add('deal-card--rise');
      });
    }
    after(3200, advance);
  },

  'role-reveal'() {
    const container = $('reveal-cards');
    if (!container) return;
    container.innerHTML = '';
    G.roles.forEach((role, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'flip-card';
      wrapper.innerHTML = `
        <div class="flip-inner" id="flip-${i}">
          <div class="flip-front">
            <img src="image/GUI/card-back.png" alt="card back">
          </div>
          <div class="flip-back">
            <img src="${role.card}" alt="${role.name}">
          </div>
        </div>
      `;
      container.appendChild(wrapper);
      after(800 + i * 900, () => {
        document.getElementById('flip-' + i)?.classList.add('flipped');
      });
    });
    after(800 + G.roles.length * 900 + 2500, advance);
  },

  'r1-intro'() {
    after(4000, advance);
  },

  'r1-play'() {
    buildBoard($('r1-board'));
    // render role cards
    $('r1-role-chips').innerHTML = G.roles.map(roleChip).join('');
    // mount camera into the left slot
    mountCamera($('r1-cam-slot'));
    Camera.startTiles();

    G.timer = new GameTimer($('r1-timer'), {
      onComplete() {
        Camera.stopTiles();
        advance();
      },
    });
    G.timer.start(120);

    // keep board in sync with camera
    Camera.onFrame(state => updateBoard($('r1-board'), state));
  },

  'vote-rules'() {
    after(6000, advance);
  },

  'r1-discuss'() {
    // show frozen board state
    const snap = Camera.getBoardState();
    const boardEl = $('r1d-board');
    buildBoard(boardEl);
    updateBoard(boardEl, snap);
    $('r1d-role-chips').innerHTML = G.roles.map(roleChip).join('');

    G.timer = new GameTimer($('r1d-timer'), {
      onComplete: advance,
    });
    G.timer.start(30);
  },

  'r1-vote'() {
    G.r1Winner = getRoundWinner(G.roles);
    const top = G.r1Winner;
    const others = G.roles.filter(r => r.id !== top.id);

    const heroEl = $('r1-power-role');
    if (heroEl) heroEl.innerHTML = `
      <img src="${top.card}" alt="${top.name}" class="adjust-card-img">
      <div class="adjust-role-name">${top.name}</div>
    `;

    const othersEl = $('r1-others-chips');
    if (othersEl) othersEl.innerHTML = others.map(r => `
      <div class="adjust-other-chip">
        <img src="${r.card}" alt="${r.name}" class="adjust-other-img">
        <span>${r.name}</span>
      </div>
    `).join('');

    const secEl = $('r1-adjust-sec');
    G.timer = new GameTimer(null, {
      onTick(remaining) { if (secEl) secEl.textContent = remaining; },
      onComplete: advance,
    });
    G.timer.start(10);
  },

  'r2-intro'() {
    after(4000, advance);
  },

  'r2-play'() {
    buildBoard($('r2-board'));
    $('r2-role-chips').innerHTML = G.roles.map(roleChip).join('');
    mountCamera($('r2-cam-slot'));
    Camera.startObjects();

    G.timer = new GameTimer($('r2-timer'), {
      onComplete() {
        Camera.stopObjects();
        advance();
      },
    });
    G.timer.start(120);

    Camera.onFrame(state => updateBoard($('r2-board'), state));
  },

  'r2-discuss'() {
    const snap = Camera.getBoardState();
    const boardEl = $('r2d-board');
    buildBoard(boardEl);
    updateBoard(boardEl, snap);
    $('r2d-role-chips').innerHTML = G.roles.map(roleChip).join('');

    G.timer = new GameTimer($('r2d-timer'), {
      onComplete: advance,
    });
    G.timer.start(30);
  },

  'r2-vote'() {
    G.r2Winner = getRoundWinner(G.roles);
    const top = G.r2Winner;
    const others = G.roles.filter(r => r.id !== top.id);

    const heroEl = $('r2-power-role');
    if (heroEl) heroEl.innerHTML = `
      <img src="${top.card}" alt="${top.name}" class="adjust-card-img">
      <div class="adjust-role-name">${top.name}</div>
    `;

    const othersEl = $('r2-others-chips');
    if (othersEl) othersEl.innerHTML = others.map(r => `
      <div class="adjust-other-chip">
        <img src="${r.card}" alt="${r.name}" class="adjust-other-img">
        <span>${r.name}</span>
      </div>
    `).join('');

    const secEl = $('r2-adjust-sec');
    G.timer = new GameTimer(null, {
      onTick(remaining) { if (secEl) secEl.textContent = remaining; },
      onComplete: advance,
    });
    G.timer.start(10);
  },

  end() {
    Camera.stopStream();
    AudioMgr.stop();
  },
};

//keyboard shortcut to skip screens -> button
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowRight' || e.code === 'Space') {
    e.preventDefault();
    if (G.timer) G.timer.stop();
    AudioMgr.stop();
    advance();
  }
});

//init
window.addEventListener('DOMContentLoaded', async () => {
  Camera.init(
    $('game-video'),
    $('game-overlay'),
    $('game-sample'),
  );
  G.cameraOk = await Camera.start();
  if (!G.cameraOk) {
    console.warn('Running without camera — board will stay empty.');
  }

  enterScreen(FLOW[0]);
});
