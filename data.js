"use strict";

const PIECES = [
  {
    id: "sumatera",
    label: "P. Sumatera",
    color: "#38a169",
    info: "Pulau terbesar di bagian barat Indonesia.",
  },
  {
    id: "jawa",
    label: "P. Jawa",
    color: "#d69e2e",
    info: "Pulau terpadat, pusat pemerintahan Indonesia.",
  },
  {
    id: "kalimantan",
    label: "P. Kalimantan",
    color: "#dd6b20",
    info: "Pulau terbesar di Indonesia.",
  },
  {
    id: "sulawesi",
    label: "P. Sulawesi",
    color: "#805ad5",
    info: "Pulau berbentuk huruf K di tengah Nusantara.",
  },
  {
    id: "papua",
    label: "P. Papua",
    color: "#3182ce",
    info: "Pulau paling timur Indonesia.",
  },
  {
    id: "bendera",
    label: "Merah Putih",
    color: "#e53e3e",
    info: "Bendera Negara Kesatuan Republik Indonesia.",
  },
  {
    id: "pancasila",
    label: "Pancasila",
    color: "#f6e05e",
    info: "Dasar ideologi Wawasan Nusantara.",
  },
  {
    id: "uud",
    label: "UUD 1945",
    color: "#ecc94b",
    info: "Landasan konstitusional (Pasal 25A: Negara Kepulauan).",
  },
  {
    id: "garuda",
    label: "Garuda",
    color: "#f6ad55",
    info: "Lambang persatuan bangsa Indonesia.",
  },
];

const POOL_SIZE = 14;


const PASAL_ZONES = [
  { code: "E", label: "Ideologi",      x: 600, y: 200, r: 90, color: "#a855f7" }, // ungu terang (TOP)
  { code: "A", label: "Politik",       x: 790, y: 320, r: 90, color: "#ff3860" }, // merah muda (kanan atas)
  { code: "B", label: "Ekonomi",       x: 735, y: 590, r: 90, color: "#ff7f11" }, // oranye neon (kanan bawah)
  { code: "C", label: "Sosial Budaya", x: 465, y: 590, r: 90, color: "#d946ef" }, // magenta (kiri bawah)
  { code: "D", label: "Hankam",        x: 410, y: 320, r: 90, color: "#06aed5" }, // cyan (kiri atas)
];

const PASAL_QUESTIONS = [
  {
    text: "Pemilihan Umum dan sistem pemerintahan presidensial merupakan perwujudan Wawasan Nusantara di aspek?",
    answer: "A",
  },
  {
    text: "Perdagangan antarpulau, APBN, dan hilirisasi nikel termasuk perwujudan Wawasan Nusantara di aspek?",
    answer: "B",
  },
  {
    text: "Pelestarian bahasa daerah dan kesenian tradisional antar provinsi termasuk aspek?",
    answer: "C",
  },
  {
    text: "Patroli TNI AL menjaga kedaulatan di Laut Natuna Utara masuk aspek?",
    answer: "D",
  },
  {
    text: "Pengakuan Bahasa Indonesia sebagai bahasa persatuan termasuk aspek?",
    answer: "C",
  },
  {
    text: "Pancasila sebagai satu-satunya ideologi negara mencerminkan kesatuan aspek?",
    answer: "E",
  },
  {
    text: "Program Tol Laut untuk pemerataan harga antarpulau adalah perwujudan aspek?",
    answer: "B",
  },
  {
    text: "Wajib bela negara dan Komcad (Komponen Cadangan) termasuk aspek?",
    answer: "D",
  },
  {
    text: "Festival budaya Papua dan pengakuan masyarakat adat termasuk aspek?",
    answer: "C",
  },
  {
    text: "Diplomasi bebas aktif Indonesia di PBB dan ASEAN termasuk aspek?",
    answer: "A",
  },
  {
    text: "Satu kesatuan ekonomi di seluruh Nusantara menuntut pemerataan di aspek?",
    answer: "B",
  },
  {
    text: "Pos pengamanan perbatasan di Pulau Miangas dan Rondo adalah bentuk aspek?",
    answer: "D",
  },
  {
    text: "Nilai-nilai Pancasila sebagai sumber dari segala sumber hukum di Indonesia mencerminkan aspek?",
    answer: "E",
  },
  {
    text: "Penangkalan paham radikalisme dan upaya mempertahankan Pancasila dari ideologi asing termasuk aspek?",
    answer: "E",
  },
  {
    text: "Pengamalan sila Ketuhanan Yang Maha Esa dan toleransi antarumat beragama di seluruh Nusantara termasuk aspek?",
    answer: "E",
  },
  {
    text: "Pendidikan karakter berbasis nilai Pancasila di sekolah-sekolah adalah penguatan aspek?",
    answer: "E",
  },
];
const PASAL_COUNT = 10;


const PILAH_ZONES = [
  {
    code: "trigatra",
    label: "Trigatra",
    x: 405,
    y: 400,
    r: 115,
    color: "#22c1c3",
  }, // teal terang
  {
    code: "pancagatra",
    label: "Pancagatra",
    x: 795,
    y: 400,
    r: 115,
    color: "#ff4081",
  }, // pink terang
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
