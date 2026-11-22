"use strict";

// Semua isi permainan (potongan, zona, soal, kartu) ada di sini.
// Kalau mau mengganti soal, cukup edit file ini.

const PIECES = [
  { id: "sila1", label: "Bintang", color: "#f6e05e", info: "Sila 1: Ketuhanan Yang Maha Esa" },
  { id: "sila2", label: "Rantai", color: "#a0aec0", info: "Sila 2: Kemanusiaan yang adil dan beradab" },
  { id: "sila3", label: "Pohon Beringin", color: "#38a169", info: "Sila 3: Persatuan Indonesia" },
  { id: "sila4", label: "Kepala Banteng", color: "#8d5a2b", info: "Sila 4: Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam permusyawaratan perwakilan" },
  { id: "sila5", label: "Padi dan Kapas", color: "#d69e2e", info: "Sila 5: Keadilan sosial bagi seluruh rakyat Indonesia" },
  { id: "pita", label: "Pita", color: "#e53e3e", info: "Pita bertuliskan Bhinneka Tunggal Ika" },
  { id: "badan", label: "Badan", color: "#ecc94b", info: "Bagian badan Garuda" },
  { id: "kepala", label: "Kepala", color: "#dd6b20", info: "Bagian kepala Garuda" },
  { id: "sayap", label: "Sayap", color: "#f6ad55", info: "Bagian sayap Garuda" },
];

// Jumlah potongan yang dibutuhkan untuk melengkapi satu papan rakit.
const POOL_SIZE = 12; // jumlah potongan yang beredar di peta sekaligus

// Ronde 2: zona jawaban (berisi nama simbol, bukan nomor pasal).
const PASAL_ZONES = [
  { code: "A", label: "Bendera", x: 600, y: 230, r: 85, color: "#e53e3e" },
  { code: "B", label: "Bahasa", x: 770, y: 400, r: 85, color: "#3182ce" },
  { code: "C", label: "Lambang", x: 600, y: 570, r: 85, color: "#d69e2e" },
  { code: "D", label: "Lagu", x: 430, y: 400, r: 85, color: "#38a169" },
];

const PASAL_QUESTIONS = [
  { text: "Pasal 35 UUD 1945 mengatur simbol negara apa?", answer: "A" },
  { text: "Pasal 36 UUD 1945 mengatur simbol negara apa?", answer: "B" },
  { text: "Pasal 36A UUD 1945 mengatur simbol negara apa?", answer: "C" },
  { text: "Pasal 36B UUD 1945 mengatur simbol negara apa?", answer: "D" },
  { text: "Simbol negara yang memuat semboyan Bhinneka Tunggal Ika adalah?", answer: "C" },
  { text: "Simbol negara yang berwarna merah putih adalah?", answer: "A" },
  { text: "Simbol negara yang berupa lagu kebangsaan adalah?", answer: "D" },
  { text: "Simbol negara yang menjadi bahasa resmi negara adalah?", answer: "B" },
  { text: "Simbol negara yang berupa Garuda Pancasila adalah?", answer: "C" },
  { text: "Simbol negara yang dikibarkan saat upacara adalah?", answer: "A" },
];
const PASAL_COUNT = 10;

// Ronde 3: dua zona identitas.
const PILAH_ZONES = [
  { code: "pribadi", label: "Identitas Pribadi", x: 420, y: 400, r: 110, color: "#3182ce" },
  { code: "nasional", label: "Identitas Nasional", x: 780, y: 400, r: 110, color: "#e53e3e" },
];

const PILAH_CARDS = [
  { label: "KTP", type: "pribadi" },
  { label: "KTM", type: "pribadi" },
  { label: "NPWP", type: "pribadi" },
  { label: "SIM", type: "pribadi" },
  { label: "Bendera Sang Merah Putih", type: "nasional" },
  { label: "Bahasa Indonesia", type: "nasional" },
  { label: "Lambang Garuda Pancasila", type: "nasional" },
  { label: "Lagu Indonesia Raya", type: "nasional" },
  { label: "Semboyan Bhinneka Tunggal Ika", type: "nasional" },
];
const PILAH_COUNT = 12;

// Ronde 4: pertanyaan terbuka, dipilih lewat voting tim.
const SIDANG_QUESTIONS = [
  {
    text: "Apa yang membuat Indonesia tetap satu meski beragam bahasa dan budaya?",
    options: [
      "Semboyan Bhinneka Tunggal Ika",
      "Setiap daerah berjalan sendiri-sendiri",
      "Persatuan dipaksakan oleh satu kelompok",
      "Tidak perlu ada identitas bersama",
    ],
  },
  {
    text: "Apa yang sebaiknya dilakukan jika ada perbedaan pendapat dalam kelompok?",
    options: [
      "Memaksakan kehendak sendiri",
      "Bermusyawarah sampai mufakat",
      "Diam dan menyerah",
      "Keluar dari kelompok",
    ],
  },
  {
    text: "Apa fungsi identitas nasional bagi sebuah bangsa?",
    options: [
      "Membedakan bangsa dengan bangsa lain",
      "Tidak punya fungsi apa pun",
      "Menggantikan identitas pribadi",
      "Hanya untuk formalitas upacara",
    ],
  },
];
const SIDANG_COUNT = 2;

// Beberapa variasi peta (sungai, jembatan, batu). Dipilih acak setiap game
// supaya peta terasa beda-beda, tapi area tengah (zona + pangkalan tim)
// selalu kering dan aman di semua varian.
//
// - rivers: jalur air berbentuk kapsul (garis dari (x1,y1) ke (x2,y2) dengan
//   lebar w). Berjalan di air memperlambat tim, bukan menghalangi.
// - bridges: lingkaran di atas sungai; berdiri di dalamnya membuat tanah
//   terasa kering lagi (jalan normal), jadi jembatan = jalur cepat lewat air.
// - rocks: batu keras, tetap menghalangi total (nabrak dan mentok) seperti
//   rintangan sebelumnya.
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
  PIECES,
  POOL_SIZE,
  PASAL_ZONES,
  PASAL_QUESTIONS,
  PASAL_COUNT,
  PILAH_ZONES,
  PILAH_CARDS,
  PILAH_COUNT,
  SIDANG_QUESTIONS,
  SIDANG_COUNT,
  MAP_PRESETS,
};
