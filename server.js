"use strict";

const os = require("os");
const http = require("http");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const DATA = require("./data");

// ---------- Pengaturan ----------
const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = String(process.env.HOST_PIN || "1234");
const MAX_TEAMS = 15;
const W = 1200;
const H = 800;
const CENTER = { x: 600, y: 400 };
const SPAWN_R = 290;
const SPEED = 170; // piksel per detik
const PICK_R = 36; // jarak ambil potongan
const BASE_R = 80; // jarak ke pangkalan untuk pasang potongan
const TICK_MS = 50;
const BETWEEN_SECONDS = 8;
const RAKIT_RESPAWN_MS = 4000;
const PASAL_Q_TIME = 15;
const PASAL_GAP = 3;
const PILAH_CARD_TIME = 10;
const PILAH_GAP = 2;
const PILAH_RESULT_TIME = 3;
const SIDANG_GAP = 2;
const SIDANG_VOTE_TIME = 25;
const SIDANG_REVEAL_TIME = 6;

const PALETTE = [
  "#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5",
  "#dd6b20", "#319795", "#d53f8c", "#2b6cb0", "#718096",
  "#c05621", "#2f855a", "#6b46c1", "#b83280", "#276749",
];

const ROUND_DEFS = [
  { key: "rakit", title: "Rakit Garuda", seconds: 240 },
  { key: "pasal", title: "Kejar Pasal", seconds: 180 },
  { key: "pilah", title: "Pilah Identitas", seconds: 180 },
  { key: "sidang", title: "Sidang Akhir", seconds: 120 },
];

// Titik pangkalan tiap tim, tersebar melingkar.
const SPAWN_POINTS = [];
for (let i = 0; i < MAX_TEAMS; i++) {
  const a = (i / MAX_TEAMS) * Math.PI * 2 - Math.PI / 2;
  SPAWN_POINTS.push({
    x: CENTER.x + SPAWN_R * Math.cos(a),
    y: CENTER.y + SPAWN_R * Math.sin(a),
  });
}

const TEAM_R = 14; // radius kasar karakter untuk pengecekan tabrakan
const WATER_SPEED_MULT = 0.45; // kecepatan di air (tanpa jembatan)

// Pilih satu variasi peta (sungai/jembatan/batu) secara acak. Dipanggil saat
// server mulai dan setiap kali game di-reset, supaya tiap game beda peta.
function pickMap() {
  const presets = DATA.MAP_PRESETS;
  return presets[Math.floor(Math.random() * presets.length)];
}

// ---------- Keadaan permainan ----------
const game = {
  phase: "lobby", // lobby | playing | between | finished
  roundIndex: -1,
  roundLeft: 0,
  betweenLeft: 0,
  teams: new Map(),
  pieces: [],
  round: null,
  map: pickMap(),
};

const lanUrls = [];
for (const list of Object.values(os.networkInterfaces())) {
  for (const n of list || []) {
    if ((n.family === "IPv4" || n.family === 4) && !n.internal) {
      lanUrls.push(`http://${n.address}:${PORT}`);
    }
  }
}

// ---------- Fungsi bantu ----------
function clean(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Ambil n item dari daftar. Kalau daftar lebih pendek, diulang dengan urutan acak.
function takeN(arr, n) {
  let out = [];
  while (out.length < n) out = out.concat(shuffle(arr));
  return out.slice(0, n);
}
function randomPieceType() {
  const d = DATA.PIECES;
  return d[Math.floor(Math.random() * d.length)].id;
}
function randomSpot() {
  for (let tries = 0; tries < 60; tries++) {
    const x = 80 + Math.random() * (W - 160);
    const y = 80 + Math.random() * (H - 160);
    const jauh = SPAWN_POINTS.every((sp) => Math.hypot(sp.x - x, sp.y - y) > 130);
    if (jauh) return { x, y };
  }
  return { x: CENTER.x, y: CENTER.y + 220 };
}
function boardCount(t) {
  return Object.keys(t.board).length;
}
function pieceType(id) {
  const p = game.pieces.find((q) => q.id === id);
  return p ? p.type : null;
}
function teamOf(socket) {
  return game.teams.get(socket.data.teamId) || null;
}
function reply(ack, obj) {
  if (typeof ack === "function") ack(obj);
}
function hitsObstacle(x, y) {
  for (const o of game.map.rocks) {
    if (Math.hypot(x - o.x, y - o.y) < o.r + TEAM_R) return true;
  }
  return false;
}
// Jarak titik (px,py) ke ruas garis (x1,y1)-(x2,y2); dipakai untuk sungai
// berbentuk kapsul (garis + lebar) dan untuk cek jembatan ada di sungai mana.
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function isOnBridge(x, y) {
  for (const b of game.map.bridges) {
    if (Math.hypot(x - b.x, y - b.y) <= b.r) return true;
  }
  return false;
}
function isInWater(x, y) {
  for (const r of game.map.rivers) {
    if (distToSeg(x, y, r.x1, r.y1, r.x2, r.y2) <= r.w / 2) return true;
  }
  return false;
}
// Air memperlambat (bukan menghalangi), kecuali kalau sedang di atas jembatan.
function speedMultAt(x, y) {
  if (isInWater(x, y) && !isOnBridge(x, y)) return WATER_SPEED_MULT;
  return 1;
}
function moveTeam(t, dt) {
  const { x, y } = t.input;
  if (!x && !y) return;
  const mult = speedMultAt(t.x, t.y);
  const nx = clamp(t.x + x * SPEED * mult * dt, 30, W - 30);
  const ny = clamp(t.y + y * SPEED * mult * dt, 30, H - 30);
  if (!hitsObstacle(nx, ny)) {
    t.x = nx;
    t.y = ny;
    return;
  }
  // Tabrakan: coba geser di satu sumbu saja supaya bisa menyusuri tepi obstacle,
  // kalau keduanya tetap kena, tim mentok (diam).
  if (!hitsObstacle(nx, t.y)) {
    t.x = nx;
  } else if (!hitsObstacle(t.x, ny)) {
    t.y = ny;
  }
}

function findOrCreateTeam(name) {
  const key = name.toLowerCase();
  for (const t of game.teams.values()) {
    if (t.key === key) return { team: t };
  }
  if (game.teams.size >= MAX_TEAMS) {
    return { error: "Jumlah tim sudah penuh (maksimal 15 tim)." };
  }
  const used = new Set([...game.teams.values()].map((t) => t.spawn));
  let spawn = 0;
  while (used.has(spawn)) spawn++;
  const sp = SPAWN_POINTS[spawn];
  const team = {
    id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    key,
    name,
    color: PALETTE[spawn],
    spawn,
    x: sp.x,
    y: sp.y,
    input: { x: 0, y: 0 },
    score: 0,
    board: {},
    carry: null,
    nearPieceId: null,
    members: new Set(),
  };
  game.teams.set(team.id, team);
  return { team };
}

// ---------- Ronde 1: Rakit Garuda ----------
function makeRakit() {
  return {
    key: "rakit",
    zones: [],
    init() {
      game.pieces = [];
      for (let i = 0; i < DATA.POOL_SIZE; i++) {
        const s = randomSpot();
        game.pieces.push({ id: "p" + i, type: randomPieceType(), x: s.x, y: s.y, holder: null, respawnAt: 0 });
      }
    },
    tick(now) {
      for (const p of game.pieces) {
        if (p.respawnAt && now >= p.respawnAt) {
          const s = randomSpot();
          p.type = randomPieceType();
          p.x = s.x;
          p.y = s.y;
          p.respawnAt = 0;
        }
        if (p.holder) {
          const t = game.teams.get(p.holder);
          if (t) {
            p.x = t.x;
            p.y = t.y - 26;
          } else {
            p.holder = null;
          }
        }
      }
      for (const t of game.teams.values()) {
        const base = SPAWN_POINTS[t.spawn];
        if (!t.carry) {
          if (boardCount(t) >= DATA.PIECES.length) {
            t.nearPieceId = null;
            continue;
          }
          // Tidak lagi ambil otomatis: cukup tandai potongan terdekat yang
          // sudah dalam jangkauan, lalu tim harus menekan tombol Ambil Barang.
          const p = game.pieces.find((q) => !q.holder && !q.respawnAt && dist(q, t) <= PICK_R);
          t.nearPieceId = p ? p.id : null;
        } else {
          t.nearPieceId = null;
          if (dist(t, base) <= BASE_R) {
            const p = game.pieces.find((q) => q.id === t.carry);
            t.carry = null;
            if (!p) continue;
            p.holder = null;
            if (!t.board[p.type]) {
              t.board[p.type] = true;
              t.score += 10;
              p.respawnAt = now + RAKIT_RESPAWN_MS; // potongan yang terpasang muncul lagi nanti
            } else {
              // Slot sudah terisi: potongan kembali ke peta, tanpa poin.
              const s = randomSpot();
              p.x = s.x;
              p.y = s.y;
            }
          }
        }
      }
    },
    pickup(t) {
      if (t.carry) return false;
      if (!t.nearPieceId) return false;
      const p = game.pieces.find((q) => q.id === t.nearPieceId && !q.holder && !q.respawnAt && dist(q, t) <= PICK_R);
      if (!p) return false;
      p.holder = t.id;
      t.carry = p.id;
      t.nearPieceId = null;
      return true;
    },
    isDone() {
      return game.teams.size > 0 && [...game.teams.values()].every((t) => boardCount(t) >= DATA.PIECES.length);
    },
    end() {
      for (const t of game.teams.values()) {
        t.carry = null;
        t.nearPieceId = null;
      }
      game.pieces = [];
    },
    snapshot() {
      return {
        kind: "rakit",
        prompt: "Ambil potongan lambang di peta, lalu bawa ke pangkalan tim untuk dipasang di papan rakit.",
      };
    },
  };
}

// ---------- Ronde 2: Kejar Pasal ----------
function makePasal() {
  const bank = shuffle(DATA.PASAL_QUESTIONS).slice(0, DATA.PASAL_COUNT);
  let idx = -1;
  let cur = null;
  let gapLeft = 2;
  let finished = false;

  return {
    key: "pasal",
    zones: DATA.PASAL_ZONES,
    init() {},
    tick(now, dt) {
      if (finished) return;
      if (cur) {
        cur.timeLeft -= dt;
        if (cur.timeLeft <= 0) {
          cur = null;
          if (idx >= bank.length - 1) finished = true;
          else gapLeft = PASAL_GAP;
        }
        return;
      }
      gapLeft -= dt;
      if (gapLeft <= 0) {
        idx += 1;
        cur = { q: bank[idx], timeLeft: PASAL_Q_TIME, results: {} };
      }
    },
    onEnter(t, z) {
      if (!cur || cur.results[t.id]) return;
      const ok = z.code === cur.q.answer;
      // Benar pertama +20, benar berikutnya +10, salah -5.
      const firstOk = Object.values(cur.results).some((r) => r.ok);
      const pts = ok ? (firstOk ? 10 : 20) : -5;
      t.score += pts;
      cur.results[t.id] = { ok, pts, name: t.name };
    },
    isDone() {
      return finished;
    },
    end() {},
    snapshot() {
      const results = cur
        ? Object.entries(cur.results).map(([teamId, r]) => ({ teamId, ...r }))
        : [];
      return {
        kind: "pasal",
        prompt: cur ? cur.q.text : finished ? "Semua pertanyaan sudah selesai." : "Pertanyaan berikutnya segera muncul.",
        timeLeft: cur ? Math.ceil(cur.timeLeft) : 0,
        results,
        questionNo: idx + 1,
        total: bank.length,
      };
    },
  };
}

// ---------- Ronde 3: Pilah Identitas ----------
function makePilah() {
  const deck = takeN(DATA.PILAH_CARDS, DATA.PILAH_COUNT);
  let idx = -1;
  let cur = null;
  let gapLeft = 2;
  let finished = false;
  let last = null;
  let lastLeft = 0;

  function finishCard(result) {
    last = result;
    lastLeft = PILAH_RESULT_TIME;
    cur = null;
    if (idx >= deck.length - 1) finished = true;
    else gapLeft = PILAH_GAP;
  }

  return {
    key: "pilah",
    zones: DATA.PILAH_ZONES,
    init() {},
    tick(now, dt) {
      if (lastLeft > 0) lastLeft -= dt;
      if (finished) return;
      if (cur) {
        cur.timeLeft -= dt;
        if (cur.timeLeft <= 0) {
          finishCard({ label: cur.card.label, team: null, ok: null, pts: 0 });
        }
        return;
      }
      gapLeft -= dt;
      if (gapLeft <= 0) {
        idx += 1;
        cur = { card: deck[idx], timeLeft: PILAH_CARD_TIME };
      }
    },
    onEnter(t, z) {
      if (!cur) return;
      // Tim pertama yang masuk zone menentukan hasil kartu ini.
      const ok = z.code === cur.card.type;
      const pts = ok ? 10 : -5;
      t.score += pts;
      finishCard({ label: cur.card.label, team: t.name, ok, pts });
    },
    isDone() {
      return finished;
    },
    end() {},
    snapshot() {
      return {
        kind: "pilah",
        prompt: cur
          ? "Bawa kartu ini ke zona yang sesuai. Tim pertama yang masuk zona menentukan hasilnya."
          : finished
            ? "Semua kartu sudah selesai."
            : "Kartu berikutnya segera muncul.",
        card: cur ? cur.card.label : null,
        timeLeft: cur ? Math.ceil(cur.timeLeft) : 0,
        last: lastLeft > 0 && last ? last : null,
        cardNo: idx + 1,
        total: deck.length,
      };
    },
  };
}

// ---------- Ronde 4: Sidang Akhir ----------
function makeSidang() {
  const bank = shuffle(DATA.SIDANG_QUESTIONS).slice(0, DATA.SIDANG_COUNT);
  let idx = -1;
  let stage = "gap";
  let timeLeft = SIDANG_GAP;
  let votes = {};
  let reveal = null;
  let finished = false;

  function openNext() {
    idx += 1;
    votes = {};
    reveal = null;
    stage = "vote";
    timeLeft = SIDANG_VOTE_TIME;
  }

  // Jawaban dengan suara terbanyak menang. Tim pertama yang memilih jawaban itu +30,
  // tim lain yang memilih jawaban yang sama +10.
  function doReveal() {
    const entries = Object.entries(votes);
    if (entries.length === 0) return { winner: null, voters: [] };
    const groups = {};
    for (const [teamId, v] of entries) {
      if (!groups[v.option]) groups[v.option] = [];
      groups[v.option].push({ teamId, at: v.at });
    }
    let winner = null;
    let best = -1;
    let bestFirst = Infinity;
    for (const [opt, list] of Object.entries(groups)) {
      const first = Math.min(...list.map((x) => x.at));
      if (list.length > best || (list.length === best && first < bestFirst)) {
        winner = opt;
        best = list.length;
        bestFirst = first;
      }
    }
    const sorted = groups[winner].slice().sort((a, b) => a.at - b.at);
    const voters = sorted.map((x, i) => {
      const t = game.teams.get(x.teamId);
      const pts = i === 0 ? 30 : 10;
      if (t) t.score += pts;
      return { teamId: x.teamId, name: t ? t.name : "-", pts };
    });
    return { winner, voters };
  }

  return {
    key: "sidang",
    zones: [],
    init() {},
    tick(now, dt) {
      if (finished) return;
      timeLeft -= dt;
      if (timeLeft > 0) return;
      if (stage === "gap") {
        openNext();
      } else if (stage === "vote") {
        reveal = doReveal();
        stage = "reveal";
        timeLeft = SIDANG_REVEAL_TIME;
      } else if (stage === "reveal") {
        if (idx >= bank.length - 1) {
          finished = true;
        } else {
          stage = "gap";
          timeLeft = SIDANG_GAP;
        }
      }
    },
    vote(t, option, now) {
      if (stage !== "vote" || votes[t.id]) return false;
      const q = bank[idx];
      if (!q || !q.options.includes(option)) return false;
      votes[t.id] = { option, at: now };
      return true;
    },
    isDone() {
      return finished;
    },
    end() {},
    snapshot() {
      const q = idx >= 0 && idx < bank.length ? bank[idx] : null;
      const counts = {};
      if (q) for (const o of q.options) counts[o] = 0;
      for (const v of Object.values(votes)) counts[v.option] = (counts[v.option] || 0) + 1;
      return {
        kind: "sidang",
        prompt: q ? q.text : "",
        options: q ? q.options : [],
        stage,
        timeLeft: Math.ceil(timeLeft),
        counts,
        votedTeams: Object.keys(votes),
        reveal,
        questionNo: idx + 1,
        total: bank.length,
      };
    },
  };
}

const ROUND_MAKERS = {
  rakit: makeRakit,
  pasal: makePasal,
  pilah: makePilah,
  sidang: makeSidang,
};

// ---------- Alur permainan ----------
function startRound(i) {
  const def = ROUND_DEFS[i];
  game.roundIndex = i;
  game.roundLeft = def.seconds;
  game.phase = "playing";
  game.round = ROUND_MAKERS[def.key]();
  game.round.init();
}

function endRound() {
  if (game.round) game.round.end();
  game.round = null;
  game.roundLeft = 0;
  if (game.roundIndex >= ROUND_DEFS.length - 1) {
    game.phase = "finished";
    game.betweenLeft = 0;
  } else {
    game.phase = "between";
    game.betweenLeft = BETWEEN_SECONDS;
  }
}

function resetGame() {
  game.phase = "lobby";
  game.roundIndex = -1;
  game.roundLeft = 0;
  game.betweenLeft = 0;
  game.round = null;
  game.pieces = [];
  game.teams.clear();
  game.map = pickMap(); // peta beda tiap game baru
  for (const s of io.sockets.sockets.values()) s.data.teamId = null;
  io.emit("reset");
}

function snapshot() {
  const teams = [...game.teams.values()];
  const round = game.round;
  const def = game.roundIndex >= 0 ? ROUND_DEFS[game.roundIndex] : null;
  const nextDef = game.phase === "between" ? ROUND_DEFS[game.roundIndex + 1] : null;
  return {
    phase: game.phase,
    roundIndex: game.roundIndex,
    roundCount: ROUND_DEFS.length,
    roundKey: def ? def.key : null,
    roundTitle: def ? def.title : "",
    roundLeft: Math.max(0, Math.ceil(game.roundLeft)),
    betweenLeft: Math.max(0, Math.ceil(game.betweenLeft)),
    nextRoundTitle: nextDef ? nextDef.title : null,
    stage: round ? round.snapshot() : null,
    zones: round ? round.zones : [],
    pieces: game.pieces
      .filter((p) => !p.respawnAt)
      .map((p) => ({ id: p.id, type: p.type, x: Math.round(p.x), y: Math.round(p.y) })),
    pieceDefs: DATA.PIECES,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      x: Math.round(t.x),
      y: Math.round(t.y),
      spawnX: SPAWN_POINTS[t.spawn].x,
      spawnY: SPAWN_POINTS[t.spawn].y,
      score: t.score,
      board: t.board,
      pieces: boardCount(t),
      carryType: t.carry ? pieceType(t.carry) : null,
      canPickup: !!t.nearPieceId,
      members: t.members.size,
    })),
    scoreboard: teams
      .slice()
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, pieces: boardCount(t) })),
    map: { name: game.map.name, rivers: game.map.rivers, bridges: game.map.bridges, rocks: game.map.rocks },
    lanUrls,
    width: W,
    height: H,
  };
}

// ---------- Server ----------
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "player.html")));
app.get("/display", (req, res) => res.sendFile(path.join(__dirname, "public", "display.html")));

const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
  socket.data.teamId = null;
  socket.data.isHost = false;
  socket.emit("state", snapshot());

  socket.on("join", (payload, ack) => {
    const playerName = clean(payload && payload.name, 20);
    const teamName = clean(payload && payload.team, 20);
    if (!playerName || !teamName) {
      return reply(ack, { ok: false, error: "Isi nama dan nama tim dulu." });
    }
    const r = findOrCreateTeam(teamName);
    if (r.error) return reply(ack, { ok: false, error: r.error });

    const prev = game.teams.get(socket.data.teamId);
    if (prev) prev.members.delete(socket.id);
    socket.data.teamId = r.team.id;
    socket.data.name = playerName;
    r.team.members.add(socket.id);
    reply(ack, { ok: true, teamId: r.team.id, teamName: r.team.name });
  });

  socket.on("move", (v) => {
    const t = teamOf(socket);
    if (!t) return;
    let x = Number(v && v.x) || 0;
    let y = Number(v && v.y) || 0;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    t.input = { x, y };
  });

  socket.on("pickup", (ack) => {
    const t = teamOf(socket);
    if (!t) return reply(ack, { ok: false, error: "Masuk ke tim dulu." });
    if (!game.round || game.round.key !== "rakit" || !game.round.pickup) {
      return reply(ack, { ok: false, error: "Tidak ada yang bisa diambil sekarang." });
    }
    const ok = game.round.pickup(t);
    reply(ack, ok ? { ok: true } : { ok: false, error: "Potongan tidak cukup dekat." });
  });

  socket.on("vote", (option, ack) => {
    if (typeof option === "function") {
      ack = option;
      option = "";
    }
    const t = teamOf(socket);
    if (!t) return reply(ack, { ok: false, error: "Masuk ke tim dulu." });
    if (!game.round || game.round.key !== "sidang") {
      return reply(ack, { ok: false, error: "Belum ada voting." });
    }
    const ok = game.round.vote(t, String(option), Date.now());
    reply(ack, ok ? { ok: true } : { ok: false, error: "Voting belum dibuka atau tim sudah memilih." });
  });

  function needHost(ack) {
    if (socket.data.isHost) return true;
    reply(ack, { ok: false, error: "Masukkan PIN host dulu." });
    return false;
  }

  socket.on("host:auth", (pin, ack) => {
    if (String(pin) === HOST_PIN) {
      socket.data.isHost = true;
      reply(ack, { ok: true });
    } else {
      reply(ack, { ok: false, error: "PIN salah." });
    }
  });

  socket.on("host:start", (ack) => {
    if (!needHost(ack)) return;
    if (game.phase !== "lobby") return reply(ack, { ok: false, error: "Permainan sudah berjalan." });
    if (game.teams.size === 0) return reply(ack, { ok: false, error: "Belum ada tim yang masuk." });
    startRound(0);
    reply(ack, { ok: true });
  });

  socket.on("host:skip", (ack) => {
    if (!needHost(ack)) return;
    if (game.phase === "playing") endRound();
    else if (game.phase === "between") game.betweenLeft = 0;
    reply(ack, { ok: true });
  });

  socket.on("host:reset", (ack) => {
    if (!needHost(ack)) return;
    resetGame();
    reply(ack, { ok: true });
  });

  socket.on("disconnect", () => {
    const t = game.teams.get(socket.data.teamId);
    if (t) t.members.delete(socket.id);
  });
});

// Loop utama: gerakan, ronde, dan pengecekan zona.
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - lastTick) / 1000);
  lastTick = now;

  if (game.phase === "playing" && game.round) {
    for (const t of game.teams.values()) moveTeam(t, dt);
    game.roundLeft -= dt;
    const r = game.round;
    r.tick(now, dt);
    if (r.onEnter && r.zones && r.zones.length) {
      for (const t of game.teams.values()) {
        for (const z of r.zones) {
          if (dist(t, z) <= z.r) r.onEnter(t, z, now);
        }
      }
    }
    if (game.roundLeft <= 0 || r.isDone()) endRound();
  } else if (game.phase === "between") {
    game.betweenLeft -= dt;
    if (game.betweenLeft <= 0) startRound(game.roundIndex + 1);
  }
}, TICK_MS);

setInterval(() => {
  io.emit("state", snapshot());
}, TICK_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("Jejak Identitas Nusantara sudah berjalan.");
  console.log("Layar proyektor (buka di laptop ini): http://localhost:" + PORT + "/display");
  if (lanUrls.length) {
    console.log("Alamat untuk HP (satu WiFi dengan laptop):");
    for (const u of lanUrls) console.log("  " + u);
  } else {
    console.log("Tidak ditemukan alamat jaringan. Pastikan laptop tersambung ke WiFi.");
  }
  console.log("PIN host: " + HOST_PIN);
  console.log("");
});
