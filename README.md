# Kode Wilayah

Pencarian wilayah administratif Indonesia (kode Kemendagri): provinsi → kabupaten/kota →
kecamatan → kelurahan/desa. Statis penuh — tanpa backend, jalan di GitHub Pages.

## Pakai lokal

```bash
docker compose up -d      # http://localhost:8765 (Tailscale) atau IP host:8765
docker compose down
```

## Data

Snapshot Kemendagri dari `https://api.kodewilayah.web.id`, disimpan sebagai JSON per wilayah:

```
api/provinces.json              38 provinsi
api/regencies/{kode-provinsi}.json
api/districts/{kode-kab}.json
api/villages/{kode-kec}.json
api/search.txt                  indeks kode<TAB>nama semua level
api/version.json                tanggal snapshot (versi cache service worker)
```

Semua file itu sekaligus API publik statis, mis.
`https://<user>.github.io/<repo>/api/districts/1101.json`.
Bentuk respons sama dengan API sumber: `{ success, message, data: [{ code, name }] }`.

Perbarui data:

```bash
node tools/generate.mjs          # ambil ulang seluruh pohon (±15 ribu request)
node tools/generate.mjs --check   # bandingkan jumlah per level
```

Generator menahan `search.txt`/`version.json` bila ada request gagal, dan tidak menimpa file
yang gagal diambil. Jalankan ulang untuk melengkapi.

## Test

```bash
node --test tools/
```

## Deploy

Push ke `main` → `.github/workflows/pages.yml` mengunggah repo ke GitHub Pages.
Aktifkan dulu Settings → Pages → Source: GitHub Actions. Semua path relatif, jadi aman di
subpath `/<repo>/`.

## Teknis

- htmx 4.0.1 di-vendor (`vendor/htmx.min.js`); ekstensi `json-html` di `app.js` mengubah
  respons JSON menjadi tombol sebelum swap.
- Service worker: cache-first `api/**`, cek `api/version.json` tiap navigasi untuk invalidasi.
