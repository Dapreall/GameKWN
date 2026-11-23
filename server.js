"use strict";

const os = require("os");
const http = require("http");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const DATA = require("./data");

const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = String(process.env.HOST_PIN || "1234");
const MAX_TEAMS = 15;
const W = 1200, H = 800;
const CENTER = { x: 600, y: 400 };
const SPAWN_R = 290, SPEED = 170, PICK_R = 36, BASE_R = 80, TICK_MS = 50;
const BETWEEN_SECONDS = 8, RAKIT_RESPAWN_MS = 4000;
const PASAL_Q_TIME = 20, PASAL_HOLD = 3, PASAL_REVEAL = 5, PASAL_GAP = 2;
const PILAH_CARD_TIME = 12, PILAH_GAP = 2, PILAH_RESULT_TIME = 3;
const PILAH_ZONE_R = 85;
const TEAM_R = 14, WATER_SPEED_MULT = 0.45, PIECE_CLEAR_R = 36, OBSTACLE_PAD = 8;

const PALETTE = [
  "#e53e3e", "#3182ce", "#38a169", "#d69e2e", "#805ad5",
  "#dd6b20", "#319795", "#d53f8c", "#2b6cb0", "#718096",
  "#c05621", "#2f855a", "#6b46c1", "#b83280", "#276749",
];
const ROUND_DEFS = [
  { key: "rakit", title: "Rakit Nusantara", seconds: 240,
    desc: "Kumpulkan 9 potongan Peta Nusantara: 5 pulau besar + Bendera, Pancasila, UUD 1945, Garuda. Dekati potongan lalu tekan Ambil. Bawa ke pangkalan tim (lingkaran titik). Salah ambil? Tekan Buang. Tiap jenis potongan yang terpasang: +10 poin." },
  { key: "pasal", title: "Jelajah Wawasan", seconds: 260,
    desc: "10 soal tentang 5 aspek kesatuan Wawasan Nusantara (IPOLEKSOSBUD-HANKAM): Ideologi, Politik, Ekonomi, Sosial Budaya, Hankam. Lari ke zona yang kamu rasa benar, tekan Kunci. Setelah lock, karakter tidak bisa gerak. Semua tim lock atau waktu habis -> jawaban benar muncul. Benar pertama +20, berikutnya +10, salah -5." },
  { key: "pilah", title: "Pilah Astagatra", seconds: 180,
    desc: "12 kartu pernyataan dari konsep Ketahanan Nasional. Pilah ke zona TRIGATRA (aspek alamiah: geografi, demografi, SKA) atau PANCAGATRA (aspek sosial: ideologi, politik, ekonomi, sosbud, hankam). Posisi zona BERGERAK tiap kartu! Lock cepat, poin lebih tinggi. Benar: +20, +15, +10, +8, +5 (menurun). Salah: -5 tetap." },
];
function pickMap() { return DATA.MAP_PRESETS[Math.floor(Math.random() * DATA.MAP_PRESETS.length)]; }

// Spawn slots untuk tim: 15 booth tersebar di pinggir atas & bawah map.
// Divalidasi terhadap peta aktif (hindari sungai/jembatan/batu). Hasilnya
// cache ke game.spawnPoints, jadi perlu di-regenerate tiap kali map berubah.
function _distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function generateSpawnPoints(map) {
  // 8 slot di baris atas, 7 slot di baris bawah. Total 15.
  const desired = [];
  const topY = 92, botY = 708;
  for (let i = 0; i < 8; i++) desired.push({ x: 120 + i * 137, y: topY });
  for (let i = 0; i < 7; i++) desired.push({ x: 188 + i * 137, y: botY });

  function isGoodSpawn(x, y, taken) {
    if (x < 90 || x > W - 90 || y < 60 || y > H - 60) return false;
    // Jauh dari sungai (booth tim harus benar2 di darat kering)
    for (const r of (map.rivers || [])) {
      if (_distToSeg(x, y, r.x1, r.y1, r.x2, r.y2) <= r.w / 2 + 40) return false;
    }
    // Jauh dari batu (booth harus bisa dilewati tim)
    for (const o of (map.rocks || [])) {
      if (Math.hypot(x - o.x, y - o.y) < o.r + BASE_R - 10) return false;
    }
    // Jaga jarak antar booth supaya zona drop gak tumpang tindih
    for (const other of taken) {
      if (Math.hypot(other.x - x, other.y - y) < 120) return false;
    }
    return true;
  }
  // Untuk tiap desired, cari posisi valid terdekat (nudge kanan/kiri/atas/bawah).
  // Nudges di-generate otomatis supaya booth bisa lompatin sungai lebar sekalipun.
  const result = [];
  const nudgesX = [];
  for (let d = 0; d <= 400; d += 20) { nudgesX.push(d); if (d !== 0) nudgesX.push(-d); }
  const nudgesY = [0, -30, 30, -60, 60, -100, 100, -140, 140, -180, 180, -220, 220];
  for (const d of desired) {
    let found = null;
    outer: for (const dy of nudgesY) {
      for (const dx of nudgesX) {
        const x = d.x + dx, y = d.y + dy;
        if (isGoodSpawn(x, y, result)) { found = { x, y }; break outer; }
      }
    }
    // Fallback akhir: scan acak di manapun selama ada ruang
    if (!found) {
      for (let tries = 0; tries < 400 && !found; tries++) {
        const x = 90 + Math.random() * (W - 180);
        const y = 80 + Math.random() * (H - 160);
        if (isGoodSpawn(x, y, result)) found = { x, y };
      }
    }
    result.push(found || d);
  }
  return result;
}
const game = {
  phase: "lobby",
  roundIndex: -1,
  roundLeft: 0,
  betweenLeft: 0,
  teams: new Map(),
  pieces: [],
  round: null,
  map: pickMap(),
  spawnPoints: [],
};
game.spawnPoints = generateSpawnPoints(game.map);
const lanUrls = [];
for (const list of Object.values(os.networkInterfaces())) {
  for (const n of list || []) {
    if ((n.family === "IPv4" || n.family === 4) && !n.internal) lanUrls.push(`http://${n.address}:${PORT}`);
  }
}
function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function takeN(arr, n) {
  let out = [];
  while (out.length < n) out = out.concat(shuffle(arr));
  return out.slice(0, n);
}
function boardCount(t) { return Object.keys(t.board).length; }
function pieceType(id) { const p = game.pieces.find((q) => q.id === id); return p ? p.type : null; }
function teamOf(socket) { return game.teams.get(socket.data.teamId) || null; }
function reply(ack, obj) { if (typeof ack === "function") ack(obj); }
function hitsObstacle(x, y) {
  for (const o of game.map.rocks) { if (Math.hypot(x - o.x, y - o.y) < o.r + TEAM_R) return true; }
  return false;
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function isOnBridge(x, y) {
  for (const b of game.map.bridges) { if (Math.hypot(x - b.x, y - b.y) <= b.r) return true; }
  return false;
}
function isInWater(x, y) {
  for (const r of game.map.rivers) { if (distToSeg(x, y, r.x1, r.y1, r.x2, r.y2) <= r.w / 2) return true; }
  return false;
}
function speedMultAt(x, y) { return (isInWater(x, y) && !isOnBridge(x, y)) ? WATER_SPEED_MULT : 1; }
function moveTeam(t, dt) {
  if (t.locked) return;
  const { x, y } = t.input;
  if (!x && !y) return;
  const mult = speedMultAt(t.x, t.y);
  const nx = clamp(t.x + x * SPEED * mult * dt, 30, W - 30);
  const ny = clamp(t.y + y * SPEED * mult * dt, 30, H - 30);
  if (!hitsObstacle(nx, ny)) { t.x = nx; t.y = ny; return; }
  if (!hitsObstacle(nx, t.y)) t.x = nx;
  else if (!hitsObstacle(t.x, ny)) t.y = ny;
}
function randomSpot(existingPieces) {
  const existing = existingPieces || [];
  for (let tries = 0; tries < 200; tries++) {
    const x = 80 + Math.random() * (W - 160);
    const y = 80 + Math.random() * (H - 160);
    let bad = false;
    for (const o of game.map.rocks) { if (Math.hypot(x - o.x, y - o.y) < o.r + TEAM_R + OBSTACLE_PAD) { bad = true; break; } }
    if (bad) continue;
    if (isInWater(x, y) && !isOnBridge(x, y)) continue;
    const jauh = game.spawnPoints.every((sp) => Math.hypot(sp.x - x, sp.y - y) > 140);
    if (!jauh) continue;
    let tooClose = false;
    for (const p of existing) {
      if (p.holder || p.respawnAt) continue;
      if (Math.hypot(p.x - x, p.y - y) < PIECE_CLEAR_R) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return { x, y };
  }
  return { x: CENTER.x, y: CENTER.y + 220 };
}

// Spot acak untuk zona Pilah. Punya 2 lapisan: strict (jarak optimal) -> relaxed
// (jarak minimum) -> fallback pool random. Tujuannya biar zona benar-benar pindah
// tiap kartu dan gak overlap antar zona atau nabrak pangkalan.
function randomZoneSpot(avoid) {
  avoid = avoid || [];
  const margin = PILAH_ZONE_R + 15;

  function okAt(x, y, minSpawnDist, minZoneDist) {
    if (x < margin || x > W - margin || y < margin || y > H - margin) return false;
    for (const o of game.map.rocks) {
      if (Math.hypot(x - o.x, y - o.y) < o.r + PILAH_ZONE_R + 10) return false;
    }
    let minSp = Infinity;
    for (const sp of game.spawnPoints) {
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d < minSp) minSp = d;
    }
    if (minSp < minSpawnDist) return false;
    for (const other of avoid) {
      if (Math.hypot(other.x - x, other.y - y) < minZoneDist) return false;
    }
    return true;
  }

  // Lapisan 1: strict (jauh dari spawn & jauh antar zona)
  for (let tries = 0; tries < 400; tries++) {
    const x = margin + Math.random() * (W - 2 * margin);
    const y = margin + Math.random() * (H - 2 * margin);
    if (okAt(x, y, PILAH_ZONE_R + 95, PILAH_ZONE_R * 2 + 40)) return { x, y };
  }
  // Lapisan 2: relaxed
  for (let tries = 0; tries < 400; tries++) {
    const x = margin + Math.random() * (W - 2 * margin);
    const y = margin + Math.random() * (H - 2 * margin);
    if (okAt(x, y, PILAH_ZONE_R + 50, PILAH_ZONE_R * 2 + 20)) return { x, y };
  }
  // Fallback pool - 12 titik tersebar, dipilih random urutannya
  const pool = [
    { x: 220, y: 200 }, { x: 980, y: 200 },
    { x: 220, y: 600 }, { x: 980, y: 600 },
    { x: 170, y: 400 }, { x: 1030, y: 400 },
    { x: 600, y: 170 }, { x: 600, y: 630 },
    { x: 400, y: 220 }, { x: 800, y: 220 },
    { x: 400, y: 580 }, { x: 800, y: 580 },
  ];
  const shuffled = pool.slice().sort(function () { return Math.random() - 0.5; });
  for (const p of shuffled) {
    let ok = true;
    for (const other of avoid) {
      if (Math.hypot(other.x - p.x, other.y - p.y) < PILAH_ZONE_R * 2 + 10) { ok = false; break; }
    }
    if (ok) return p;
  }
  return avoid.length === 0 ? { x: 220, y: 400 } : { x: 980, y: 400 };
}

function findOrCreateTeam(name) {
  const key = name.toLowerCase();
  for (const t of game.teams.values()) { if (t.key === key) return { team: t }; }
  if (game.teams.size >= MAX_TEAMS) return { error: "Jumlah tim sudah penuh (maksimal 15 tim)." };
  const used = new Set([...game.teams.values()].map((t) => t.spawn));
  let spawn = 0;
  while (used.has(spawn)) spawn++;
  const sp = game.spawnPoints[spawn];
  const team = {
    id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    key, name, color: PALETTE[spawn], spawn,
    x: sp.x, y: sp.y, input: { x: 0, y: 0 },
    score: 0, board: {}, carry: null, nearPieceId: null,
    members: new Set(), locked: false, lockedZone: null,
  };
  game.teams.set(team.id, team);
  return { team };
}

function makeRakit() {
  return {
    key: "rakit", zones: [],
    init() {
      game.pieces = [];
      const types = DATA.PIECES.map((p) => p.id);
      const pool = [];
      for (const id of types) pool.push(id);
      while (pool.length < DATA.POOL_SIZE) pool.push(types[Math.floor(Math.random() * types.length)]);
      const shuffled = shuffle(pool);
      for (let i = 0; i < DATA.POOL_SIZE; i++) {
        const s = randomSpot(game.pieces);
        game.pieces.push({ id: "p" + i, type: shuffled[i], x: s.x, y: s.y, holder: null, respawnAt: 0 });
      }
    },
    tick(now) {
      for (const p of game.pieces) {
        if (p.respawnAt && now >= p.respawnAt) {
          const s = randomSpot(game.pieces);
          p.type = DATA.PIECES[Math.floor(Math.random() * DATA.PIECES.length)].id;
          p.x = s.x; p.y = s.y; p.respawnAt = 0;
        }
        if (p.holder) {
          const t = game.teams.get(p.holder);
          if (t) { p.x = t.x; p.y = t.y - 26; } else { p.holder = null; }
        }
      }
      for (const t of game.teams.values()) {
        const base = game.spawnPoints[t.spawn];
        if (!t.carry) {
          if (boardCount(t) >= DATA.PIECES.length) { t.nearPieceId = null; continue; }
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
              p.respawnAt = now + RAKIT_RESPAWN_MS;
            } else {
              const s = randomSpot(game.pieces);
              p.x = s.x; p.y = s.y;
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
      p.holder = t.id; t.carry = p.id; t.nearPieceId = null; return true;
    },
    drop(t) {
      if (!t.carry) return false;
      const p = game.pieces.find((q) => q.id === t.carry);
      if (!p) { t.carry = null; return false; }
      p.holder = null;
      let dx = t.x, dy = t.y + 20;
      let bad = false;
      for (const o of game.map.rocks) { if (Math.hypot(dx - o.x, dy - o.y) < o.r + TEAM_R) { bad = true; break; } }
      if (bad) { const s = randomSpot(game.pieces); dx = s.x; dy = s.y; }
      p.x = dx; p.y = dy; t.carry = null;
      return true;
    },
    isDone() {
      return game.teams.size > 0 && [...game.teams.values()].every((t) => boardCount(t) >= DATA.PIECES.length);
    },
    end() {
      for (const t of game.teams.values()) { t.carry = null; t.nearPieceId = null; }
      game.pieces = [];
    },
    snapshot() {
      return { kind: "rakit", prompt: "Ambil potongan Peta Nusantara, lalu bawa ke pangkalan tim. Pakai tombol Buang kalau salah ambil." };
    },
  };
}

function makePasal() {
  const bank = shuffle(DATA.PASAL_QUESTIONS).slice(0, DATA.PASAL_COUNT);
  let idx = -1;
  let stage = "gap";
  let timeLeft = PASAL_GAP;
  let cur = null;
  let holdLeft = 0;
  let finished = false;

  function zoneOfTeam(t) {
    for (const z of DATA.PASAL_ZONES) { if (Math.hypot(t.x - z.x, t.y - z.y) <= z.r) return z; }
    return null;
  }
  function lockAnswer(t, zoneCode, now) {
    if (!cur || t.locked) return;
    const ok = zoneCode === cur.q.answer;
    const firstOk = Object.values(cur.results).some((r) => r.ok);
    const pts = zoneCode == null ? 0 : (ok ? (firstOk ? 10 : 20) : -5);
    if (zoneCode != null) t.score += pts;
    cur.results[t.id] = { ok, pts, zoneCode, name: t.name, locked: true, autoLocked: false, at: now };
    t.locked = true; t.lockedZone = zoneCode;
  }
  function autoLockRemaining(now) {
    if (!cur) return;
    for (const t of game.teams.values()) {
      if (t.locked) continue;
      const z = zoneOfTeam(t);
      const code = z ? z.code : null;
      const ok = code && code === cur.q.answer;
      const firstOk = Object.values(cur.results).some((r) => r.ok);
      const pts = code == null ? 0 : (ok ? (firstOk ? 10 : 20) : -5);
      if (code != null) t.score += pts;
      cur.results[t.id] = { ok: !!ok, pts, zoneCode: code, name: t.name, locked: true, autoLocked: true, at: now };
      t.locked = true; t.lockedZone = code;
    }
  }
  function allLocked() {
    if (game.teams.size === 0) return false;
    for (const t of game.teams.values()) if (!t.locked) return false;
    return true;
  }
  function startAnswer() {
    idx += 1;
    cur = { q: bank[idx], results: {} };
    stage = "answer"; timeLeft = PASAL_Q_TIME; holdLeft = 0;
    for (const t of game.teams.values()) { t.locked = false; t.lockedZone = null; }
  }
  function startReveal(now) { autoLockRemaining(now); stage = "reveal"; timeLeft = PASAL_REVEAL; }

  return {
    key: "pasal", zones: DATA.PASAL_ZONES,
    init() {
      for (const t of game.teams.values()) {
        t.locked = false; t.lockedZone = null;
        const sp = game.spawnPoints[t.spawn]; t.x = sp.x; t.y = sp.y;
      }
    },
    tick(now, dt) {
      if (finished) return;
      timeLeft -= dt;
      if (stage === "gap") { if (timeLeft <= 0) startAnswer(); return; }
      if (stage === "answer") {
        if (allLocked()) { stage = "hold"; holdLeft = PASAL_HOLD; return; }
        if (timeLeft <= 0) startReveal(now);
        return;
      }
      if (stage === "hold") {
        holdLeft -= dt;
        if (holdLeft <= 0) startReveal(now);
        return;
      }
      if (stage === "reveal") {
        if (timeLeft <= 0) {
          if (idx >= bank.length - 1) finished = true;
          else { stage = "gap"; timeLeft = PASAL_GAP; }
        }
      }
    },
    lock(t, now) {
      if (stage !== "answer") return { ok: false, error: "Belum bisa lock sekarang." };
      if (t.locked) return { ok: false, error: "Jawaban sudah dikunci." };
      const z = zoneOfTeam(t);
      if (!z) return { ok: false, error: "Masuk ke salah satu lingkaran jawaban dulu." };
      lockAnswer(t, z.code, now);
      return { ok: true };
    },
    cancel(t) {
      if (stage !== "answer") return false;
      if (!t.locked) return false;
      if (cur && cur.results[t.id]) {
        const r = cur.results[t.id];
        if (r.zoneCode != null) t.score -= r.pts;
        delete cur.results[t.id];
      }
      t.locked = false; t.lockedZone = null;
      return true;
    },
    isDone() { return finished; },
    end() { for (const t of game.teams.values()) { t.locked = false; t.lockedZone = null; } },
    snapshot() {
      const results = cur ? Object.entries(cur.results).map(([teamId, r]) => ({ teamId, ...r })) : [];
      const revealing = stage === "reveal";
      return {
        kind: "pasal",
        prompt: cur && stage !== "gap" ? cur.q.text : (finished ? "Semua soal selesai." : "Soal berikutnya segera muncul."),
        stage,
        timeLeft: Math.max(0, Math.ceil(timeLeft)),
        holdLeft: stage === "hold" ? Math.max(0, Math.ceil(holdLeft)) : 0,
        results,
        answer: revealing && cur ? cur.q.answer : null,
        questionNo: idx + 1, total: bank.length,
      };
    },
  };
}

function makePilah() {
  const deck = takeN(DATA.PILAH_CARDS, DATA.PILAH_COUNT);
  let idx = -1;
  let stage = "gap";
  let timeLeft = PILAH_GAP;
  let holdLeft = 0;
  let cur = null;
  let finished = false;
  let currentZones = [];

  function generateZones() {
    const zoneDefs = DATA.PILAH_ZONES;
    const zones = [];
    for (const def of zoneDefs) {
      const spot = randomZoneSpot(zones);
      zones.push({ code: def.code, label: def.label, color: def.color, x: spot.x, y: spot.y, r: PILAH_ZONE_R });
    }
    return zones;
  }

  function zoneOfTeam(t) {
    for (const z of currentZones) { if (Math.hypot(t.x - z.x, t.y - z.y) <= z.r) return z; }
    return null;
  }

  function calcPoints(ok, correctCountBefore) {
    if (!ok) return -5;
    const pts = 20 - 3 * correctCountBefore;
    return Math.max(5, pts);
  }
  function countCorrectBefore() {
    if (!cur) return 0;
    let n = 0;
    for (const r of Object.values(cur.results)) if (r.ok) n++;
    return n;
  }

  function lockAnswer(t, zoneCode, now) {
    if (!cur || t.locked) return;
    const ok = zoneCode === cur.card.type;
    const pts = zoneCode == null ? 0 : calcPoints(ok, countCorrectBefore());
    if (zoneCode != null) t.score += pts;
    cur.results[t.id] = { ok: !!ok, pts, zoneCode, name: t.name, autoLocked: false, at: now };
    t.locked = true; t.lockedZone = zoneCode;
  }
  function autoLockRemaining(now) {
    if (!cur) return;
    for (const t of game.teams.values()) {
      if (t.locked) continue;
      const z = zoneOfTeam(t);
      const code = z ? z.code : null;
      const ok = code && code === cur.card.type;
      const pts = code == null ? 0 : calcPoints(!!ok, countCorrectBefore());
      if (code != null) t.score += pts;
      cur.results[t.id] = { ok: !!ok, pts, zoneCode: code, name: t.name, autoLocked: true, at: now };
      t.locked = true; t.lockedZone = code;
    }
  }
  function allLocked() {
    if (game.teams.size === 0) return false;
    for (const t of game.teams.values()) if (!t.locked) return false;
    return true;
  }
  function startAnswer() {
    idx += 1;
    cur = { card: deck[idx], results: {} };
    stage = "answer"; timeLeft = PILAH_CARD_TIME;
    currentZones = generateZones();
    for (const t of game.teams.values()) { t.locked = false; t.lockedZone = null; }
  }
  function startReveal(now) { autoLockRemaining(now); stage = "reveal"; timeLeft = PILAH_RESULT_TIME; }

  return {
    key: "pilah",
    get zones() { return currentZones; },
    init() {
      currentZones = generateZones();
      for (const t of game.teams.values()) {
        t.locked = false; t.lockedZone = null;
        const sp = game.spawnPoints[t.spawn]; t.x = sp.x; t.y = sp.y;
      }
    },
    tick(now, dt) {
      if (finished) return;
      timeLeft -= dt;
      if (stage === "gap") { if (timeLeft <= 0) startAnswer(); return; }
      if (stage === "answer") {
        if (allLocked()) { stage = "hold"; holdLeft = PASAL_HOLD; return; }
        if (timeLeft <= 0) startReveal(now);
        return;
      }
      if (stage === "hold") {
        holdLeft -= dt;
        if (holdLeft <= 0) startReveal(now);
        return;
      }
      if (stage === "reveal") {
        if (timeLeft <= 0) {
          if (idx >= deck.length - 1) finished = true;
          else { stage = "gap"; timeLeft = PILAH_GAP; }
        }
      }
    },
    lock(t, now) {
      if (stage !== "answer") return { ok: false, error: "Belum bisa lock sekarang." };
      if (t.locked) return { ok: false, error: "Jawaban sudah dikunci." };
      const z = zoneOfTeam(t);
      if (!z) return { ok: false, error: "Masuk ke salah satu zona kategori dulu." };
      lockAnswer(t, z.code, now);
      return { ok: true };
    },
    cancel(t) {
      if (stage !== "answer") return false;
      if (!t.locked) return false;
      if (cur && cur.results[t.id]) {
        const r = cur.results[t.id];
        if (r.zoneCode != null) t.score -= r.pts;
        delete cur.results[t.id];
      }
      t.locked = false; t.lockedZone = null;
      return true;
    },
    isDone() { return finished; },
    end() { for (const t of game.teams.values()) { t.locked = false; t.lockedZone = null; } },
    snapshot() {
      const results = cur ? Object.entries(cur.results).map(([teamId, r]) => ({ teamId, ...r })) : [];
      const revealing = stage === "reveal";
      return {
        kind: "pilah",
        prompt: cur && stage !== "gap"
          ? "Bawa kartu ke kategori yang tepat, lalu tekan Kunci. Lock cepat = poin lebih tinggi!"
          : (finished ? "Semua kartu selesai." : "Kartu berikutnya segera muncul."),
        card: cur ? cur.card.label : null,
        stage,
        timeLeft: Math.max(0, Math.ceil(timeLeft)),
        holdLeft: stage === "hold" ? Math.max(0, Math.ceil(holdLeft)) : 0,
        answer: revealing && cur ? cur.card.type : null,
        results,
        cardNo: idx + 1, total: deck.length,
      };
    },
  };
}

const ROUND_MAKERS = { rakit: makeRakit, pasal: makePasal, pilah: makePilah };

function startPreround(i) {
  game.roundIndex = i;
  game.phase = "preround";
  game.round = null;
  game.pieces = [];
  game.roundLeft = 0;
  game.betweenLeft = 0;
}
function startPlaying() {
  if (game.roundIndex < 0 || game.roundIndex >= ROUND_DEFS.length) return;
  const def = ROUND_DEFS[game.roundIndex];
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
    startPreround(game.roundIndex + 1);
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
  game.map = pickMap();
  game.spawnPoints = generateSpawnPoints(game.map);
  for (const s of io.sockets.sockets.values()) s.data.teamId = null;
  io.emit("reset");
}

function snapshot() {
  const teams = [...game.teams.values()];
  const round = game.round;
  const def = game.roundIndex >= 0 ? ROUND_DEFS[game.roundIndex] : null;
  const nextDef = (game.phase === "between" || game.phase === "preround") && game.roundIndex < ROUND_DEFS.length - 1 ? ROUND_DEFS[game.roundIndex] : null;
  const roundKey = def ? def.key : null;
  const stage = round ? round.snapshot() : null;
  const hideTeamsOnDisplay =
    roundKey === "pasal" && stage && (stage.stage === "answer" || stage.stage === "hold");
  const teamData = teams.map((t) => ({
    id: t.id, name: t.name, color: t.color,
    x: Math.round(t.x), y: Math.round(t.y),
    spawnX: game.spawnPoints[t.spawn].x, spawnY: game.spawnPoints[t.spawn].y,
    score: t.score, board: t.board, pieces: boardCount(t),
    carryType: t.carry ? pieceType(t.carry) : null,
    canPickup: !!t.nearPieceId,
    members: t.members.size,
    locked: !!t.locked, lockedZone: t.lockedZone || null,
  }));
  return {
    phase: game.phase,
    roundIndex: game.roundIndex,
    roundCount: ROUND_DEFS.length,
    roundKey: roundKey,
    roundTitle: def ? def.title : "",
    roundDesc: def ? def.desc : "",
    roundLeft: Math.max(0, Math.ceil(game.roundLeft)),
    betweenLeft: Math.max(0, Math.ceil(game.betweenLeft)),
    nextRoundTitle: nextDef ? nextDef.title : null,
    stage: stage,
    zones: round ? round.zones : [],
    pieces: game.pieces.filter((p) => !p.respawnAt)
      .map((p) => ({ id: p.id, type: p.type, x: Math.round(p.x), y: Math.round(p.y), holder: p.holder || null })),
    pieceDefs: DATA.PIECES,
    teams: teamData,
    hideTeamsOnDisplay: hideTeamsOnDisplay,
    scoreboard: teams.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, pieces: boardCount(t) })),
    map: { name: game.map.name, rivers: game.map.rivers, bridges: game.map.bridges, rocks: game.map.rocks },
    lanUrls, width: W, height: H,
  };
}

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
    if (!playerName || !teamName) return reply(ack, { ok: false, error: "Isi nama dan nama tim dulu." });
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
    if (len > 1) { x /= len; y /= len; }
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

  socket.on("drop", (ack) => {
    const t = teamOf(socket);
    if (!t) return reply(ack, { ok: false, error: "Masuk ke tim dulu." });
    if (!game.round || game.round.key !== "rakit" || !game.round.drop) {
      return reply(ack, { ok: false, error: "Tidak ada yang bisa dibuang sekarang." });
    }
    const ok = game.round.drop(t);
    reply(ack, ok ? { ok: true } : { ok: false, error: "Tidak sedang membawa potongan." });
  });

  socket.on("lock", (ack) => {
    const t = teamOf(socket);
    if (!t) return reply(ack, { ok: false, error: "Masuk ke tim dulu." });
    if (!game.round || !game.round.lock) return reply(ack, { ok: false, error: "Belum ada soal." });
    const res = game.round.lock(t, Date.now());
    reply(ack, res);
  });

  socket.on("cancel", (ack) => {
    const t = teamOf(socket);
    if (!t) return reply(ack, { ok: false, error: "Masuk ke tim dulu." });
    if (!game.round || !game.round.cancel) return reply(ack, { ok: false, error: "Belum ada soal." });
    const ok = game.round.cancel(t);
    reply(ack, ok ? { ok: true } : { ok: false, error: "Jawaban belum dikunci." });
  });

  function needHost(ack) {
    if (socket.data.isHost) return true;
    reply(ack, { ok: false, error: "Masukkan PIN host dulu." });
    return false;
  }

  socket.on("host:auth", (pin, ack) => {
    if (String(pin) === HOST_PIN) { socket.data.isHost = true; reply(ack, { ok: true }); }
    else reply(ack, { ok: false, error: "PIN salah." });
  });

  socket.on("host:start", (ack) => {
    if (!needHost(ack)) return;
    if (game.phase !== "lobby") return reply(ack, { ok: false, error: "Permainan sudah berjalan." });
    if (game.teams.size === 0) return reply(ack, { ok: false, error: "Belum ada tim yang masuk." });
    startPreround(0);
    reply(ack, { ok: true });
  });

  socket.on("host:beginPlay", (ack) => {
    if (!needHost(ack)) return;
    if (game.phase !== "preround") return reply(ack, { ok: false, error: "Tidak dalam fase preround." });
    startPlaying();
    reply(ack, { ok: true });
  });

  socket.on("host:skip", (ack) => {
    if (!needHost(ack)) return;
    if (game.phase === "playing") endRound();
    else if (game.phase === "between") game.betweenLeft = 0;
    else if (game.phase === "preround") startPlaying();
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
    if (game.roundLeft <= 0 || r.isDone()) endRound();
  } else if (game.phase === "between") {
    game.betweenLeft -= dt;
    if (game.betweenLeft <= 0) startPreround(game.roundIndex + 1);
  }
}, TICK_MS);

setInterval(() => { io.emit("state", snapshot()); }, TICK_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("Jejak Wawasan Nusantara sudah berjalan.");
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
