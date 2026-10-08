// audio.js: text-to-speech through the Web Speech API. Only offered when the
// device has a Persian voice; without one the browser reads Farsi script as
// nonsense. Views say what to speak via view.speech() -> {text, token}.
(function (root) {
  'use strict';
  const F = root.F;

  let faVoice = null;
  let spokenFor = null;

  function pickVoice() {
    let list = [];
    try { list = root.speechSynthesis.getVoices() || []; } catch (e) { return; }
    faVoice = list.find(v => /^fa\b|^fa[-_]/i.test(v.lang || '')) || null;
  }

  const audio = F.audio = {
    mode: false,   // auto-play on reveal

    init() {
      if (!('speechSynthesis' in root)) return;
      pickVoice();
      root.speechSynthesis.addEventListener('voiceschanged', () => {
        pickVoice();
        audio.syncButton();
        F.app.render();
      });
    },

    ready() { return !!faVoice; },

    speak(text) {
      if (!audio.ready() || !text) return;
      try {
        root.speechSynthesis.cancel();
        const u = new root.SpeechSynthesisUtterance(text);
        u.lang = faVoice.lang || 'fa-IR';
        // Some engines reject the voice object outright; the lang tag alone
        // still gets Persian out of them, so never let this take the utterance down.
        try { u.voice = faVoice; } catch (e) { /* ignore */ }
        u.rate = 0.85;
        root.speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    },

    speakCurrent() {
      const v = F.app.view();
      const sp = v && v.speech ? v.speech() : null;
      if (sp && sp.text) audio.speak(sp.text);
    },

    // Auto-play fires once per reveal, not on every incidental re-render.
    maybeSpeak() {
      if (!audio.mode || !audio.ready()) return;
      const v = F.app.view();
      const sp = v && v.speech ? v.speech() : null;
      if (!sp || !sp.text) return;
      if (spokenFor === sp.token) return;
      spokenFor = sp.token;
      audio.speak(sp.text);
    },

    syncButton() {
      const b = document.getElementById('audio-btn');
      if (!b) return;
      b.hidden = !audio.ready();
      b.classList.toggle('active', audio.mode);
    },
  };

  F.actions.register('toggle-audio', () => {
    audio.mode = !audio.mode;
    audio.syncButton();
    if (audio.mode) audio.speakCurrent();
    F.store.syncPrefs();
  });
  F.actions.register('speak', () => audio.speakCurrent());

  F.store.registerPrefs({
    save(p) { p.audioMode = audio.mode; },
    load(p) { if (typeof p.audioMode === 'boolean') audio.mode = p.audioMode; },
  });

  // The speaker button views add to a revealed card.
  audio.buttonHTML = () => '<button type="button" class="speak-btn" title="Hear it (s)" aria-label="Hear it" data-action="speak">▶</button>';
})(window);
