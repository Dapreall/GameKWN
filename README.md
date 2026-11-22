# Jejak Identitas Nusantara

Game lomba antar tim (4 sampai 15 tim) tentang identitas nasional, berdasarkan Bab II buku Pendidikan Kewarganegaraan.

Semua pemain bermain dari HP masing-masing lewat browser. Layar proyektor dijalankan dari laptop.

---

## 1. Persiapan (sekali saja)

1. Install **Node.js** versi LTS dari https://nodejs.org (pilih tombol LTS, lalu install dengan pengaturan standar).
2. Ekstrak folder ini ke lokasi yang mudah diingat, misalnya `C:\Users\farel\Semester 7\KWN\Game KWN`.
3. Buka folder tersebut di File Explorer, klik kanan di area kosong, lalu pilih **Open in Terminal** (atau buka PowerShell lalu ketik `cd` diikuti lokasi folder).
4. Jalankan perintah ini satu kali untuk memasang dependensi:

```
npm install
```

---

## 2. Menjalankan game

Di folder yang sama, jalankan:

```
npm start
```

Biarkan jendela terminal tetap terbuka selama permainan. Di terminal akan muncul alamat seperti ini:

```
Layar proyektor (buka di laptop ini): http://localhost:3000/display
Alamat untuk HP (satu WiFi dengan laptop):
  http://192.168.1.25:3000
PIN host: 1234
```

- **Layar proyektor:** buka `http://localhost:3000/display` di browser laptop, lalu tampilkan layar ke proyektor.
- **HP pemain:** buka alamat "Alamat untuk HP" yang muncul di terminal (atau di panel kanan layar proyektor), lalu masukkan nama dan nama tim.

Kalau Windows bertanya tentang izin firewall, pilih **Allow access** agar HP bisa membuka game.

### Mengganti PIN host

PIN default adalah `1234`. Untuk mengganti, tutup terminal, lalu jalankan di PowerShell:

```
$env:HOST_PIN="pinbaru"
npm start
```

---

## 3. Mengendalikan permainan (host)

Semua kontrol ada di panel kanan layar proyektor.

1. Masukkan PIN host, lalu tekan **Buka**.
2. Tunggu tim masuk. Setiap HP masuk dengan nama tim. Tim yang namanya sama akan bergabung ke tim yang sama.
3. Tekan **Mulai** untuk memulai ronde 1.
4. **Lewati tahap** menghentikan ronde atau jeda saat ini dan langsung lanjut.
5. **Reset** menghapus semua tim dan skor, lalu kembali ke layar awal.

Ronde berganti otomatis. Ada jeda 8 detik di antara ronde.

---

## 4. Aturan permainan

### Ronde 1: Rakit Garuda (240 detik)
- Potongan lambang tersebar di peta dalam satu kumpulan yang diperebutkan semua tim.
- Karakter berdiri di dekat potongan untuk mengambilnya. Satu karakter hanya bisa membawa satu potongan.
- Bawa potongan ke pangkalan tim (lingkaran di sekitar titik start tim). Potongan langsung terpasang di papan rakit tim.
- Setiap potongan yang terpasang: **+10 poin**.
- Kalau slot potongan itu sudah terisi, potongan kembali ke peta dan tidak dapat poin.
- Potongan yang sudah terpasang muncul lagi di peta setelah beberapa detik.
- Potongan yang terpasang: 9 jenis (5 sila di perisai, pita, badan, kepala, dan sayap).

### Ronde 2: Kejar Pasal (180 detik)
- Pertanyaan muncul selama 15 detik. Ada 4 zona jawaban di peta: Bendera, Bahasa, Lambang, dan Lagu.
- Tim lari ke zona yang dianggap benar.
- Benar dan pertama: **+20 poin**. Benar tapi bukan yang pertama: **+10 poin**. Salah: **-5 poin**.
- Setiap tim hanya bisa menjawab satu kali per soal.

### Ronde 3: Pilah Identitas (180 detik)
- Kartu identitas muncul di layar selama 10 detik.
- Ada dua zona: **Identitas Pribadi** (kiri) dan **Identitas Nasional** (kanan).
- Tim pertama yang masuk zona menentukan hasilnya. Kalau benar: **+10 poin**. Kalau salah: **-5 poin**.
- Setelah satu kartu selesai, kartu berikutnya muncul.

### Ronde 4: Sidang Akhir (120 detik)
- Ada 2 pertanyaan. Tiap pertanyaan punya waktu voting 25 detik.
- Setiap tim memilih satu jawaban di HP. Hanya satu pilihan per tim.
- Jawaban dengan suara terbanyak menjadi jawaban terpilih.
- Tim pertama yang memilih jawaban terpilih: **+30 poin**. Tim lain yang memilih jawaban yang sama: **+10 poin**.

### Juara
- Tim dengan poin terbanyak di akhir permainan menjadi juara.
- Papan skor di layar proyektor selalu menampilkan urutan terkini.

---

## 5. Hal yang perlu diperhatikan

- **Satu WiFi:** HP dan laptop harus tersambung ke WiFi yang sama. Beberapa WiFi kampus memblokir perangkat saling terhubung. Kalau begitu, nyalakan **hotspot** dari HP atau laptop, lalu hubungkan semua HP ke hotspot tersebut.
- **Tes dulu:** sebelum hari H, jalankan game dan coba dari 2 sampai 3 HP. Pastikan joystick dan papan rakit berjalan.
- **Satu permainan per server:** server hanya menjalankan satu permainan. Gunakan tombol Reset untuk memulai ulang.
- **Pertanyaan:** soal, zona, dan kartu ada di file `data.js`. Edit di sana kalau mau mengganti isi.
- **Aturan poin:** angka poin ada di `server.js`. Bagian yang sering diubah: fungsi `makeRakit`, `makePasal`, `makePilah`, dan `makeSidang`.

---

## 6. Struktur folder

```
Game KWN/
  package.json      daftar dependensi dan perintah npm start
  server.js         logika permainan dan server
  data.js           soal, zona, kartu, dan potongan lambang
  README.md         panduan ini
  public/
    player.html     halaman untuk HP pemain
    player.js       perilaku halaman HP (joystick, papan rakit, voting)
    display.html    halaman layar proyektor
    display.js      gambar peta dan panel kontrol host
    style.css       tampilan kedua halaman
```
