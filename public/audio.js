// Chiptune audio generator pakai Web Audio API. No external files — semua suara
// disintesis dari oscillator. BGM per fase + SFX per event. Mute state disimpan
// di localStorage. Audio context baru dibuat setelah user interact pertama kali
// (browser autoplay policy).
(function (global) {
  "use strict";

  var ctx = null, master = null;
  var muted = false;
  var currentPhase = null;
  var bgmTimer = null;

  var NOTES = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51,
  };
  function n(name) { return NOTES[name] || 440; }

  function ensureCtx() {
    if (!ctx) {
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.28;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function tone(freq, start, dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.value = freq;
    var vol = opts.volume != null ? opts.volume : 0.12;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start); osc.stop(start + dur + 0.05);
  }

  function noiseBurst(start, dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    var size = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, size, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain();
    var vol = opts.volume != null ? opts.volume : 0.08;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(g); g.connect(master);
    src.start(start); src.stop(start + dur);
  }

  // Pattern = {beat, lead:[], bass:[]} — nilai null = rest
  var PATTERNS = {
    lobby: {
      beat: 0.22,
      lead: ["C5","E5","G5","E5","A5","G5","E5","C5","D5","F5","A5","F5","G5","F5","E5","C5"],
      bass: ["C3",null,"G3",null,"F3",null,"G3",null,"C3",null,"G3",null,"F3",null,"G3",null],
    },
    preround: {
      beat: 0.18,
      lead: ["E5","F5","G5","A5","G5","F5","E5","D5","C5","D5","E5","F5"],
      bass: ["C3","G3","C3","G3","F3","C3","G3","C3","E3","G3","C3","G3"],
    },
    rakit: {
      beat: 0.17,
      lead: ["C5","D5","E5","G5","E5","D5","C5","E5","D5","E5","F5","A5","F5","E5","D5","F5","G5","A5","G5","E5","D5","C5","E5","G5"],
      bass: ["C3","G3","A3","E3","F3","C3","G3","C3","C3","G3","A3","E3","F3","C3","G3","C3","A3","E3","F3","C3","G3","C3","E3","C3"],
    },
    pasal: {
      beat: 0.22,
      lead: ["A4","C5","E5","C5","G4","B4","D5","B4","F4","A4","C5","A4","E4","G4","B4","G4"],
      bass: ["A2","A2","E3","E3","G2","G2","D3","D3","F2","F2","C3","C3","E2","E2","G3","G3"],
    },
    pilah: {
      beat: 0.21,
      lead: ["D5","F5","A5","F5","G5","E5","C5","E5","A5","F5","D5","F5","C5","D5","E5","C5"],
      bass: ["D3","A3","D3","A3","G3","D3","G3","D3","F3","C3","F3","C3","C3","G3","C3","G3"],
    },
    between: {
      beat: 0.19,
      lead: ["G5","A5","B5","C6","B5","A5","G5","E5"],
      bass: ["C3","G3","C3","G3","C3","G3","C3","G3"],
    },
    finished: {
      beat: 0.26,
      lead: ["C5","E5","G5","C6","G5","E5","C5","G4","E5","G5","C6","E5","G5","C6","E5","C6"],
      bass: ["C3","G3","E3","C3","F3","C3","G3","C3","C3","G3","E3","C3","F3","C3","G3","C3"],
    },
  };

  function stopBgm() { if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; } }

  function startBgm(phaseKey) {
    stopBgm();
    if (!ctx) return;
    var pat = PATTERNS[phaseKey];
    if (!pat) return;
    var step = 0;
    function tick() {
      if (currentPhase !== phaseKey) return;
      if (muted) return;
      var now = ctx.currentTime;
      var i = step % pat.lead.length;
      var leadN = pat.lead[i];
      var bassN = pat.bass[i];
      if (leadN) tone(n(leadN), now, pat.beat * 0.9, { type: "square", volume: 0.1 });
      if (bassN) tone(n(bassN), now, pat.beat * 0.9, { type: "triangle", volume: 0.16 });
      step++;
      bgmTimer = setTimeout(tick, pat.beat * 1000);
    }
    tick();
  }

  function setPhase(key) {
    ensureCtx();
    if (currentPhase === key) return;
    currentPhase = key;
    stopBgm();
    if (!muted && PATTERNS[key]) startBgm(key);
  }

  function sfx(name) {
    if (!ensureCtx() || muted) return;
    var t0 = ctx.currentTime;
    switch (name) {
      case "pickup":
        tone(880, t0, 0.07, { type: "square", volume: 0.18 });
        tone(1320, t0 + 0.06, 0.1, { type: "square", volume: 0.2 });
        break;
      case "drop":
        tone(440, t0, 0.08, { type: "triangle", volume: 0.18 });
        tone(330, t0 + 0.06, 0.08, { type: "triangle", volume: 0.14 });
        break;
      case "lock":
        tone(660, t0, 0.07, { type: "square", volume: 0.18 });
        tone(990, t0 + 0.06, 0.1, { type: "square", volume: 0.22 });
        break;
      case "unlock":
        tone(990, t0, 0.07, { type: "square", volume: 0.16 });
        tone(660, t0 + 0.06, 0.08, { type: "square", volume: 0.14 });
        break;
      case "reveal":
        tone(440, t0, 0.08, { type: "square", volume: 0.16 });
        tone(660, t0 + 0.08, 0.08, { type: "square", volume: 0.18 });
        tone(880, t0 + 0.16, 0.14, { type: "square", volume: 0.22 });
        break;
      case "correct":
        tone(660, t0, 0.08, { type: "square", volume: 0.2 });
        tone(880, t0 + 0.08, 0.08, { type: "square", volume: 0.22 });
        tone(1320, t0 + 0.16, 0.18, { type: "square", volume: 0.24 });
        break;
      case "wrong":
        tone(220, t0, 0.12, { type: "sawtooth", volume: 0.18 });
        tone(165, t0 + 0.1, 0.2, { type: "sawtooth", volume: 0.18 });
        break;
      case "click":
        tone(1100, t0, 0.03, { type: "square", volume: 0.08 });
        break;
      case "tick":
        tone(1500, t0, 0.025, { type: "square", volume: 0.07 });
        break;
      case "start":
        tone(392, t0, 0.1, { type: "square", volume: 0.22 });
        tone(523, t0 + 0.1, 0.1, { type: "square", volume: 0.22 });
        tone(659, t0 + 0.2, 0.16, { type: "square", volume: 0.25 });
        break;
      case "win":
        var seq = [523, 659, 784, 1046, 784, 1046, 1319];
        for (var i = 0; i < seq.length; i++) {
          tone(seq[i], t0 + i * 0.14, 0.13, { type: "square", volume: 0.22 });
        }
        break;
      case "join":
        tone(523, t0, 0.08, { type: "square", volume: 0.16 });
        tone(784, t0 + 0.08, 0.1, { type: "square", volume: 0.18 });
        break;
      case "thud":
        noiseBurst(t0, 0.1, { volume: 0.12 });
        break;
    }
  }

  function loadMute() { try { muted = localStorage.getItem("kwn-muted") === "1"; } catch (e) {} }
  function saveMute() { try { localStorage.setItem("kwn-muted", muted ? "1" : "0"); } catch (e) {} }

  function setMuted(v) {
    muted = !!v; saveMute();
    if (master) master.gain.setValueAtTime(muted ? 0 : 0.28, (ctx && ctx.currentTime) || 0);
    if (muted) stopBgm();
    else if (currentPhase) startBgm(currentPhase);
  }
  function toggleMute() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }

  loadMute();

  // Auto-init on first user interaction (required by browser autoplay policy)
  function unlockOnInteract() {
    ensureCtx();
    if (ctx && currentPhase && !muted) startBgm(currentPhase);
  }
  global.addEventListener("pointerdown", unlockOnInteract, { once: true });
  global.addEventListener("keydown", unlockOnInteract, { once: true });

  global.GameAudio = {
    init: ensureCtx,
    setPhase: setPhase,
    sfx: sfx,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: isMuted,
  };
})(window);
