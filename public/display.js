(function () {
  "use strict";

  var socket = io();
  var canvas = document.getElementById("map");
  var ctx = canvas.getContext("2d");
  var state = null;
  var prevRoundIndex = -1;
  var shown = {};
  var hostPin = null;
  var hostOk = false;

  var MAP_W = 1200, MAP_H = 800;
  var LOW_W = 240, LOW_H = 160;
  var SCALE_DOWN = MAP_W / LOW_W;
  canvas.width = LOW_W;
  canvas.height = LOW_H;

  var bg = PixelArt.buildBackground(document, LOW_W, LOW_H, {});
  var mapKey = null;

  function toLow(x, y) { return [x / SCALE_DOWN, y / SCALE_DOWN]; }
  function scaledMap(m) {
    return {
      rivers: (m.rivers || []).map(function (r) { return { x1: r.x1 / SCALE_DOWN, y1: r.y1 / SCALE_DOWN, x2: r.x2 / SCALE_DOWN, y2: r.y2 / SCALE_DOWN, w: r.w / SCALE_DOWN }; }),
      bridges: (m.bridges || []).map(function (b) { return { x: b.x / SCALE_DOWN, y: b.y / SCALE_DOWN, r: b.r / SCALE_DOWN }; }),
    };
  }

  function $(id) { return document.getElementById(id); }
  var logoImg = $("logo-emblem");
  if (logoImg) logoImg.src = PixelArt.emblemDataURL(40);
  var lobbyLogo = $("lobby-logo");
  if (lobbyLogo) lobbyLogo.src = PixelArt.emblemDataURL(64);
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function fmt(sec) { var m = Math.floor(sec / 60); var s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }

  function updateHostUI() {
    var loggedIn = hostOk;
    var loginForm = $("host-login-form"); if (loginForm) loginForm.hidden = loggedIn;
    var ctrlA = $("host-controls"); if (ctrlA) ctrlA.hidden = !loggedIn;
    var ctrlB = $("host-controls-2"); if (ctrlB) ctrlB.hidden = !loggedIn;
  }
  function authHost(pin, cb) {
    socket.emit("host:auth", pin, function (res) {
      hostOk = !!(res && res.ok);
      if (hostOk) hostPin = pin;
      if (cb) cb(res);
      updateHostUI();
    });
  }

  var loginForm = $("host-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      authHost($("pin").value, function (res) {
        var m = $("host-msg"); if (m) m.textContent = res && res.ok ? "Kontrol host aktif." : (res && res.error) || "Gagal.";
      });
      try { $("pin").blur(); } catch (e) {}
    });
  }

  function hostCmd(name, msgId) {
    return function () {
      socket.emit(name, function (res) {
        var m = $(msgId || "host-msg"); if (m) m.textContent = res && res.ok ? "" : (res && res.error) || "";
      });
    };
  }
  var sb = $("btn-start"); if (sb) sb.addEventListener("click", hostCmd("host:start", "host-msg"));
  var bg2 = $("btn-begin"); if (bg2) bg2.addEventListener("click", hostCmd("host:beginPlay", "host-msg-2"));
  var skb = $("btn-skip"); if (skb) skb.addEventListener("click", hostCmd("host:skip", "host-msg-2"));
  var rb = $("btn-reset"); if (rb) rb.addEventListener("click", function () { if (window.confirm("Reset semua tim dan skor?")) hostCmd("host:reset", "host-msg")(); });
  var rb2 = $("btn-reset-2"); if (rb2) rb2.addEventListener("click", function () { if (window.confirm("Reset semua tim dan skor?")) hostCmd("host:reset", "host-msg-2")(); });
  var nsb = $("btn-new-session");
  if (nsb) nsb.addEventListener("click", function () {
    function doReset() {
      if (!window.confirm("Mulai sesi baru? Semua tim & skor akan direset dan pemain harus join ulang.")) return;
      socket.emit("host:reset", function (res) {
        var note = $("winner-note");
        if (res && res.ok) {
          if (note) note.textContent = "Sesi direset. Pemain akan kembali ke halaman join.";
        } else {
          if (note) note.textContent = (res && res.error) || "Gagal reset. Coba masukkan PIN lagi.";
        }
      });
    }
    if (hostOk) { doReset(); return; }
    var pin = window.prompt("Masukkan PIN host untuk mulai sesi baru:");
    if (pin == null) return;
    authHost(String(pin), function (res) {
      if (res && res.ok) {
        doReset();
      } else {
        var note = $("winner-note");
        if (note) note.textContent = (res && res.error) || "PIN salah.";
      }
    });
  });

  socket.on("connect", function () { if (hostPin) authHost(hostPin); });

  socket.on("state", function (s) {
    state = s;
    if (s.map && s.map.name !== mapKey) {
      mapKey = s.map.name;
      bg = PixelArt.buildBackground(document, LOW_W, LOW_H, scaledMap(s.map));
    }
    handlePhaseTransition(s);
    renderPhaseLayout(s);
    renderPanel();
    renderMapLabels(s);
    renderPasalOverlay(s);
    renderRevealPopup(s);
    renderLobby(s);
    renderPreround(s);
    renderBetweenIntro(s);
    renderWinnerScreen(s);
  });

  function handlePhaseTransition(s) {
    var isNewRound = s.phase === "playing" && s.roundIndex !== prevRoundIndex;
    if (isNewRound) showRoundIntro(s);
    prevRoundIndex = s.roundIndex;
  }

  function showRoundIntro(s) {
    var intro = $("round-intro");
    var title = $("round-intro-title");
    var desc = $("round-intro-desc");
    if (!intro || !title) return;
    title.textContent = "RONDE " + (s.roundIndex + 1) + ": " + (s.roundTitle || "").toUpperCase();
    desc.textContent = s.roundDesc || "";
    intro.hidden = false;
    intro.classList.remove("show");
    void intro.offsetWidth;
    intro.classList.add("show");
    setTimeout(function () {
      if (intro) {
        intro.classList.remove("show");
        setTimeout(function () { intro.hidden = true; }, 500);
      }
    }, 3000);
  }

  function renderPhaseLayout(s) {
    var lobby = $("lobby-screen");
    var preround = $("preround-screen");
    var game = $("game-layout");
    var below = $("below-fold");
    var isLobby = s.phase === "lobby";
    var isPreround = s.phase === "preround";
    var isGame = s.phase === "playing" || s.phase === "between" || s.phase === "finished";
    var isFinished = s.phase === "finished";
    if (lobby) lobby.hidden = !isLobby;
    if (preround) preround.hidden = !isPreround;
    if (game) game.hidden = !isGame;
    if (below) below.hidden = !isGame;
    // Saat finished, sembunyikan seluruh kartu Host di sidebar. Cukup pakai
    // tombol MULAI SESI BARU di winner screen untuk kontrol akhir.
    var hostSide = $("host");
    if (hostSide) hostSide.style.display = isFinished ? "none" : "";
    var skb = $("btn-skip"); if (skb) skb.style.display = isFinished ? "none" : "";
    var rb2 = $("btn-reset-2"); if (rb2) rb2.style.display = isFinished ? "none" : "";
  }

  function renderPreround(s) {
    if (s.phase !== "preround") return;
    var badge = $("preround-badge");
    var title = $("preround-title");
    var desc = $("preround-desc");
    if (badge) badge.textContent = "Ronde " + (s.roundIndex + 1) + " dari " + s.roundCount;
    if (title) title.textContent = (s.roundTitle || "").toUpperCase();
    if (desc) desc.textContent = s.roundDesc || "";
  }

  function renderPanel() {
    if (!state) return;
    var s = state;
    var phaseText = { lobby: "Menunggu host", preround: "Bersiap", playing: "Sedang berlangsung", between: "Jeda antar ronde", finished: "Permainan selesai" };
    var pl = $("phase-label"); if (pl) pl.textContent = phaseText[s.phase] || s.phase;

    var title = "Jejak Wawasan Nusantara";
    if (s.phase === "preround") title = "Bersiap: " + (s.roundTitle || "");
    else if (s.phase === "playing") title = s.roundTitle;
    else if (s.phase === "between") title = "Berikutnya: " + (s.nextRoundTitle || "");
    else if (s.phase === "finished") title = "Juara ada di papan skor";
    var rt = $("round-title"); if (rt) rt.textContent = title;

    var timer = "";
    if (s.phase === "playing") timer = "Sisa waktu ronde " + fmt(s.roundLeft);
    else if (s.phase === "between") timer = "Mulai dalam " + s.betweenLeft + " detik";
    else if (s.phase === "preround") timer = "Menunggu host klik Mulai Ronde";
    var tm = $("timer"); if (tm) tm.textContent = timer;

    var prompt = "";
    if (s.phase === "lobby") prompt = "Buka alamat di HP, masukkan nama dan nama tim. Host menekan Mulai saat semua siap.";
    else if (s.phase === "preround") prompt = s.roundDesc || "";
    else if (s.phase === "playing" && s.stage) prompt = s.stage.prompt || "";
    var pm = $("prompt"); if (pm) pm.textContent = prompt;

    renderStageExtra(s);
    renderRanking(s);
    renderUrls(s);
    var tc = $("team-count"); if (tc) tc.textContent = s.teams.length + " dari 15 tim sudah masuk";
  }

  function zoneLabel(code, s) {
    var zones = (s && s.zones) || [];
    for (var i = 0; i < zones.length; i++) if (zones[i].code === code) return zones[i].label;
    return code || "-";
  }

  function renderStageExtra(s) {
    var box = $("stage-extra");
    if (!box) return;
    box.textContent = "";
    var st = s.stage;
    if (!st || s.phase !== "playing") return;
    if (st.kind === "pasal") {
      box.appendChild(el("p", "stage-line", "Soal " + st.questionNo + " dari " + st.total));
      if (st.stage === "answer") box.appendChild(el("p", "stage-line", "Waktu menjawab: " + st.timeLeft + " dtk"));
      else if (st.stage === "hold") box.appendChild(el("p", "stage-line", "Semua tim mengunci. Buka jawaban dalam " + st.holdLeft + " dtk..."));
      else if (st.stage === "reveal") box.appendChild(el("p", "stage-line win", "Jawaban: " + zoneLabel(st.answer, s)));
      if (st.stage === "reveal" && st.results && st.results.length) {
        st.results.forEach(function (r) {
          var txt = r.name + ": " + (r.zoneCode ? zoneLabel(r.zoneCode, s) : "tidak menjawab") +
            (r.zoneCode ? " (" + (r.ok ? "benar" : "salah") + " " + (r.pts > 0 ? "+" : "") + r.pts + ")" : "");
          box.appendChild(el("p", "stage-line", txt));
        });
      }
    } else if (st.kind === "pilah") {
      box.appendChild(el("p", "stage-line", "Kartu " + st.cardNo + " dari " + st.total));
      if (st.card) box.appendChild(el("p", "stage-line", "Kartu: " + st.card));
      if (st.stage === "answer") box.appendChild(el("p", "stage-line", "Waktu: " + st.timeLeft + " dtk"));
      else if (st.stage === "hold") box.appendChild(el("p", "stage-line", "Semua mengunci. Reveal dalam " + st.holdLeft + " dtk..."));
      else if (st.stage === "reveal") box.appendChild(el("p", "stage-line win", "Jawaban: " + zoneLabel(st.answer, s)));
      if (st.stage === "reveal" && st.results && st.results.length) {
        st.results.forEach(function (r) {
          var txt = r.name + ": " + (r.zoneCode ? zoneLabel(r.zoneCode, s) : "tidak menjawab") +
            (r.zoneCode ? " (" + (r.ok ? "benar" : "salah") + " " + (r.pts > 0 ? "+" : "") + r.pts + ")" : "");
          box.appendChild(el("p", "stage-line", txt));
        });
      }
    }
  }

  function renderRanking(s) {
    var list = $("ranking");
    if (!list) return;
    list.textContent = "";
    (s.scoreboard || []).forEach(function (t) {
      var li = el("li");
      var img = el("img", "ranking-dot");
      img.src = PixelArt.avatarDataURL(t.color, 24);
      img.alt = "";
      li.appendChild(img);
      li.appendChild(document.createTextNode(t.name + " - " + t.score + " poin"));
      list.appendChild(li);
    });
  }

  function renderUrls(s) {
    var list = $("urls");
    if (!list) return;
    if (list.dataset.key !== (s.lanUrls || []).join("|")) {
      list.dataset.key = (s.lanUrls || []).join("|");
      list.textContent = "";
      (s.lanUrls || []).forEach(function (u) {
        var li = el("li");
        var a = el("a", null, u);
        a.href = u; a.target = "_blank";
        li.appendChild(a); list.appendChild(li);
      });
      if (!(s.lanUrls || []).length) list.appendChild(el("li", "muted", "Alamat jaringan tidak ditemukan. Cek WiFi laptop."));
    }
    renderJoinUrlAndQr(s);
  }

  function joinUrl() {
    var origin = window.location.origin;
    if (/localhost|127\.0\.0\.1/.test(origin) && state && state.lanUrls && state.lanUrls.length) {
      return state.lanUrls[0];
    }
    return origin;
  }

  function makeQr(url, box) {
    if (!box) return;
    if (box.dataset.url === url) return;
    box.dataset.url = url;
    box.textContent = "";
    if (typeof qrcode === "undefined") { box.textContent = "QR library gagal dimuat."; return; }
    try {
      var qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) { box.textContent = "Gagal buat QR: " + e.message; }
  }

  function renderJoinUrlAndQr(s) {
    var url = joinUrl();
    var urlEl = $("join-url"); if (urlEl) urlEl.textContent = url;
    var urlEl2 = $("lobby-join-url"); if (urlEl2) urlEl2.textContent = url;
    makeQr(url, $("qrcode"));
    makeQr(url, $("lobby-qrcode"));
  }

  function renderLobby(s) {
    if (s.phase !== "lobby") return;
    var count = (s.teams || []).length;
    var cEl = $("lobby-team-count"); if (cEl) cEl.textContent = count;
    var waiting = $("lobby-waiting");
    if (waiting) waiting.hidden = count > 0;
    var grid = $("lobby-teams-grid");
    if (!grid) return;
    var sig = (s.teams || []).map(function (t) { return t.id + "|" + t.name + "|" + t.color; }).join("::");
    if (grid.dataset.sig === sig) return;
    grid.dataset.sig = sig;
    grid.textContent = "";
    (s.teams || []).forEach(function (t, i) {
      var chip = el("div", "lobby-team-chip");
      chip.style.setProperty("--tc", t.color);
      chip.style.animationDelay = (i * 0.05) + "s";
      var img = el("img", "lobby-team-avatar pixel-img");
      img.src = PixelArt.avatarDataURL(t.color, 40);
      img.alt = "";
      chip.appendChild(img);
      chip.appendChild(el("span", "lobby-team-name", t.name));
      chip.appendChild(el("span", "lobby-team-members", t.members + " HP"));
      grid.appendChild(chip);
    });
  }

  function renderBetweenIntro(s) {
    var box = $("between-intro");
    if (!box) return;
    var active = s.phase === "between";
    box.hidden = !active;
    if (!active) return;
    var tt = $("between-intro-title"); if (tt) tt.textContent = "Berikutnya: " + (s.nextRoundTitle || "");
    var cd = $("between-intro-countdown"); if (cd) cd.textContent = "Mulai dalam " + s.betweenLeft + " detik...";
  }

  function renderPasalOverlay(s) {
    var ov = $("pasal-overlay");
    if (!ov) return;
    var st = s && s.stage;
    var active = s.phase === "playing" && s.roundKey === "pasal" &&
      st && (st.stage === "answer" || st.stage === "hold");
    ov.hidden = !active;
    if (!active) return;
    $("pasal-overlay-q").textContent = st.prompt || "";
    var timer = "";
    if (st.stage === "answer") timer = "Waktu menjawab: " + st.timeLeft + " detik";
    else if (st.stage === "hold") timer = "Membuka jawaban dalam " + st.holdLeft + " detik";
    $("pasal-overlay-timer").textContent = timer;
    var locked = 0;
    var total = (s.teams || []).length;
    (s.teams || []).forEach(function (t) { if (t.locked) locked++; });
    $("pasal-lock-counter").textContent = locked + " / " + total + " tim mengunci jawaban";
  }

  function renderRevealPopup(s) {
    var st = s && s.stage;
    var pop = $("reveal-popup");
    if (!pop) return;
    var active = s.phase === "playing" && (s.roundKey === "pasal" || s.roundKey === "pilah") &&
      st && st.stage === "reveal" && st.answer;
    pop.hidden = !active;
    if (!active) return;
    var label = zoneLabel(st.answer, s);
    $("reveal-title").textContent = label.toUpperCase();
    var subText = "";
    if (st.kind === "pasal") subText = "Soal " + st.questionNo + " / " + st.total;
    if (st.kind === "pilah") subText = "Kartu: " + (st.card || "");
    $("reveal-sub").textContent = subText;
  }

  var winnerSig = null;
  function renderWinnerScreen(s) {
    var scr = $("winner-screen");
    if (!scr) return;
    var active = s.phase === "finished" && (s.scoreboard || []).length > 0;
    scr.hidden = !active;
    if (!active) { winnerSig = null; return; }
    var sig = (s.scoreboard || []).map(function (t) { return t.id + ":" + t.score; }).join("|");
    if (sig === winnerSig) return;
    winnerSig = sig;

    var top3 = (s.scoreboard || []).slice(0, 3);
    var podium = $("winner-podium");
    if (podium) {
      podium.textContent = "";
      var order = [1, 0, 2];
      order.forEach(function (idx) {
        if (idx >= top3.length) return;
        var t = top3[idx];
        var rank = idx + 1;
        var col = el("div", "podium-col podium-col-rank-" + rank);
        var img = el("img", "podium-avatar pixel-img");
        img.src = PixelArt.avatarDataURL(t.color, 72);
        img.alt = "";
        col.appendChild(img);
        col.appendChild(el("p", "podium-name", t.name));
        col.appendChild(el("p", "podium-score", t.score + " poin"));
        var block = el("div", "podium-block podium-rank-" + rank);
        block.appendChild(el("span", "podium-medal", rank === 1 ? "1" : rank === 2 ? "2" : "3"));
        col.appendChild(block);
        podium.appendChild(col);
      });
    }
    var lb = $("winner-leaderboard");
    if (lb) {
      lb.textContent = "";
      (s.scoreboard || []).forEach(function (t, idx) {
        var li = el("li", "wlb-row" + (idx < 3 ? " wlb-top" : ""));
        li.style.animationDelay = (0.6 + idx * 0.07) + "s";
        var rank = el("span", "wlb-rank", "#" + (idx + 1));
        var img = el("img", "wlb-avatar pixel-img");
        img.src = PixelArt.avatarDataURL(t.color, 24);
        img.alt = "";
        var name = el("span", "wlb-name", t.name);
        var score = el("span", "wlb-score", t.score + " poin");
        li.appendChild(rank);
        li.appendChild(img);
        li.appendChild(name);
        li.appendChild(score);
        lb.appendChild(li);
      });
    }
  }

  var labelPool = {};
  var labelsLayer = $("map-labels");

  function labelFor(key, cls) {
    var l = labelPool[key];
    if (!l) { l = el("div", cls); labelPool[key] = l; labelsLayer.appendChild(l); }
    l.className = cls;
    return l;
  }
  function placeLabel(l, x, y) { l.style.left = (x / MAP_W * 100) + "%"; l.style.top = (y / MAP_H * 100) + "%"; }
  function sweepLabels(prefix, activeKeys) {
    Object.keys(labelPool).forEach(function (k) {
      if (k.indexOf(prefix) === 0 && activeKeys.indexOf(k) === -1) { labelPool[k].remove(); delete labelPool[k]; }
    });
  }

  function renderMapLabels(s) {
    if (!labelsLayer) return;
    var hideTeams = !!s.hideTeamsOnDisplay;
    var activeTeam = [];
    if (!hideTeams && (s.phase === "playing" || s.phase === "between" || s.phase === "finished")) {
      (s.teams || []).forEach(function (t) {
        var key = "team:" + t.id;
        activeTeam.push(key);
        var l = labelFor(key, "map-label map-label-team" + (t.locked ? " locked" : ""));
        l.textContent = t.name + (t.locked ? " L" : "");
        l.style.setProperty("--tc", t.color);
        placeLabel(l, t.x, t.y - 46);
        if (s.roundKey === "rakit") {
          var bkey = "base:" + t.id;
          activeTeam.push(bkey);
          var bl = labelFor(bkey, "map-label map-label-base");
          bl.textContent = "Papan " + t.pieces + "/9";
          bl.style.setProperty("--tc", t.color);
          placeLabel(bl, t.spawnX, t.spawnY + 58);
        }
      });
    }
    sweepLabels("team:", activeTeam);
    sweepLabels("base:", activeTeam);

    var activeZone = [];
    if (s.phase === "playing") {
      (s.zones || []).forEach(function (z) {
        var key = "zone:" + z.code;
        activeZone.push(key);
        var l = labelFor(key, "map-label map-label-zone");
        l.textContent = z.label;
        l.style.setProperty("--tc", z.color);
        placeLabel(l, z.x, z.y + z.r + 10);
      });
    }
    sweepLabels("zone:", activeZone);
  }

  function pieceDef(id) {
    var defs = (state && state.pieceDefs) || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return null;
  }

  function draw() {
    ctx.drawImage(bg, 0, 0);
    if (!state) return;
    ((state.map && state.map.rocks) || []).forEach(function (ob, idx) {
      var p = toLow(ob.x, ob.y);
      PixelArt.drawObstacle(ctx, p[0], p[1], ob.r / SCALE_DOWN, idx);
    });
    var now = performance.now();
    (state.zones || []).forEach(function (z) {
      var p = toLow(z.x, z.y);
      var zr = z.r / SCALE_DOWN;
      PixelArt.ditherCircle(ctx, p[0], p[1], zr, z.color);
      PixelArt.drawFlag(ctx, p[0], p[1] + zr - 2, z.color, 1);
      var st = state.stage;
      if (st && st.stage === "reveal" && st.answer === z.code) {
        ctx.strokeStyle = "#ffd54d";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p[0], p[1], zr + 1, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    var showBases = state.roundKey === "rakit";
    if (showBases) {
      state.teams.forEach(function (t) {
        var p = toLow(t.spawnX, t.spawnY);
        PixelArt.dashedRing(ctx, p[0], p[1], 80 / SCALE_DOWN, t.color, 18);
        PixelArt.drawFlag(ctx, p[0] - 10, p[1], t.color, 1);
      });
    }
    (state.pieces || []).forEach(function (pc) {
      var p = toLow(pc.x, pc.y);
      var def = pieceDef(pc.type);
      PixelArt.drawPieceIcon(ctx, p[0], p[1], pc.type, def ? def.color : "#cccccc", 1.1);
    });
    var hideTeams = !!state.hideTeamsOnDisplay;
    if (!hideTeams) {
      state.teams.forEach(function (t) {
        var p = toLow(t.x, t.y);
        var sh = shown[t.id];
        if (!sh) sh = shown[t.id] = { x: p[0], y: p[1] };
        var moving = Math.hypot(p[0] - sh.x, p[1] - sh.y) > 0.15;
        sh.x += (p[0] - sh.x) * 0.25;
        sh.y += (p[1] - sh.y) * 0.25;
        PixelArt.drawCharacter(ctx, sh.x, sh.y, t.color, now, moving, 1);
        if (t.carryType) {
          var d = pieceDef(t.carryType);
          if (d) PixelArt.drawPieceIcon(ctx, sh.x + 7, sh.y - 11, t.carryType, d.color, 0.8);
        }
        if (t.locked) {
          var pct = ((now / 700) % 1);
          ctx.strokeStyle = "#ffd54d";
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 1 - pct;
          ctx.beginPath();
          ctx.arc(sh.x, sh.y - 1, 2 + pct * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    }
    var ids = state.teams.map(function (t) { return t.id; });
    Object.keys(shown).forEach(function (id) { if (ids.indexOf(id) === -1) delete shown[id]; });
  }

  function frame() { draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
