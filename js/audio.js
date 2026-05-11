const AudioMgr = (() => {
  const TRACKS = {
    initial_1:      'voiceover/initial_1.mp3',
    initial_2:      'voiceover/Initial_2.mp3',
    initial_3:      'voiceover/Initial_3.mp3',
    initial_4:      'voiceover/Initial_4.mp3',
    initial_5:      'voiceover/Initial_5.mp3',
    initial_6:      'voiceover/Initial_6.mp3',
    thirty_sec:     'voiceover/30_sec.mp3',
    five_countdown: 'voiceover/5-4-3-2-1.mp3',
    timer_alarm:    'voiceover/timer_alarm_sound.mp3',
  };

  let _current = null;

  return {
    play(key, onEnd) {
      this.stop();
      const src = TRACKS[key];
      if (!src) return null;
      _current = new window.Audio(src);
      if (onEnd) _current.addEventListener('ended', onEnd, { once: true });
      _current.play().catch(() => {
        if (onEnd) onEnd();
      });
      return _current;
    },

    stop() {
      if (_current) {
        _current.pause();
        _current.currentTime = 0;
        _current = null;
      }
    },

    get isPlaying() {
      return _current && !_current.paused;
    },
  };
})();
