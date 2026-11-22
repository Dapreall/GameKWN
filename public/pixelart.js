(function (global) {
  "use strict";

  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function shade(hex, amt) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.substr(0, 2), 16);
    var g = parseInt(h.substr(2, 2), 16);
    var b = parseInt(h.substr(4, 2), 16);
    var t = amt < 0 ? 0 : 255;
    var p = Math.abs(amt);
    r = clamp255(Math.round(r + (t - r) * p));
    g = clamp255(Math.round(g + (t - g) * p));
    b = clamp255(Math.round(b + (t - b) * p));
    function h2(n) { var s = n.toString(16); return s.length < 2 ? "0" + s : s; }
    return "#" + h2(r) + h2(g) + h2(b);
  }

  function makeRng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, salt) {
    var n = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return ((n >>> 0) % 1000) / 1000;
  }

  // ---------- Primitif gambar ----------
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  // Gambar kumpulan blok [dx,dy,w,h] relatif ke (ox,oy), dengan outline otomatis.
  function drawBlocks(ctx, ox, oy, blocks, color, outline, scale) {
    scale = scale || 1;
    if (outline) {
      ctx.fillStyle = outline;
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var x = ox + b[0] * scale - 1;
        var y = oy + b[1] * scale - 1;
        var w = b[2] * scale + 2;
        var h = b[3] * scale + 2;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      }
    }
    ctx.fillStyle = color;
    for (var j = 0; j < blocks.length; j++) {
      var c = blocks[j];
      var cx = ox + c[0] * scale;
      var cy = oy + c[1] * scale;
      var cw = c[2] * scale;
      var ch = c[3] * scale;
      ctx.fillRect(Math.round(cx), Math.round(cy), Math.max(1, Math.round(cw)), Math.max(1, Math.round(ch)));
    }
  }

  function ditherCircle(ctx, cx, cy, r, color) {
    var x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    var y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    ctx.fillStyle = color;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (((x + y) & 1) !== 0) continue; // pola kotak-kotak 50% -> efek "dither" ala game lama
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function dashedRing(ctx, cx, cy, r, color, count) {
    ctx.fillStyle = color;
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2;
      var x = Math.round(cx + Math.cos(a) * r);
      var y = Math.round(cy + Math.sin(a) * r);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // ---------- Ikon potongan lambang (9 jenis dari data.js) ----------
  // Semua dalam koordinat lokal kecil (-7..7), scale diatur saat gambar.
  var ICONS = {
    sila1: [[-1, -6, 2, 12], [-6, -1, 12, 2]], // Bintang
    sila2: [ // Rantai: dua cincin berongga
      [-6, -3, 5, 2], [-6, 1, 5, 2], [-6, -3, 2, 6], [-3, -3, 2, 6],
      [1, -3, 5, 2], [1, 1, 5, 2], [1, -3, 2, 6], [4, -3, 2, 6],
    ],
    sila3: [ // Pohon beringin
      [-1, 1, 2, 5], [-5, -6, 10, 3], [-4, -3, 8, 3], [-3, -1, 6, 2],
    ],
    sila4: [ // Kepala banteng
      [-4, -3, 8, 2], [-3, -1, 6, 2], [-2, 1, 4, 2],
      [-7, -6, 3, 3], [4, -6, 3, 3],
    ],
    sila5: [ // Padi dan kapas
      [-3, 3, 2, 2], [-1, 1, 2, 2], [1, -1, 2, 2], [3, -3, 2, 2],
    ],
    pita: [[-6, -2, 12, 4], [-8, -1, 2, 2], [6, -1, 2, 2]], // Pita
    badan: [[-2, -6, 4, 2], [-4, -4, 8, 7], [-3, 3, 6, 2]], // Badan garuda
    kepala: [[-4, -4, 7, 6], [3, -2, 3, 2]], // Kepala garuda
    sayap: [[-1, -6, 2, 3], [1, -4, 2, 4], [3, -2, 2, 5], [5, 0, 2, 5]], // Sayap
  };
  var ICON_ACCENT = {
    sila5: [[-5, -5, 2, 2], [-3, -6, 2, 2], [-6, -3, 2, 2]], // kapas putih
  };

  function drawPieceIcon(ctx, x, y, typeId, color, scale, outline) {
    scale = scale || 1;
    outline = outline || "#1a1410";
    var blocks = ICONS[typeId] || [[-5, -5, 10, 10]];
    drawBlocks(ctx, x, y, blocks, color, outline, scale);
    var accent = ICON_ACCENT[typeId];
    if (accent) drawBlocks(ctx, x, y, accent, "#fbf6ea", outline, scale);
  }

  function iconCanvas(typeId, color, size, outline) {
    var c = global.document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    var scale = size / 16;
    drawPieceIcon(ctx, size / 2, size / 2, typeId, color, scale, outline);
    return c;
  }
  function iconDataURL(typeId, color, size, outline) {
    return iconCanvas(typeId, color, size, outline).toDataURL("image/png");
  }

  // ---------- Karakter pemain ----------
  function drawCharacter(ctx, x, y, color, tms, moving, scale) {
    scale = scale || 1;
    var bob = moving ? (Math.sin(tms / 90) > 0 ? 1 : 0) : 0;
    var skin = "#f1c27d", skinSh = "#c98f55", hair = "#2b1b12", shoe = "#241f1c";
    var shirtSh = shade(color, -0.3);
    var legL = moving && Math.sin(tms / 90) > 0 ? 1 : 0;
    var legR = moving && Math.sin(tms / 90) <= 0 ? 1 : 0;
    var blocks = [
      // kaki (bergerak selang-seling saat jalan)
      [-3, 3 + legL, 2, 3],
      [1, 3 + legR, 2, 3],
    ];
    drawBlocks(ctx, x, y - bob, blocks, shoe, "#1a1410", scale);
    var body = [
      [-4, -1, 2, 4], // lengan kiri
      [2, -1, 2, 4], // lengan kanan
      [-3, -2, 6, 5], // baju (warna tim)
    ];
    drawBlocks(ctx, x, y - bob, body, color, "#1a1410", scale);
    drawBlocks(ctx, x, y - bob, [[-3, 2, 6, 1]], shirtSh, null, scale);
    var head = [
      [-3, -8, 6, 5], // kepala
    ];
    drawBlocks(ctx, x, y - bob, head, skin, "#1a1410", scale);
    drawBlocks(ctx, x, y - bob, [[-3, -9, 6, 2]], hair, "#1a1410", scale);
    // mata
    rect(ctx, x + (-2) * scale, y - bob + (-6) * scale, scale, scale, "#1a1410");
    rect(ctx, x + (1) * scale, y - bob + (-6) * scale, scale, scale, "#1a1410");
    void skinSh;
  }

  function avatarCanvas(color, size) {
    var c = global.document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    var scale = size / 16;
    drawBlocks(ctx, size / 2, size / 2 + 2 * scale, [[-4, -4, 8, 7]], color, "#1a1410", scale);
    drawBlocks(ctx, size / 2, size / 2 + 2 * scale, [[-3, -9, 6, 5]], "#f1c27d", "#1a1410", scale);
    drawBlocks(ctx, size / 2, size / 2 + 2 * scale, [[-3, -10, 6, 2]], "#2b1b12", "#1a1410", scale);
    rect(ctx, size / 2 - 2 * scale, size / 2 - 7 * scale, scale, scale, "#1a1410");
    rect(ctx, size / 2 + 1 * scale, size / 2 - 7 * scale, scale, scale, "#1a1410");
    return c;
  }
  function avatarDataURL(color, size) { return avatarCanvas(color, size).toDataURL("image/png"); }

  // ---------- Lambang kecil (logo Garuda sederhana untuk layar pembuka/judul) ----------
  function drawEmblem(ctx, x, y, scale) {
    scale = scale || 1;
    var gold = "#d69e2e", ink = "#1a1410";
    var sayapR = ICONS.sayap;
    drawBlocks(ctx, x, y, sayapR, gold, ink, scale);
    var sayapL = sayapR.map(function (b) { return [-(b[0] + b[2]), b[1], b[2], b[3]]; });
    drawBlocks(ctx, x, y, sayapL, gold, ink, scale);
    drawBlocks(ctx, x, y, ICONS.badan, gold, ink, scale);
    drawBlocks(ctx, x, y - 7 * scale, ICONS.kepala, gold, ink, scale);
    drawBlocks(ctx, x, y + 8 * scale, ICONS.pita, "#e53e3e", ink, scale);
    var star = ICONS.sila1.map(function (b) { return [b[0] * 0.6, b[1] * 0.6, b[2] * 0.6, b[3] * 0.6]; });
    drawBlocks(ctx, x, y + 1 * scale, star, "#fff4d6", null, scale);
  }
  function emblemCanvas(size) {
    var c = global.document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    var scale = size / 26;
    drawEmblem(ctx, size / 2, size / 2, scale);
    return c;
  }
  function emblemDataURL(size) { return emblemCanvas(size).toDataURL("image/png"); }

  // ---------- Bendera (untuk zona dan pangkalan tim) ----------
  function drawFlag(ctx, x, y, color, scale) {
    scale = scale || 1;
    drawBlocks(ctx, x, y, [[-1, -11, 1, 12]], "#79532c", "#1a1410", scale);
    drawBlocks(ctx, x, y, [[0, -11, 6, 2], [0, -8, 5, 2], [0, -5, 4, 2]], color, "#1a1410", scale);
  }

  function drawDecor(ctx, x, y, kind, scale) {
    scale = scale || 1;
    if (kind === "tree") {
      drawBlocks(ctx, x, y, [[-1, 1, 2, 4]], "#5a3b22", "#1a1410", scale);
      drawBlocks(ctx, x, y, [[-4, -7, 8, 3], [-5, -5, 10, 3], [-4, -3, 8, 2]], "#2f7a3c", "#1a1410", scale);
      drawBlocks(ctx, x, y, [[-3, -7, 3, 2]], "#49a158", null, scale);
    } else if (kind === "rock") {
      drawBlocks(ctx, x, y, [[-3, -2, 6, 4], [-2, -3, 4, 1]], "#8a8f98", "#1a1410", scale);
      drawBlocks(ctx, x, y, [[-2, -1, 2, 1]], "#aeb3bb", null, scale);
    } else if (kind === "bush") {
      drawBlocks(ctx, x, y, [[-3, -2, 6, 4]], "#3f8a44", "#1a1410", scale);
      drawBlocks(ctx, x, y, [[-2, -1, 2, 1]], "#5fae55", null, scale);
    } else if (kind === "flower") {
      rect(ctx, x, y, scale, scale, "#ffe9a8");
      rect(ctx, x - scale, y, scale, scale, "#e4572e");
      rect(ctx, x + scale, y, scale, scale, "#e4572e");
    }
  }

  // ---------- Obstacle (bagian peta yang tidak bisa dilewati) ----------
  // Digambar sebagai tanah padas kasar (dither) + beberapa gumpalan batu di
  // atasnya, supaya terbaca sebagai halangan sungguhan menyatu dengan peta,
  // bukan sekadar lingkaran tempelan.
  function drawObstacle(ctx, x, y, r, seedN) {
    seedN = seedN || 0;
    var base = "#6b5a46", baseSh = "#4d4034", edge = "#2e2419";
    var x0 = Math.floor(x - r), x1 = Math.ceil(x + r);
    var y0 = Math.floor(y - r), y1 = Math.ceil(y + r);
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        var dx = xx - x, dy = yy - y;
        var dd = dx * dx + dy * dy;
        if (dd > r * r) continue;
        var h = hash2(xx, yy, 71 + seedN);
        var edgeZone = dd > (r - 2) * (r - 2);
        ctx.fillStyle = edgeZone ? (h > 0.5 ? edge : baseSh) : (h > 0.6 ? base : baseSh);
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
    var n = 2 + (seedN % 2);
    for (var i = 0; i < n; i++) {
      var ang = hash2(seedN, i, 5) * Math.PI * 2;
      var rr = r * (0.25 + hash2(seedN, i, 9) * 0.3);
      var ox = x + Math.cos(ang) * rr * 0.5;
      var oy = y + Math.sin(ang) * rr * 0.5;
      drawDecor(ctx, ox, oy, "rock", Math.max(1, r / 16));
    }
  }

  // ---------- Peta latar (dibangun sekali lalu dicache jadi gambar) ----------
  // Sekarang daratan jadi default (bukan laut), dan air cuma ada di dalam
  // jalur sungai (rivers) yang dikirim server. Jembatan (bridges) jadi jalur
  // kayu yang "membatalkan" status air di titik itu. mapDef pakai koordinat
  // yang sama dengan canvas ini (sudah diskalakan ke resolusi rendah).
  function buildBackground(doc, W, H, mapDef) {
    mapDef = mapDef || {};
    var rivers = mapDef.rivers || [];
    var bridges = mapDef.bridges || [];
    var seed = mapDef.seed != null ? mapDef.seed : 42;
    var canvas = doc.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    var rnd = makeRng(seed);

    function distToSeg(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var len2 = dx * dx + dy * dy;
      var t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
    function onBridgeAt(x, y) {
      for (var i = 0; i < bridges.length; i++) {
        var b = bridges[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r) return true;
      }
      return false;
    }
    // Jarak minimum ke tepi sungai terdekat (negatif = di dalam air).
    function riverGap(x, y) {
      var gap = Infinity;
      for (var i = 0; i < rivers.length; i++) {
        var r = rivers[i];
        var g = distToSeg(x, y, r.x1, r.y1, r.x2, r.y2) - r.w / 2;
        if (g < gap) gap = g;
      }
      return gap;
    }

    // cat: 0 daratan, 1 pasir tepi air, 2 air, 3 jembatan
    var catMap = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var bridge = onBridgeAt(x, y);
        var gap = bridge ? 1 : riverGap(x, y);
        var cat = bridge ? 3 : gap <= 0 ? 2 : gap <= 2 ? 1 : 0;
        catMap[y * W + x] = cat;
        var col;
        if (cat === 3) {
          var hw = hash2(x, y, 31);
          col = hw > 0.5 ? "#8a5a2f" : "#6e4420";
        } else if (cat === 2) {
          var wv = hash2(x, y, 11);
          col = wv > 0.93 ? "#3f86ac" : (wv > 0.85 ? "#2c6690" : "#1d4870");
        } else if (cat === 1) {
          var hs = hash2(x, y, 23);
          col = hs > 0.6 ? "#e9cf98" : (hs > 0.25 ? "#d9b878" : "#cfa968");
        } else {
          var hg = hash2(x, y, 23);
          col = hg > 0.88 ? "#6fbf62" : (hg > 0.6 ? "#5fae55" : (hg > 0.18 ? "#479a4a" : "#3f8a44"));
        }
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Sebar dekorasi kecil (pohon/batu/semak/bunga) di daratan saja, jarang-jarang.
    var placed = [];
    var tries = 0;
    var target = 16 + Math.floor(rnd() * 10);
    while (placed.length < target && tries < 900) {
      tries++;
      var px = Math.floor(rnd() * W);
      var py = Math.floor(rnd() * H);
      if (catMap[py * W + px] !== 0) continue;
      var ok = true;
      for (var i = 0; i < placed.length; i++) {
        var pd = Math.hypot(placed[i][0] - px, placed[i][1] - py);
        if (pd < 14) { ok = false; break; }
      }
      if (!ok) continue;
      var r2 = rnd();
      var kind = r2 > 0.78 ? "rock" : (r2 > 0.52 ? "bush" : (r2 > 0.22 ? "tree" : "flower"));
      drawDecor(ctx, px, py, kind, 1);
      placed.push([px, py]);
    }

    return canvas;
  }

  global.PixelArt = {
    shade: shade,
    makeRng: makeRng,
    rect: rect,
    drawBlocks: drawBlocks,
    ditherCircle: ditherCircle,
    dashedRing: dashedRing,
    drawPieceIcon: drawPieceIcon,
    iconDataURL: iconDataURL,
    drawCharacter: drawCharacter,
    avatarDataURL: avatarDataURL,
    drawFlag: drawFlag,
    drawDecor: drawDecor,
    drawObstacle: drawObstacle,
    buildBackground: buildBackground,
    drawEmblem: drawEmblem,
    emblemDataURL: emblemDataURL,
  };
})(typeof window !== "undefined" ? window : globalThis);
