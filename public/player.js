(function () {
  "use strict";

  var socket = io();
  var SAVE_KEY = "kwn-jejak-join";
  var myTeamId = null;
  var myTeamName = "";
  var myName = "";
  var state = null;
  var stick = { x: 0, y: 0 };

  function $(id) { return document.getElementById(id); }
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }
  function saveJoin() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ name: myName, team: myTeamName })); } catch (e) {} }
  function loadJoin() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; } }
  function clearJoin() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function fmt(sec) { var m = Math.floor(sec / 60); var s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  var logoImg = $("logo-emblem");
  if (logoImg && window.PixelArt) logoImg.src = PixelArt.emblemDataURL(72);

  function doJoin(name, team, cb) {
    socket.emit("join", { name: name, team: team }, function (res) {
      if (res && res.ok) {
        myTeamId = res.teamId; myTeamName = res.teamName; myName = name;
        saveJoin();
        show("join", false); show("game", true);
        $("join-error").textContent = "";
      }
      if (cb) cb(res);
    });
  }

  var saved = loadJoin();
  if (saved) { $("name").value = saved.name || ""; $("team").value = saved.team || ""; }

  $("join-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("name").value.trim();
    var team = $("team").value.trim();
    if (!name || !team) { $("join-error").textContent = "Isi nama dan nama tim dulu."; return; }
    $("join-error").textContent = "Menghubungkan...";
    doJoin(name, team, function (res) {
      if (!res || !res.ok) $("join-error").textContent = (res && res.error) || "Gagal masuk.";
    });
  });

  socket.on("connect", function () {
    var s = loadJoin();
    if (s && s.name && s.team) doJoin(s.name, s.team);
  });

  socket.on("reset", function () {
    myTeamId = null; myTeamName = ""; clearJoin();
    show("game", false); show("join", true);
  });

  socket.on("state", function (s) { state = s; render(); });

  function findMe() {
    if (!state || !myTeamId) return null;
    for (var i = 0; i < state.teams.length; i++) if (state.teams[i].id === myTeamId) return state.teams[i];
    return null;
  }

  var iconCache = {};
  function pieceIcon(d, size) {
    var key = d.id + "|" + d.color + "|" + size;
    if (!iconCache[key]) iconCache[key] = PixelArt.iconDataURL(d.id, d.color, size);
    return iconCache[key];
  }
  var avatarCache = {};
  function avatarIcon(color, size) {
    var key = color + "|" + size;
    if (!avatarCache[key]) avatarCache[key] = PixelArt.avatarDataURL(color, size);
    return avatarCache[key];
  }

  function renderBoard(me) {
    var board = $("board");
    board.textContent = "";
    var defs = state.pieceDefs || [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var filled = !!me.board[d.id];
      var slot = el("div", "slot" + (filled ? " filled" : ""));
      var img = el("img", "pc pixel-img");
      img.alt = ""; img.src = pieceIcon(d, 32);
      if (!filled) img.style.opacity = "0.35";
      slot.appendChild(img);
      slot.appendChild(el("span", null, d.label));
      board.appendChild(slot);
    }
    $("board-count").textContent = me.pieces;
  }

  function statusFor(me, st) {
    if (state.phase === "lobby") return "Tunggu host memulai permainan.";
    if (state.phase === "preround") return "Host sedang menjelaskan aturan. Tunggu ya!";
    if (state.phase === "finished") return "Permainan sudah selesai. Lihat papan skor.";
    if (state.phase === "between") return "Ronde berikutnya: " + (state.nextRoundTitle || "") + ".";
    if (!st) return "";
    if (state.roundKey === "rakit") {
      if (me.carryType) return "Kamu membawa potongan. Bawa ke pangkalan tim, atau tekan Buang.";
      return me.canPickup ? "Potongan sudah dekat. Tekan Ambil." : "Dekati potongan untuk mengambil.";
    }
    if (state.roundKey === "pasal" || state.roundKey === "pilah") {
      if (st.stage === "reveal") return "Jawaban benar ditampilkan.";
      if (st.stage === "hold") return "Semua tim sudah mengunci jawaban.";
      if (me.locked) return "Jawaban terkunci. Tekan Batal kalau mau pindah.";
      return "Masuk ke lingkaran lalu tekan Kunci.";
    }
    return "";
  }

  function renderRanking(me) {
    var list = $("ranking");
    if (!list) return;
    list.textContent = "";
    (state.scoreboard || []).forEach(function (t) {
      var li = el("li", t.id === me.id ? "me" : null);
      var img = el("img", "ranking-dot pixel-img");
      img.alt = ""; img.src = avatarIcon(t.color, 24);
      li.appendChild(img);
      li.appendChild(document.createTextNode(t.name + " - " + t.score + " poin"));
      list.appendChild(li);
    });
  }

  var pmapCanvas = $("player-map");
  var pmapCtx = pmapCanvas.getContext("2d");
  // Resolusi lebih tinggi supaya di portrait HP tetap tajam saat di-stretch 100% width.
  var PMAP_W = 480, PMAP_H = 320;
  pmapCanvas.width = PMAP_W; pmapCanvas.height = PMAP_H;
  var pmapBg = null;
  var pmapKey = null;

  function scaledMap(m) {
    var MAP_W = 1200;
    var sx = PMAP_W / MAP_W;
    return {
      rivers: (m.rivers || []).map(function (r) { return { x1: r.x1 * sx, y1: r.y1 * sx, x2: r.x2 * sx, y2: r.y2 * sx, w: r.w * sx }; }),
      bridges: (m.bridges || []).map(function (b) { return { x: b.x * sx, y: b.y * sx, r: b.r * sx }; }),
    };
  }

  function renderMiniMap(me, st) {
    if (!state || !state.map) return;
    var MAP_W = 1200;
    var sx = PMAP_W / MAP_W;
    if (state.map.name !== pmapKey) {
      pmapKey = state.map.name;
      pmapBg = PixelArt.buildBackground(document, PMAP_W, PMAP_H, scaledMap(state.map));
    }
    pmapCtx.drawImage(pmapBg, 0, 0);
    ((state.map && state.map.rocks) || []).forEach(function (ob, idx) {
      PixelArt.drawObstacle(pmapCtx, ob.x * sx, ob.y * sx, Math.max(3, ob.r * sx), idx);
    });
    var now = performance.now();
    (state.zones || []).forEach(function (z) {
      var zx = z.x * sx, zy = z.y * sx, zr = z.r * sx;
      // Zona: dithering + 2 cincin kontras (gelap luar, warna dalam) supaya
      // bentuk zona tetap keliatan walau latar map ikut warna-warni.
      PixelArt.ditherCircle(pmapCtx, zx, zy, zr, z.color);
      pmapCtx.strokeStyle = "rgba(0,0,0,0.85)";
      pmapCtx.lineWidth = 1.5;
      pmapCtx.beginPath(); pmapCtx.arc(zx, zy, zr + 1, 0, Math.PI * 2); pmapCtx.stroke();
      pmapCtx.strokeStyle = z.color;
      pmapCtx.lineWidth = 1.2;
      pmapCtx.beginPath(); pmapCtx.arc(zx, zy, zr - 0.6, 0, Math.PI * 2); pmapCtx.stroke();
      if (me && !me.locked) {
        var inside = Math.hypot(me.x - z.x, me.y - z.y) <= z.r;
        if (inside) {
          var amp = 0.5 + 0.5 * Math.sin(now / 150);
          pmapCtx.strokeStyle = z.color;
          pmapCtx.lineWidth = 1 + 2 * amp;
          pmapCtx.beginPath();
          pmapCtx.arc(zx, zy, zr + 2 + amp * 2, 0, Math.PI * 2);
          pmapCtx.stroke();
        }
      }
      if (st && st.stage === "reveal" && st.answer != null && z.code === st.answer) {
        pmapCtx.strokeStyle = "#ffd54d";
        pmapCtx.lineWidth = 3;
        pmapCtx.beginPath();
        pmapCtx.arc(zx, zy, zr + 4, 0, Math.PI * 2);
        pmapCtx.stroke();
      }
    });
    (state.teams || []).forEach(function (t) {
      var tx = t.x * sx, ty = t.y * sx;
      var isMe = t.id === myTeamId;
      if (isMe) {
        PixelArt.drawCharacter(pmapCtx, tx, ty, t.color, now, true, 0.55);
        if (t.locked) {
          var p = (now / 600) % 1;
          pmapCtx.strokeStyle = "#ffd54d";
          pmapCtx.lineWidth = 1.5;
          pmapCtx.globalAlpha = 1 - p;
          pmapCtx.beginPath();
          pmapCtx.arc(tx, ty - 3, 6 + p * 10, 0, Math.PI * 2);
          pmapCtx.stroke();
          pmapCtx.globalAlpha = 1;
        }
      } else {
        pmapCtx.fillStyle = t.color;
        pmapCtx.beginPath();
        pmapCtx.arc(tx, ty, 2.5, 0, Math.PI * 2);
        pmapCtx.fill();
      }
    });
  }

  function renderPlayerMapLabels(st) {
    var layer = $("player-map-labels");
    layer.textContent = "";
    var MAP_W = 1200, MAP_H = 800;
    (state.zones || []).forEach(function (z) {
      var lbl = document.createElement("div");
      lbl.className = "pmap-label";
      lbl.textContent = z.label;
      lbl.style.left = (z.x / MAP_W * 100) + "%";
      lbl.style.top = ((z.y + z.r + 4) / MAP_H * 100) + "%";
      lbl.style.color = z.color;
      layer.appendChild(lbl);
    });
  }

  function renderLandscapeQuestion(st) {
    var q = $("landscape-question");
    if (!q) return;
    if (!st) { q.hidden = true; q.textContent = ""; return; }
    if (st.kind === "pasal" && st.prompt && st.stage !== "gap") {
      q.textContent = st.prompt;
      q.classList.remove("card-mode");
      q.hidden = false;
    } else if (st.kind === "pilah" && st.card) {
      q.textContent = "Kartu: " + st.card;
      q.classList.add("card-mode");
      q.hidden = false;
    } else {
      q.hidden = true;
      q.textContent = "";
    }
  }

  function findPieceDef(id) {
    var defs = state.pieceDefs || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return { id: id, color: "#ccc", label: id };
  }

  function render() {
    if (!state || !myTeamId) return;
    var me = findMe();
    if (!me) { $("prompt").textContent = "Menghubungkan ulang ke tim..."; return; }
    $("team-name").textContent = me.name;
    $("team-dot").src = avatarIcon(me.color, 28);
    $("my-score").textContent = me.score;
    $("team-name-l").textContent = me.name;
    $("team-dot-l").src = avatarIcon(me.color, 22);
    $("my-score-l").textContent = me.score;

    var st = state.stage;
    var roundText = "", timerText = "", prompt = "";

    if (state.phase === "lobby") { roundText = "Menunggu host"; prompt = "Tim sudah masuk. Tunggu host memulai."; }
    else if (state.phase === "preround") { roundText = "Bersiap: " + (state.roundTitle || ""); timerText = "Tunggu host"; prompt = state.roundDesc || ""; }
    else if (state.phase === "playing") { roundText = state.roundTitle; timerText = "Sisa " + fmt(state.roundLeft); prompt = st ? st.prompt : ""; }
    else if (state.phase === "between") { roundText = "Jeda"; timerText = "Mulai dalam " + state.betweenLeft + " detik"; prompt = "Berikutnya: " + (state.nextRoundTitle || ""); }
    else if (state.phase === "finished") { roundText = "Permainan selesai"; prompt = "Lihat papan skor di layar proyektor."; }

    if (state.phase === "playing" && st) {
      if (st.kind === "pasal") {
        prompt = st.prompt;
        if (st.stage === "answer") timerText = "Soal " + st.questionNo + "/" + st.total + " - " + st.timeLeft + " dtk";
        else if (st.stage === "hold") timerText = "Semua lock: " + st.holdLeft + " dtk";
        else if (st.stage === "reveal") timerText = "Jawaban terungkap";
      }
      if (st.kind === "pilah") {
        if (st.card) prompt = "Kartu: " + st.card;
        if (st.stage === "answer") timerText = "Kartu " + st.cardNo + "/" + st.total + " - " + st.timeLeft + " dtk";
        else if (st.stage === "hold") timerText = "Semua lock: " + st.holdLeft + " dtk";
        else if (st.stage === "reveal") timerText = "Hasil";
      }
    }

    $("round-title").textContent = roundText;
    $("timer").textContent = timerText;
    $("prompt").textContent = prompt;
    $("status").textContent = statusFor(me, st);
    $("round-title-l").textContent = roundText;
    $("timer-l").textContent = timerText;

    var showBoard = state.phase === "playing" && state.roundKey === "rakit";
    show("board-card", showBoard);
    if (showBoard) {
      renderBoard(me);
      var carryBox = $("carry");
      carryBox.textContent = "";
      if (me.carryType) {
        var cd = findPieceDef(me.carryType);
        var cimg = el("img", "pc-inline pixel-img");
        cimg.alt = ""; cimg.src = pieceIcon(cd, 20);
        carryBox.appendChild(cimg);
        carryBox.appendChild(document.createTextNode(" Membawa: " + (cd.label || "")));
      }
    }

    var showMap = state.phase === "playing" && (state.roundKey === "pasal" || state.roundKey === "pilah");
    show("map-card", showMap);
    // Contekan hanya muncul selama ronde Pilah (astagatra)
    show("cheat-pilah", state.phase === "playing" && state.roundKey === "pilah");
    if (showMap) {
      $("map-round-title").textContent = roundText;
      $("map-timer").textContent = timerText;
      $("map-prompt").textContent = prompt;
      $("map-status").textContent = statusFor(me, st);
      renderMiniMap(me, st);
      renderPlayerMapLabels(st);
      renderLandscapeQuestion(st);
    } else {
      // Hide landscape question when not in map rounds
      var q = $("landscape-question");
      if (q) { q.hidden = true; q.textContent = ""; }
    }

    var playingMove = state.phase === "playing";
    show("stick-area", playingMove);
    document.body.classList.toggle("in-game", playingMove || state.phase === "preround" || state.phase === "between" || state.phase === "finished");

    var isRakit = playingMove && state.roundKey === "rakit";
    var isLock = playingMove && (state.roundKey === "pasal" || state.roundKey === "pilah");
    show("rakit-actions", isRakit);
    show("lock-actions", isLock);

    if (isRakit) {
      var canPickup = !!me.canPickup && !me.carryType;
      var pbtn = $("pickup-btn");
      pbtn.disabled = !canPickup;
      pbtn.textContent = me.carryType ? "Membawa" : (canPickup ? "Ambil" : "Dekati");
      var dbtn = $("drop-btn");
      dbtn.disabled = !me.carryType;
    }
    if (isLock) {
      var inZone = false;
      if (!me.locked && st && (st.stage === "answer")) {
        (state.zones || []).forEach(function (z) {
          if (Math.hypot(me.x - z.x, me.y - z.y) <= z.r) inZone = true;
        });
      }
      var lbtn = $("lock-btn");
      var cbtn = $("cancel-btn");
      lbtn.disabled = me.locked || !inZone || !st || st.stage !== "answer";
      lbtn.textContent = me.locked ? "Terkunci" : "Kunci";
      cbtn.disabled = !me.locked || !st || st.stage !== "answer";
      lbtn.classList.toggle("locked", !!me.locked);
    }

    renderRanking(me);
  }

  var activeDirs = { up: false, down: false, left: false, right: false };
  function updateStick() {
    var x = 0, y = 0;
    if (activeDirs.left) x -= 1;
    if (activeDirs.right) x += 1;
    if (activeDirs.up) y -= 1;
    if (activeDirs.down) y += 1;
    var len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    stick = { x: x, y: y };
  }

  var dpadBtns = $("dpad").querySelectorAll(".dpad-btn");
  for (var di = 0; di < dpadBtns.length; di++) {
    (function (btn) {
      var dir = btn.dataset.dir;
      if (!dir) return;
      function press(e) { e.preventDefault(); activeDirs[dir] = true; btn.classList.add("pressed"); updateStick(); }
      function release() { activeDirs[dir] = false; btn.classList.remove("pressed"); updateStick(); }
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    })(dpadBtns[di]);
  }

  setInterval(function () { if (myTeamId) socket.emit("move", stick); }, 50);

  function playSfx(name) { if (window.GameAudio) GameAudio.sfx(name); }

  $("pickup-btn").addEventListener("click", function () {
    if (!myTeamId) return;
    playSfx("pickup");
    socket.emit("pickup");
  });
  $("drop-btn").addEventListener("click", function () {
    if (!myTeamId) return;
    playSfx("drop");
    socket.emit("drop");
  });
  $("lock-btn").addEventListener("click", function () {
    if (!myTeamId) return;
    playSfx("lock");
    socket.emit("lock", function (res) {
      if (res && !res.ok) { $("status").textContent = res.error || "Gagal mengunci."; playSfx("wrong"); }
    });
  });
  $("cancel-btn").addEventListener("click", function () {
    if (!myTeamId) return;
    playSfx("unlock");
    socket.emit("cancel");
  });

  // --------- AUDIO sync ---------
  var paPrevPhase = null, paPrevRoundKey = null, paPrevStageStage = null, paPrevStageAnswer = null, paPrevBoardCount = 0;
  function syncPlayerAudio(s) {
    if (!window.GameAudio) return;
    var key;
    if (s.phase === "lobby") key = "lobby";
    else if (s.phase === "preround") key = "preround";
    else if (s.phase === "between") key = "between";
    else if (s.phase === "finished") key = "finished";
    else if (s.phase === "playing") {
      key = s.roundKey === "rakit" ? "rakit" : s.roundKey === "pasal" ? "pasal" : s.roundKey === "pilah" ? "pilah" : "lobby";
    } else key = "lobby";
    GameAudio.setPhase(key);
    if (paPrevPhase !== s.phase) {
      if (s.phase === "playing" && paPrevPhase === "preround") GameAudio.sfx("start");
      if (s.phase === "finished") GameAudio.sfx("win");
    }
    var st = s.stage;
    if (st && st.stage === "reveal" && (paPrevStageStage !== "reveal" || paPrevStageAnswer !== st.answer)) {
      // Cek apakah jawaban kita benar (dari results di stage)
      var me = findMe();
      if (me && st.results) {
        var mine = null;
        for (var i = 0; i < st.results.length; i++) if (st.results[i].name === me.name) { mine = st.results[i]; break; }
        if (mine) GameAudio.sfx(mine.ok ? "correct" : "wrong");
        else GameAudio.sfx("reveal");
      } else {
        GameAudio.sfx("reveal");
      }
    }
    // Board slot baru terisi (rakit): sfx thud
    var me2 = findMe();
    if (me2 && s.roundKey === "rakit") {
      if (me2.pieces > paPrevBoardCount) GameAudio.sfx("thud");
      paPrevBoardCount = me2.pieces;
    } else paPrevBoardCount = 0;
    paPrevPhase = s.phase;
    paPrevRoundKey = s.roundKey;
    paPrevStageStage = st ? st.stage : null;
    paPrevStageAnswer = st ? st.answer : null;
  }
  // Tambah listener kedua untuk audio — tidak replace handler asli,
  // supaya state handler pertama (render, dll) tetap aman.
  socket.on("state", function (s) { try { syncPlayerAudio(s); } catch (e) {} });

  // Mute toggle
  var muteBtn = $("mute-toggle");
  function updateMuteIcon() {
    if (!muteBtn) return;
    var icon = $("mute-icon");
    var m = window.GameAudio && GameAudio.isMuted();
    if (icon) icon.innerHTML = m ? "&#x1F507;" : "&#x1F50A;";
    muteBtn.classList.toggle("muted", !!m);
  }
  if (muteBtn) {
    muteBtn.addEventListener("click", function () {
      if (!window.GameAudio) return;
      GameAudio.init();
      GameAudio.toggleMute();
      updateMuteIcon();
    });
    updateMuteIcon();
  }

  function animLoop() {
    if (state && myTeamId) {
      var me = findMe();
      var showMap = state.phase === "playing" && (state.roundKey === "pasal" || state.roundKey === "pilah");
      if (me && showMap) renderMiniMap(me, state.stage);
    }
    requestAnimationFrame(animLoop);
  }
  requestAnimationFrame(animLoop);
})();
