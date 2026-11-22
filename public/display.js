(function () {
  "use strict";

  var socket = io();
  var canvas = document.getElementById("map");
  var ctx = canvas.getContext("2d");
  var state = null;
  var shown = {}; 
  var hostPin = null;
  var hostOk = false;

  var MAP_W = 1200, MAP_H = 800;
  var LOW_W = 240, LOW_H = 160; 
  var SCALE_DOWN = MAP_W / LOW_W; 
  canvas.width = LOW_W;
  canvas.height = LOW_H;

  // Latar dibangun ulang tiap kali peta (nama preset) berubah, bukan sekali
  // saat load, supaya sungai/jembatan tiap preset tampil benar.
  var bg = PixelArt.buildBackground(document, LOW_W, LOW_H, {});
  var mapKey = null;

  function toLow(x, y) { return [x / SCALE_DOWN, y / SCALE_DOWN]; }
  function scaledMap(m) {
    return {
      rivers: (m.rivers || []).map(function (r) {
        return { x1: r.x1 / SCALE_DOWN, y1: r.y1 / SCALE_DOWN, x2: r.x2 / SCALE_DOWN, y2: r.y2 / SCALE_DOWN, w: r.w / SCALE_DOWN };
      }),
      bridges: (m.bridges || []).map(function (b) {
        return { x: b.x / SCALE_DOWN, y: b.y / SCALE_DOWN, r: b.r / SCALE_DOWN };
      }),
    };
  }

  function $(id) { return document.getElementById(id); }
  var logoImg = $("logo-emblem");
  if (logoImg) logoImg.src = PixelArt.emblemDataURL(40);
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // ---------- Kontrol host ----------
  function updateHostUI() {
    $("host-login").hidden = hostOk;
    $("host-controls").hidden = !hostOk;
  }
  function authHost(pin, cb) {
    socket.emit("host:auth", pin, function (res) {
      hostOk = !!(res && res.ok);
      if (hostOk) hostPin = pin;
      if (cb) cb(res);
      updateHostUI();
    });
  }
  $("pin-btn").addEventListener("click", function () {
    authHost($("pin").value, function (res) {
      $("host-msg").textContent = res && res.ok ? "Kontrol host aktif." : (res && res.error) || "Gagal.";
    });
  });
  function hostCmd(name) {
    return function () {
      socket.emit(name, function (res) {
        $("host-msg").textContent = res && res.ok ? "" : (res && res.error) || "";
      });
    };
  }
  $("btn-start").addEventListener("click", hostCmd("host:start"));
  $("btn-skip").addEventListener("click", hostCmd("host:skip"));
  $("btn-reset").addEventListener("click", function () {
    if (window.confirm("Reset semua tim dan skor?")) hostCmd("host:reset")();
  });

  socket.on("connect", function () {
    if (hostPin) authHost(hostPin);
  });

  // ---------- Data dari server ----------
  socket.on("state", function (s) {
    state = s;
    if (s.map && s.map.name !== mapKey) {
      mapKey = s.map.name;
      bg = PixelArt.buildBackground(document, LOW_W, LOW_H, scaledMap(s.map));
    }
    renderPanel();
    renderMapLabels(s);
  });

  // ---------- Panel kanan ----------
  function renderPanel() {
    if (!state) return;
    var s = state;
    var phaseText = {
      lobby: "Menunggu host",
      playing: "Sedang berlangsung",
      between: "Jeda antar ronde",
      finished: "Permainan selesai"
    };
    $("phase-label").textContent = phaseText[s.phase] || s.phase;

    var title = "Jejak Identitas Nusantara";
    if (s.phase === "playing") title = s.roundTitle;
    else if (s.phase === "between") title = "Berikutnya: " + (s.nextRoundTitle || "");
    else if (s.phase === "finished") title = "Juara ada di papan skor";
    $("round-title").textContent = title;

    var timer = "";
    if (s.phase === "playing") timer = "Sisa waktu ronde " + fmt(s.roundLeft);
    else if (s.phase === "between") timer = "Mulai dalam " + s.betweenLeft + " detik";
    $("timer").textContent = timer;

    var prompt = "";
    if (s.phase === "lobby") prompt = "Buka alamat di HP, masukkan nama dan nama tim. Host menekan Mulai saat semua siap.";
    else if (s.phase === "playing" && s.stage) prompt = s.stage.prompt || "";
    $("prompt").textContent = prompt;

    renderStageExtra(s);
    renderRanking(s);
    renderUrls(s);
    $("team-count").textContent = s.teams.length + " dari 15 tim sudah masuk";
  }

  function renderStageExtra(s) {
    var box = $("stage-extra");
    box.textContent = "";
    var st = s.stage;
    if (!st || s.phase !== "playing") return;

    if (st.kind === "pasal") {
      box.appendChild(el("p", "stage-line", "Soal " + st.questionNo + " dari " + st.total + (st.timeLeft ? " - " + st.timeLeft + " detik" : "")));
      if (st.results && st.results.length) {
        st.results.forEach(function (r) {
          box.appendChild(el("p", "stage-line", r.name + ": " + (r.ok ? "benar" : "salah") + " (" + (r.pts > 0 ? "+" : "") + r.pts + ")"));
        });
      }
    } else if (st.kind === "pilah") {
      box.appendChild(el("p", "stage-line", "Kartu " + st.cardNo + " dari " + st.total + (st.card ? " - " + st.timeLeft + " detik" : "")));
      if (st.card) box.appendChild(el("p", "stage-line", "Kartu: " + st.card));
      if (st.last) {
        var txt = st.last.team
          ? "Hasil: " + st.last.team + (st.last.ok ? " benar" : " salah") + " (" + (st.last.pts > 0 ? "+" : "") + st.last.pts + ")"
          : "Hasil: tidak ada yang menjawab";
        box.appendChild(el("p", "stage-line", txt));
      }
    } else if (st.kind === "sidang") {
      box.appendChild(el("p", "stage-line", "Pertanyaan " + st.questionNo + " dari " + st.total + (st.stage === "vote" ? " - voting " + st.timeLeft + " detik" : "")));
      var reveal = st.stage === "reveal" ? st.reveal : null;
      (st.options || []).forEach(function (opt) {
        var row = el("div", "opt-row" + (reveal && reveal.winner === opt ? " win" : ""));
        row.appendChild(el("span", null, opt));
        row.appendChild(el("b", null, String((st.counts && st.counts[opt]) || 0)));
        box.appendChild(row);
      });
      if (reveal && reveal.voters && reveal.voters.length) {
        box.appendChild(el("p", "stage-line", "Pemenang voting: " + reveal.voters[0].name + " (+30). Tim lain yang sama: +10."));
      }
    }
  }

  function renderRanking(s) {
    var list = $("ranking");
    list.textContent = "";
    (s.scoreboard || []).forEach(function (t) {
      var li = el("li");
      var img = el("img", "ranking-dot");
      img.src = PixelArt.avatarDataURL(t.color, 24);
      img.alt = "";
      li.appendChild(img);
      li.appendChild(document.createTextNode(t.name + " - " + t.score + " poin (potongan " + t.pieces + "/9)"));
      list.appendChild(li);
    });
  }

  function renderUrls(s) {
    var list = $("urls");
    if (list.dataset.key === (s.lanUrls || []).join("|")) return;
    list.dataset.key = (s.lanUrls || []).join("|");
    list.textContent = "";
    (s.lanUrls || []).forEach(function (u) {
      var li = el("li");
      var a = el("a", null, u);
      a.href = u;
      a.target = "_blank";
      li.appendChild(a);
      list.appendChild(li);
    });
    if (!(s.lanUrls || []).length) list.appendChild(el("li", "muted", "Alamat jaringan tidak ditemukan. Cek WiFi laptop."));
  }

  // ---------- Label di atas peta (DOM, supaya teks tajam) ----------
  var labelPool = {}; // key -> elemen
  var labelsLayer = $("map-labels");

  function labelFor(key, cls) {
    var l = labelPool[key];
    if (!l) {
      l = el("div", cls);
      labelPool[key] = l;
      labelsLayer.appendChild(l);
    }
    return l;
  }
  function placeLabel(l, x, y) {
    l.style.left = (x / MAP_W * 100) + "%";
    l.style.top = (y / MAP_H * 100) + "%";
  }
  function sweepLabels(prefix, activeKeys) {
    Object.keys(labelPool).forEach(function (k) {
      if (k.indexOf(prefix) === 0 && activeKeys.indexOf(k) === -1) {
        labelPool[k].remove();
        delete labelPool[k];
      }
    });
  }

  function renderMapLabels(s) {
    var activeTeam = [];
    (s.teams || []).forEach(function (t) {
      var key = "team:" + t.id;
      activeTeam.push(key);
      var l = labelFor(key, "map-label map-label-team");
      l.textContent = t.name;
      l.style.setProperty("--tc", t.color);
      placeLabel(l, t.x, t.y - 46);

      var bkey = "base:" + t.id;
      activeTeam.push(bkey);
      var bl = labelFor(bkey, "map-label map-label-base");
      bl.textContent = "Papan " + t.pieces + "/9";
      bl.style.setProperty("--tc", t.color);
      placeLabel(bl, t.spawnX, t.spawnY + 58);
    });
    sweepLabels("team:", activeTeam);
    sweepLabels("base:", activeTeam);

    var activeZone = [];
    (s.zones || []).forEach(function (z) {
      var key = "zone:" + z.code;
      activeZone.push(key);
      var l = labelFor(key, "map-label map-label-zone");
      l.textContent = (z.code && z.code.length === 1 ? z.code + " · " : "") + z.label;
      l.style.setProperty("--tc", z.color);
      placeLabel(l, z.x, z.y + z.r + 10);
    });
    sweepLabels("zone:", activeZone);
  }

  // ---------- Peta (canvas) ----------
  function pieceDef(id) {
    var defs = (state && state.pieceDefs) || [];
    for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
    return null;
  }

  function draw() {
    ctx.drawImage(bg, 0, 0);

    if (!state) return;

    // Rintangan: bagian peta yang tidak bisa dilewati (nabrak dan mentok).
    ((state.map && state.map.rocks) || []).forEach(function (ob, idx) {
      var p = toLow(ob.x, ob.y);
      PixelArt.drawObstacle(ctx, p[0], p[1], ob.r / SCALE_DOWN, idx);
    });

    // Zona (ronde 2 dan 3): tanda tanah berpola titik-titik (dither) + bendera.
    (state.zones || []).forEach(function (z) {
      var p = toLow(z.x, z.y);
      PixelArt.ditherCircle(ctx, p[0], p[1], z.r / SCALE_DOWN, z.color);
      PixelArt.drawFlag(ctx, p[0], p[1] + z.r / SCALE_DOWN - 2, z.color, 1);
    });

    // Pangkalan tiap tim: cincin titik-titik + bendera warna tim.
    state.teams.forEach(function (t) {
      var p = toLow(t.spawnX, t.spawnY);
      PixelArt.dashedRing(ctx, p[0], p[1], 80 / SCALE_DOWN, t.color, 18);
      PixelArt.drawFlag(ctx, p[0] - 10, p[1], t.color, 1);
    });

    // Potongan lambang yang tersebar di peta.
    (state.pieces || []).forEach(function (pc) {
      var p = toLow(pc.x, pc.y);
      var def = pieceDef(pc.type);
      PixelArt.drawPieceIcon(ctx, p[0], p[1], pc.type, def ? def.color : "#cccccc", 1.1);
    });

    // Karakter tim (posisi dihaluskan + animasi jalan).
    var now = performance.now();
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
    });

    // Buang sisa posisi tim yang sudah tidak ada (reset/keluar).
    var ids = state.teams.map(function (t) { return t.id; });
    Object.keys(shown).forEach(function (id) { if (ids.indexOf(id) === -1) delete shown[id]; });
  }

  function frame() {
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
