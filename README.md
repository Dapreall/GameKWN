# Jejak Wawasan Nusantara

Game lomba antar tim (4 sampai 15 tim) tentang **Wawasan Nusantara** — cara pandang bangsa Indonesia terhadap diri dan lingkungannya sebagai satu kesatuan wilayah dan bangsa, berdasarkan Deklarasi Djuanda 1957 dan Pasal 25A UUD NRI 1945.

Semua pemain bermain dari HP masing-masing lewat browser. Layar proyektor dijalankan dari laptop.

---

## 1. Persiapan (sekali saja)

1. Install **Node.js** versi LTS dari https://nodejs.org (pilih tombol LTS).
2. Ekstrak folder ini ke lokasi yang mudah diingat.
3. Buka folder tersebut di terminal, lalu:

```
npm install
```

---

## 2. Menjalankan game

```
npm start
```

Terminal akan menampilkan alamat seperti:

```
Layar proyektor (buka di laptop ini): http://localhost:3000/display
Alamat untuk HP (satu WiFi dengan laptop):
  http://192.168.1.25:3000
PIN host: 1234
```

- **Layar proyektor:** buka `/display` di laptop, tampilkan ke proyektor.
- **HP pemain:** buka alamat "Alamat untuk HP", masukkan nama dan nama tim. **Putar HP ke landscape** untuk kontrol seperti gameboy (analog kiri, tombol aksi kanan).

---

## 3. Mengendalikan permainan (host)

Panel kontrol di kanan layar proyektor:

1. Masukkan PIN host, tekan **Buka**.
2. Tim-tim masuk otomatis saat HP terhubung.
3. **Mulai** → memulai ronde 1.
4. **Lewati tahap** → langsung lanjut ke ronde/jeda berikutnya.
5. **Reset** → menghapus semua tim dan skor.

---

## 4. Aturan permainan (3 Ronde)

### Ronde 1: Rakit Nusantara (240 detik)

- 9 potongan "Peta Wawasan Nusantara" tersebar: **5 pulau besar** (Sumatera, Jawa, Kalimantan, Sulawesi, Papua) + **4 simbol** (Bendera, Pancasila, UUD 1945, Garuda).
- Dekati potongan → tekan **Ambil**. Salah ambil? Tekan **Buang** untuk meletakkan kembali.
- Bawa potongan ke pangkalan tim (lingkaran titik-titik di sekitar titik start tim).
- Setiap jenis potongan yang terpasang pertama kali: **+10 poin**. Potongan duplikat dikembalikan ke peta.

### Ronde 2: Jelajah Wawasan (260 detik)

- Soal muncul (sampai 20 detik per soal). 4 zona jawaban: **Politik, Ekonomi, Sosial Budaya, Hankam** (aspek Pancagatra).
- Lari ke zona yang kamu rasa benar → tekan **Kunci**. Setelah lock, tim **tidak bisa gerak** sampai tekan **Batal**.
- Setelah **semua tim** mengunci (atau waktu habis), tunggu 3 detik lalu jawaban benar ditampilkan besar di layar proyektor dalam popup.
- Benar pertama: **+20 poin**. Benar berikutnya: **+10**. Salah: **-5**. Tidak menjawab: 0.
- **Peta juga tampil di HP pemain**, jadi tiap tim bisa jawab independen tanpa melihat proyektor.

### Ronde 3: Pilah Astagatra (180 detik)

- Kartu pernyataan muncul (12 detik). 2 zona: **Trigatra** (aspek alamiah: geografi, demografi, SKA) dan **Pancagatra** (aspek sosial: ideologi, politik, ekonomi, sosbud, hankam).
- Masuk ke zona kategori yang tepat → tekan **Kunci**. Ada tombol **Batal** kalau mau pindah.
- Semua tim lock atau waktu habis → tunggu 3 detik → jawaban benar muncul di popup.
- Benar: **+10 poin**. Salah: **-5**.

### Juara

- Tim dengan poin terbanyak di akhir permainan menjadi juara.

---

## 5. Fitur Mobile Landscape

Putar HP ke landscape saat main untuk pengalaman seperti konsol:

- **Kiri:** d-pad analog
- **Kanan:** tombol Ambil/Buang (ronde 1) atau Kunci/Batal (ronde 2 & 3)
- Peta mini tampil di tengah layar

---

## 6. Catatan teknis

- **Satu WiFi:** HP dan laptop harus tersambung ke WiFi yang sama. Kalau WiFi kampus memblokir perangkat saling terhubung, nyalakan **hotspot** dari HP/laptop.
- **Test dulu:** sebelum hari H, coba dari 2-3 HP.
- **Edit soal:** semua konten ada di `data.js`.
- **Edit aturan poin:** ada di `server.js` (fungsi `makeRakit`, `makePasal`, `makePilah`).

---

## 7. Struktur folder

```
Game KWN/
  package.json      daftar dependensi dan perintah npm start
  server.js         logika permainan dan server
  data.js           soal, zona, kartu, dan potongan
  README.md         panduan ini
  public/
    player.html     halaman untuk HP pemain
    player.js       perilaku HP (joystick, mini map, tombol aksi)
    display.html    halaman layar proyektor
    display.js      peta besar + popup reveal + panel host
    pixelart.js     ikon piksel: pulau, simbol, karakter, peta
    style.css       tampilan portrait & landscape, animasi popup
```

---

## Materi sumber

- Pasal 25A UUD NRI 1945 (konsep Negara Kepulauan)
- Deklarasi Djuanda, 13 Desember 1957
- UNCLOS 1982 (pengakuan Archipelago State)
- Modul PKn Dikti (Bab Wawasan Nusantara, Astagatra = Trigatra + Pancagatra)
