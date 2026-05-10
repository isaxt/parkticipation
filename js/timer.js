class GameTimer {
  constructor(displayEl, { onTick, onComplete } = {}) {
    this.el       = displayEl;
    this.onTick   = onTick     || null;
    this.onComplete = onComplete || null;
    this._remaining = 0;
    this._interval  = null;
  }

  start(seconds) {
    this.stop();
    this._remaining = seconds;
    this._render();
    this._interval = setInterval(() => {
      this._remaining = Math.max(0, this._remaining - 1);
      this._render();
      if (this.onTick) this.onTick(this._remaining);
      if (this._remaining <= 0) {
        this.stop();
        if (this.onComplete) this.onComplete();
      }
    }, 1000);
  }
//may need to add an internal clock for when we add the backing track

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _render() {
    if (!this.el) return;
    const m = Math.floor(this._remaining / 60);
    const s = this._remaining % 60;
    this.el.textContent = `${m}:${String(s).padStart(2, '0')}`;
    // Pulse red in last 10 seconds
    this.el.classList.toggle('timer--urgent', this._remaining <= 10 && this._remaining > 0);
  }

  get remaining() { return this._remaining; }
}
