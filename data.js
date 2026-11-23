"use strict";

// Semua isi permainan (potongan, zona, soal, kartu) ada di sini.
// Tema: Wawasan Nusantara (konsep geopolitik Indonesia berdasarkan Deklarasi
// Djuanda 1957 dan Pasal 25A UUD NRI 1945).

// Ronde 1: potongan "Peta Wawasan Nusantara". Sembilan potongan berupa lima
// pulau besar Indonesia (Sumatera, Jawa, Kalimantan, Sulawesi, Papua) dan
// empat simbol/pilar wawasan nusantara (Bendera, Pancasila, UUD 1945, Garuda).
const PIECES = [
  { id: "sumatera", label: "P. Sumatera", color: "#38a169", info: "Pulau terbesar di bagian barat Indonesia." },
  { id: "jawa",     label: "P. Jawa",     color: "#d69e2e", info: "Pulau terpadat, pusat pemerintahan Indonesia." },
  { id: "kalimantan", label: "P. Kalimantan", color: "#dd6b20", info: "Pulau terbesar di Indonesia." },
  { id: "sulawesi", label: "P. Sulawesi", color: "#805ad5", info: "Pulau berbentuk huruf K di tengah Nusantara." },
  { id: "papua",    label: "P. Papua",    color: "#3182ce", info: "Pulau paling timur Indonesia." },
  { id: "bendera",  label: "Merah Putih", color: "#e53e3e", info: "Bendera Negara Kesatuan Republik Indonesia." },
  { id: "pancasila", label: "Pancasila",  color: "#f6e05e", info: "Dasar ideologi Wawasan Nusantara." },
  { id: "uud",      label: "UUD 1945",    color: "#ecc94b", info: "Landasan konstitusional (Pasal 25A: Negara Kepulauan)." },
  { id: "garuda",   label: "Garuda",      color: "#f6ad55", info: "Lambang persatuan bangsa Indonesia." },
];

// Jumlah potongan yang beredar di peta sekaligus. Dibuat lebih besar dari
// jumlah tipe (9) supaya ada duplikasi, dan setiap tipe dijamin minimal
// muncul satu kali di peta (dijamin di server.js).
const POOL_SIZE = 14;

// Ronde 2: zona jawaban. Empat aspek Pancagatra dari Wawasan Nusantara.
// Warna sengaja dipilih yang kontras tinggi vs rumput/pasir/air (hindari
// hijau & kuning yang nyaru sama tile map).
const PASAL_ZONES = [
  { code: "A", label: "Politik",        x: 600, y: 215, r: 90, color: "#ff3860" }, // merah muda terang
  { code: "B", label: "Ekonomi",        x: 795, y: 400, r: 90, color: "#ff7f11" }, // oranye neon
  { code: "C", label: "Sosial Budaya",  x: 600, y: 585, r: 90, color: "#d946ef" }, // magenta
  { code: "D", label: "Hankam",         x: 405, y: 400, r: 90, color: "#06aed5" }, // cyan terang
];

const PASAL_QUESTIONS = [
  { text: "Pemilihan Umum dan sistem pemerintahan presidensial merupakan perwujudan Wawasan Nusantara di aspek?", answer: "A" },
  { text: "Perdagangan antarpulau, APBN, dan hilirisasi nikel termasuk perwujudan Wawasan Nusantara di aspek?", answer: "B" },
  { text: "Pelestarian bahasa daerah dan toleransi antarumat beragama termasuk aspek Pancagatra?", answer: "C" },
  { text: "Patroli TNI AL menjaga kedaulatan di Laut Natuna Utara masuk aspek?", answer: "D" },
  { text: "Pengakuan Bahasa Indonesia sebagai bahasa persatuan termasuk aspek?", answer: "C" },
  { text: "Pancasila sebagai satu-satunya ideologi negara mencerminkan kesatuan aspek?", answer: "A" },
  { text: "Program Tol Laut untuk pemerataan harga antarpulau adalah perwujudan aspek?", answer: "B" },
  { text: "Wajib bela negara dan Komcad (Komponen Cadangan) termasuk aspek?", answer: "D" },
  { text: "Festival budaya Papua dan pengakuan masyarakat adat termasuk aspek?", answer: "C" },
  { text: "Diplomasi bebas aktif Indonesia di PBB dan ASEAN termasuk aspek?", answer: "A" },
  { text: "Satu kesatuan ekonomi di seluruh Nusantara menuntut pemerataan di aspek?", answer: "B" },
  { text: "Pos pengamanan perbatasan di Pulau Miangas dan Rondo adalah bentuk aspek?", answer: "D" },
];
const PASAL_COUNT = 10;

// Ronde 3: dua zona klasifikasi astagatra.
// Trigatra = aspek alamiah (geografi, demografi, sumber kekayaan alam).
// Pancagatra = aspek sosial (ideologi, politik, ekonomi, sosbud, hankam).
const PILAH_ZONES = [
  { code: "trigatra",  label: "Trigatra (Alamiah)", x: 405, y: 400, r: 115, color: "#22c1c3" }, // teal terang
  { code: "pancagatra", label: "Pancagatra (Sosial)", x: 795, y: 400, r: 115, color: "#ff4081" }, // pink terang
];

const PILAH_CARDS = [
  // Trigatra (alamiah)
  { label: "Letak Indonesia di antara dua benua", type: "trigatra" },
  { label: "Jumlah penduduk 280 juta jiwa", type: "trigatra" },
  { label: "Cadangan nikel terbesar dunia", type: "trigatra" },
  { label: "17.000 pulau dari Sabang sampai Merauke", type: "trigatra" },
  { label: "Keberagaman suku bangsa 1.300 lebih", type: "trigatra" },
  { label: "Hutan tropis Kalimantan dan Papua", type: "trigatra" },
  { label: "Posisi silang di antara dua samudra", type: "trigatra" },
  // Pancagatra (sosial)
  { label: "Pancasila sebagai dasar negara", type: "pancagatra" },
  { label: "Pemilu lima tahun sekali", type: "pancagatra" },
  { label: "Perdagangan antarprovinsi", type: "pancagatra" },
  { label: "Gotong royong dan musyawarah mufakat", type: "pancagatra" },
  { label: "TNI menjaga kedaulatan NKRI", type: "pancagatra" },
  { label: "Bhinneka Tunggal Ika sebagai semboyan", type: "pancagatra" },
  { label: "Bahasa Indonesia sebagai bahasa persatuan", type: "pancagatra" },
  { label: "Politik luar negeri bebas aktif", type: "pancagatra" },
  { label: "Sistem ekonomi Pancasila", type: "pancagatra" },
];
const PILAH_COUNT = 12;

const MAP_PRESETS = [
  {
    name: "preset0",
    rivers: [
      { x1: 40, y1: 90, x2: 470, y2: 40, w: 70 },
      { x1: 1160, y1: 720, x2: 740, y2: 770, w: 70 },
    ],
    bridges: [
      { x: 255, y: 65, r: 48 },
      { x: 950, y: 745, r: 48 },
    ],
    rocks: [
      { x: 150, y: 220, r: 44 },
      { x: 1050, y: 580, r: 44 },
      { x: 180, y: 650, r: 40 },
      { x: 1040, y: 160, r: 40 },
    ],
  },
  {
    name: "preset1",
    rivers: [
      { x1: 1160, y1: 60, x2: 760, y2: 25, w: 70 },
      { x1: 40, y1: 740, x2: 450, y2: 775, w: 70 },
    ],
    bridges: [
      { x: 960, y: 43, r: 48 },
      { x: 245, y: 757, r: 48 },
    ],
    rocks: [
      { x: 1080, y: 230, r: 42 },
      { x: 120, y: 560, r: 42 },
      { x: 950, y: 700, r: 38 },
      { x: 220, y: 110, r: 38 },
    ],
  },
  {
    name: "preset2",
    rivers: [
      { x1: 40, y1: 400, x2: 40, y2: 760, w: 70 },
      { x1: 1160, y1: 400, x2: 1160, y2: 40, w: 70 },
    ],
    bridges: [
      { x: 40, y: 580, r: 48 },
      { x: 1160, y: 220, r: 48 },
    ],
    rocks: [
      { x: 160, y: 715, r: 42 },
      { x: 1040, y: 85, r: 42 },
      { x: 150, y: 120, r: 40 },
      { x: 1060, y: 700, r: 40 },
    ],
  },
];

module.exports = {
  PIECES, POOL_SIZE,
  PASAL_ZONES, PASAL_QUESTIONS, PASAL_COUNT,
  PILAH_ZONES, PILAH_CARDS, PILAH_COUNT,
  MAP_PRESETS,
};
