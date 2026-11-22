(function () {
  "use strict";

  var socket = io();
  var SAVE_KEY = "kwn-jejak-join";
  var myTeamId = null;
  var myTeamName = "";
  var myName = "";
  var state = null;
  var stick = { x: 0, y: 0 };
  var optionsKey = "";

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).hidden = !on; }

  function saveJoin() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ name: myName, team: myTeamName })); } catch (e) {}
  }
  function loadJoin() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; }
  }
  function clearJoin() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  function fmt(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var logoImg = $("logo-emblem");
  if (logoImg && window.PixelArt) logoImg.src = PixelArt.emblemDataURL(72);

  function doJoin(name, team, cb) {
    socket.emit("join", { name: name, team: team }, function (res) {
      if (res && res.ok) {
        myTeamId = res.teamId;
        myTeamName = res.teamName;
        myName = name;
        saveJoin();
        show("join", false);
        show("game", true);
        $("join-error").textContent = "";
      }
      if (cb) cb(res);
    });
  }

  // Prefill form dari data tersimpan.
  var saved = loadJoin();
  if (saved) {
    $("name").value = saved.name || "";
    $("team").value = saved.team || "";
  }

  $("join-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("name").value.trim();
    var team = $("team").value.trim();
    if (!name || !team) {
      $("join-error").textContent = "Isi nama dan nama tim dulu.";
      return;
    }
    $("join-error").textContent = "Menghubungkan...";
    doJoin(name, team, function (res) {
      if (!res || !res.ok) $("join-error").textContent = (res && res.error) || "Gagal masuk.";
    });
  });

  // Setiap (re)connect, masuk lagi otomatis kalau sebelumnya sudah masuk.
  socket.on("connect", function () {
    var s = loadJoin();
    if (s && s.name && s.team) doJoin(s.name, s.team);
  });

  socket.on("reset", function () {
    myTeamId = null;
    myTeamName = "";
    clearJoin();
    show("game", false);
    show("join", true);
  });

  socket.on("state", function (s) {
    state = s;
    render();
  });

  // ---------- Tampilan ----------
  function findMe() {
    if (!state || !myTeamId) return null;
    for (var i = 0; i < state.teams.length; i++) {
      if (state.teams[i].id === myTeamId) return state.teams[i];
    }
    return null;
  }

  var iconCache = {};
  function pieceIcon(d, size) {
    var key = d.id + "|" + d.color + "|" + size;
    if (!iconCache[key]) iconCache[key] = PixelArt.iconDataURL(d.id, d.color, size);
    return iconCache[key];
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
      img.alt = "";
      img.src = pieceIcon(d, 32);
      if (!filled) img.style.opacity = "0.35";
      slot.appendChild(img);
      slot.appendChild(el("span", null, d.label));
      board.appendChild(slot);
    }
    $("board-count").textContent = me.pieces;
  }

  function statusFor(me, st) {
    if (state.phase === "lobby") return "Tunggu host memulai permainan.";
    if (state.phase === "finished") return "Permainan sudah selesai. Lihat papan skor.";
    if (state.phase === "between") return "Ronde berikutnya: " + (state.nextRoundTitle || "") + ".";
    if (!st) return "";
    if (state.roundKey === "rakit") {
      if (me.carryType) return "Kamu membawa potongan. Bawa ke pangkalan tim.";
      return me.canPickup ? "Potongan sudah dekat. Tekan Ambil Barang." : "Belum membawa potongan.";
    }
    if (state.roundKey === "pasal") {
      var mine = null;
      var results = st.results || [];
      for (var i = 0; i < results.length; i++) if (results[i].teamId === me.id) mine = results[i];
      if (mine) {
        return "Jawaban tim: " + (mine.ok ? "benar" : "salah") + " (" + (mine.pts > 0 ? "+" : "") + mine.pts + " poin).";
      }
      return "Lari ke zona jawaban yang kamu anggap benar. Hanya satu kali menjawab per soal.";
    }
    if (state.roundKey === "pilah") {
      var last = st.last;
      if (last) {
        if (!last.team) return "Kartu sebelumnya tidak dijawab siapa pun.";
        return "Kartu sebelumnya: " + last.team + (last.ok ? " benar" : " salah") + " (" + (last.pts > 0 ? "+" : "") + last.pts + ").";
      }
      return "Bawa kartu ke zona yang sesuai.";
    }
    if (state.roundKey === "sidang") {
      if (st.stage === "reveal") return "Jawaban terpilih: " + (st.reveal && st.reveal.winner ? st.reveal.winner : "tidak ada suara") + ".";
      if (st.votedTeams && st.votedTeams.indexOf(me.id) !== -1) return "Pilihan tim sudah terkirim. Tunggu hasilnya.";
      if (st.stage === "vote") return "Diskusikan bersama tim, lalu pilih satu jawaban.";
    }
    return "";
  }

  function renderOptions(me, st) {
    var box = $("options");
    var key = st.questionNo + "|" + (st.options || []).join("|");
    if (key !== optionsKey) {
      optionsKey = key;
      box.textContent = "";
      (st.options || []).forEach(function (opt) {
        var b = el("button", "btn", opt);
        b.type = "button";
        b.dataset.option = opt;
        b.addEventListener("click", function () {
          socket.emit("vote", opt, function (res) {
            if (res && res.ok) {
              $("status").textContent = "Pilihan tim sudah terkirim.";
            } else {
              $("status").textContent = (res && res.error) || "Gagal mengirim pilihan.";
            }
          });
        });
        box.appendChild(b);
      });
    }
    var voted = st.votedTeams && st.votedTeams.indexOf(me.id) !== -1;
    var open = st.stage === "vote" && !voted;
    var buttons = box.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !open;
    }
  }

  var avatarCache = {};
  function avatarIcon(color, size) {
    var key = color + "|" + size;
    if (!avatarCache[key]) avatarCache[key] = PixelArt.avatarDataURL(color, size);
    return avatarCache[key];
  }

  function renderRanking(me) {
    var list = $("ranking");
    list.textContent = "";
    (state.scoreboard || []).forEach(function (t) {
      var li = el("li", t.id === me.id ? "me" : null);
      var img = el("img", "ranking-dot pixel-img");
      img.alt = "";
      img.src = avatarIcon(t.color, 24);
      li.appendChild(img);
      li.appendChild(document.createTextNode(t.name + " - " + t.score + " poin, potongan " + t.pieces + " dari 9"));
      list.appendChild(li);
    });
  }

  function render() {
    if (!state || !myTeamId) return;
    var me = findMe();
    if (!me) {
      $("prompt").textContent = "Menghubungkan ulang ke tim...";
      return;
    }
    $("team-name").textContent = me.name;
    $("team-dot").src = avatarIcon(me.color, 28);
    $("my-score").textContent = me.score;

    var st = state.stage;
    var roundText = "";
    var timerText = "";
    var prompt = "";

    if (state.phase === "lobby") {
      roundText = "Menunggu host";
      prompt = "Tim sudah masuk. Tunggu host memulai.";
    } else if (state.phase === "playing") {
      roundText = state.roundTitle;
      timerText = "Sisa " + fmt(state.roundLeft);
      prompt = st ? st.prompt : "";
    } else if (state.phase === "between") {
      roundText = "Jeda";
      timerText = "Mulai dalam " + state.betweenLeft + " detik";
    } else if (state.phase === "finished") {
      roundText = "Permainan selesai";
    }

    if (state.phase === "playing" && st) {
      if (st.kind === "pasal") prompt = st.prompt;
      if (st.kind === "pilah" && st.card) prompt = "Kartu: " + st.card;
      if (st.kind === "pasal" && st.timeLeft) timerText = "Soal " + st.questionNo + " dari " + st.total + " - " + st.timeLeft + " dtk";
      if (st.kind === "pilah" && st.card) timerText = st.timeLeft + " dtk";
      if (st.kind === "sidang") {
        prompt = st.prompt;
        timerText = st.stage === "vote" ? "Voting " + st.timeLeft + " dtk" : (st.stage === "reveal" ? "Hasil" : "");
      }
    }

    $("round-title").textContent = roundText;
    $("timer").textContent = timerText;
    $("prompt").textContent = prompt;
    $("status").textContent = statusFor(me, st);

    show("board-card", state.phase !== "lobby");
    if (state.phase !== "lobby") {
      renderBoard(me);
      var carryBox = $("carry");
      carryBox.textContent = "";
      if (me.carryType) {
        var cd = (state.pieceDefs.find(function (d) { return d.id === me.carryType; }) || { id: me.carryType, color: "#cccccc", label: me.carryType });
        var cimg = el("img", "pc-inline pixel-img");
        cimg.alt = "";
        cimg.src = pieceIcon(cd, 20);
        carryBox.appendChild(cimg);
        carryBox.appendChild(document.createTextNode(" Sedang dibawa: " + (cd.label || "")));
      }
    }

    var playingMove = state.phase === "playing" && state.roundKey !== "sidang";
    show("stick-area", playingMove);

    var showPickup = state.phase === "playing" && state.roundKey === "rakit";
    show("pickup-area", showPickup);
    if (showPickup) {
      var canPickup = !!me.canPickup && !me.carryType;
      var pbtn = $("pickup-btn");
      pbtn.disabled = !canPickup;
      pbtn.textContent = me.carryType ? "Sedang Membawa" : (canPickup ? "Ambil Barang" : "Dekati Potongan");
    }

    var showOptions = state.phase === "playing" && state.roundKey === "sidang" && !!st;
    show("options-card", showOptions);
    if (showOptions) renderOptions(me, st);

    renderRanking(me);
  }

  // ---------- D-pad ----------
  var activeDirs = { up: false, down: false, left: false, right: false };

  function dirFromBtn(btn) {
    if (btn.classList.contains("dpad-up")) return "up";
    if (btn.classList.contains("dpad-down")) return "down";
    if (btn.classList.contains("dpad-left")) return "left";
    if (btn.classList.contains("dpad-right")) return "right";
    return null;
  }
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
      var dir = dirFromBtn(btn);
      if (!dir) return;
      function press(e) {
        e.preventDefault();
        activeDirs[dir] = true;
        btn.classList.add("pressed");
        updateStick();
      }
      function release() {
        activeDirs[dir] = false;
        btn.classList.remove("pressed");
        updateStick();
      }
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    })(dpadBtns[di]);
  }

  setInterval(function () {
    if (myTeamId) socket.emit("move", stick);
  }, 50);

  // ---------- Tombol ambil barang ----------
  $("pickup-btn").addEventListener("click", function () {
    if (!myTeamId) return;
    socket.emit("pickup");
  });
})();
