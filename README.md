# GeoDash — Web GIS Platform Self-Hosted

Platform Web GIS **self-hosted** yang berfungsi setara ArcGIS Online (map viewer, layer management, survey/form, dashboard, multi-organisasi) — **tanpa ketergantungan pada ArcGIS Online credits/subscription**.

Dokumentasi lengkap roadmap & spesifikasi: [`DOKUMENTASI_DJANGO_POSTGIS_WEBGIS.md`](../DOKUMENTASI_DJANGO_POSTGIS_WEBGIS.md)

---

## Fitur Utama

- 🗺️ Map viewer berbasis **MapLibre GL JS** (basemap, layer rendering, popup, sym/visualisasi)
- 🏢 **Multi-tenant** — banyak organisasi/company dalam satu sistem dengan isolasi data (`organization_id`)
- 👑 Dua level admin: **System Administrator** (platform-wide) dan **Company Admin** (scope organisasi)
- 📦 Layer & feature disimpan sebagai **native PostGIS geometry** (query spasial: `ST_Intersects`, `ST_DWithin`, dll.)
- ⬆️ **Add Data** — upload `.zip` (SHP/FileGDB), `.gpkg`, `.csv`, `.xlsx` → analisis layer/CRS/field → publish via pipeline Celery ke PostGIS → redirect ke **Item Detail** (mirip "Add Data" ArcGIS Online)
- 📄 **Content & Item** — item `feature_layer` & `web_map` (hosted), halaman Item Detail 3 tab (**Overview** mini map + sidebar simbologi/label/filter + data table 2-way sync, **Data** field & domain, **Settings** sharing + delete protection), aksi **Add to New/Existing Web Map** (DATA-011 s.d. DATA-016)
- 📋 Modul: User/Role/Permission, Organization, Project, Layer, Feature, Form/Survey, Dashboard, Audit Log
- 🔒 Auth JWT/session + permission dicek di level API (DRF permission classes)
- 🎨 Frontend responsive (desktop/tablet/mobile) dengan dark/light theme (design token)

## Tech Stack

```text
Backend        Django · DRF · GeoDjango · PostgreSQL/PostGIS · Redis · Celery
Frontend       React · Vite · MapLibre GL JS
Infrastruktur  Docker Compose · Nginx · pgAdmin · Cloudflare Tunnel (opsional)
```

Tidak digunakan: ArcGIS Online, ArcGIS Credits, Hosted Feature Layer, ArcGIS subscription.

## Arsitektur

```text
                  INTERNET
                     │
              Cloudflare Tunnel (opsional)
                     │
                   Nginx
                     │
        ┌────────────┴────────────┐
        │                         │
  React (Web GIS, PWA)        Django (DRF + GeoDjango)
        │                         │
        └────────────┬────────────┘
                     │
                 PostGIS ── Redis ── Celery ── Storage
```

Development lokal: Windows 11 → WSL2 Ubuntu → Docker (nginx, api, postgis, pgadmin, redis, celery).

## Quickstart

### 1. Prasyarat

- Docker + Docker Compose
- Node.js (untuk frontend dev)

### 2. Setup Environment

```bash
cp .env.example .env
# lalu isi nilai secret (DJANGO_SECRET_KEY, POSTGRES_PASSWORD, PGADMIN_*)
```

> **Penting:** `.env` tidak ikut ter-commit (lihat `.gitignore`). Selalu salin dari `.env.example`.

### 3. Build & Jalankan

```bash
make build          # build image docker
make up             # start semua service: postgis, api, redis, celery, nginx, pgadmin
make migrate        # apply migrasi database
make init           # inisialisasi sistem (buat System Administrator pertama)
```

Service yang berjalan:

| Service | URL |
|---|---|
| Nginx (frontend + API) | `http://localhost` |
| Frontend dev (Vite) | `http://localhost:5173` |
| API (Django) | `http://localhost/api/` |
| pgAdmin | `http://localhost:5050` |
| Django Admin | `http://localhost/django-admin/` |

### 4. Perintah Penting (Makefile)

```bash
make up              # start semua service (build otomatis)
make down            # stop semua service
make logs            # tail log semua service
make backend-bash    # masuk ke shell container API
make frontend-dev    # Vite dev server (hot reload)
make frontend-build  # build produksi frontend
make clean-db        # stop + hapus database/PostGIS (down -v)
make clean-image     # hapus image docker + volume
make freeze          # export requirements.lock.txt
```

## Alur Inisialisasi Sistem (sekali di awal)

```text
docker compose up -d
   → make migrate
   → make init       (isi: Admin Name, Username, Email, Password)
   → SYSTEM_INITIALIZED = true
   → Login sebagai System Administrator
```

## Alur Menambah Organisasi

```text
Login System Administrator
   → Admin Console → Organizations → Create
   → Isi data organisasi + Company Admin pertama
   → Company Admin login → kelola user/project/layer miliknya sendiri
```

## Alur Add Data → Item Detail (Section 14 & 16)

```text
Halaman Content (menu "Content")
   → [+ New Item (Add Data)]
   → Modal satu layar ala "New Item" ArcGIS Online:
        drag & drop / browse .zip .gpkg .csv .xlsx (maks 200 MB)
        upload + analisis (ogr2ogr/ogrinfo via Celery) otomatis — spinner inline
        konfirmasi ringkas: geometri, EPSG, jumlah fitur, daftar field
        opsi judul, kolom Lon/Lat, project → panel "Advanced options…" (terlipat)
   → [Publish] → /upload-jobs/{id}/publish/ (status "processing")
   → job "success" → REDIRECT OTOMATIS ke halaman Item Detail (DATA-011)
```

Halaman Item Detail (`/items/{id}`) menampilkan 3 tab (DATA-012):

```text
Overview  · peta MapLibre full-width (tanpa sidebar) seperti ArcGIS Online
           · kontrol di pojok peta: basemap, Style (warna/label/filter), + Add Feature (draw), Zoom
           · data table per layer, sinkron 2 arah dengan peta (klik baris ↔ klik fitur)
Data      · kelola field & domain (tipe, panjang, default, wajib, coded value)
           · PUT /items/{id}/fields/ → tersimpan ke schema.database dataset
Settings  · Sharing: Private / Organization / Public
           · Delete Protection (harus ketik judul item untuk aktif) — item tak bisa dihapus
           · Zona Berbahaya: Hapus Item (blok bila proteksi aktif)
```

Dari Item Detail sebuah Feature Layer tersedia aksi Web Map (DATA-013/014/015/016):

```text
[ Add to New Web Map ]   → buat Web Map baru (nama + project), layer otomatis ditambahkan
[ Add to Existing Web Map ] → pilih Web Map tujuan
Satu Feature Layer (Hosted) dapat dipakai di banyak Web Map sekaligus
(jangan duplikasi data — Web Map hanya menyimpan referensi layer)
```

Konvensi penamaan item hasil upload (Section 16.1): `UP3_Tolitoli.gdb.zip` → `UP3_TOLITOLI_gdb`;
item berprefiks "(hosted)" menandakan data fisik dikelola sistem.

### Endpoint backend (apps/content)

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/v1/upload-jobs/` | Upload file (multipart) → buat ImportJob + enqueue analisis |
| GET | `/api/v1/upload-jobs/{id}/` | Status/polling: pending → analyzing → ready/failed |
| POST | `/api/v1/upload-jobs/{id}/publish/` | Publish layer pilihan ke PostGIS (Celery + ogr2ogr) |
| GET | `/api/v1/items/` | Daftar item (filter `item_type`, `sharing_level`, dll.) |
| GET/PATCH/DELETE | `/api/v1/items/{id}/` | Detail / update sharing&proteksi / hapus (guard delete protection) |
| PUT | `/api/v1/items/{id}/fields/` | Simpan skema field & domain |
| POST | `/api/v1/items/{id}/add_to_web_map/` | Tambah ke Web Map baru / existing |

Item dibuat otomatis lewat signal: `Dataset` post_save → item `feature_layer`; `Map` post_save → item `web_map`.

## Struktur Projek

```text
geodjango_gis/
├── Makefile                    # perintah shortcut (up/down/migrate/init/dll)
├── .env.example                # template environment (jangan pakai isi secret)
├── backend/                    # Django + DRF + GeoDjango
│   ├── apps/
│   │   ├── accounts/           # auth (JWT/session), organization/company, init_system
│   │   ├── projects/           # project, public map
│   │   ├── layers/             # layer & feature (PostGIS), tugas async (Celery)
│   │   ├── content/            # Item (feature_layer/web_map), pipeline Add Data (upload/analyze/publish)
│   │   ├── formsurvey/         # form builder & submission
│   │   ├── dashboard/          # dashboard & reporting
│   │   ├── rbac/               # role, permission, audit, middleware
│   │   └── sysadmin/           # health check, init service
│   ├── config/                 # settings django, urls, celery, wsgi
│   └── entrypoint.sh
├── frontend/                   # React + Vite + MapLibre
│   └── src/pages/              # Login, Dashboard, MapViewer, ContentPage, ItemDetail, AdminConsole, dll.
├── infra/
│   ├── docker-compose.yml      # semua service
│   ├── nginx/                  # reverse proxy
│   └── pgadmin/                # auto-register server PostGIS
├── storage/                    # data upload (foto/dokumen/ekspor) — tidak di-commit
└── DOKUMENTASI_*.md            # docs & roadmap (repo induk)
```

## Role & Kepemilikan Data

```text
SYSTEM
└── System Administrator      (root platform, lintas organisasi)

COMPANY / ORGANIZATION
├── Company Admin             (owner data, scope organisasi sendiri)
├── GIS Manager
├── Editor
├── Surveyor
└── Viewer
```

Permission matrix (konsep): `VIEW, CREATE, READ, UPDATE, DELETE, EXPORT, IMPORT, SHARE, PUBLISH, MANAGE, ADMIN`. System Administrator = `ALL = TRUE` di semua resource & organisasi.

## Roadmap

| Fase | Status | Isi |
|---|---|---|
| 0 | ✅ | Setup repo, Docker Compose, branch strategy |
| 1 | ✅ | Core backend, auth, RBAC, audit, `init-system` |
| 2 | ✅ | GIS core: Project/Map/Layer/Feature (PostGIS), REST API |
| 3 | ✅ | Frontend foundation, theme, map viewer, admin console |
| 4 | ✅ | Modul survey/form |
| 5 | ✅ | Dashboard & reporting |
| 6 | ✅ | Admin console (company, org-id, pgAdmin) |
| 7 | ✅ | Add Data pipeline (upload→analisis→publish PostGIS) + Content/Item Detail (Overview/Data/Settings) |
| 8 | ⏳ | Mobile app (Flutter) offline-first |
| 9 | ⏳ | PWA, hardening, optimasi (GiST index, rate limit) |
| 10 | ⏳ | Deployment, backup otomatis, monitoring |

## Catatan Biaya

Stack inti **gratis/open-source** (PostgreSQL, PostGIS, Django, React, MapLibre, Docker). Biaya opsional saat production: domain, VPS (jika skala besar), layanan tile/satelit non-OSM, storage tambahan. **Tidak ada biaya credit ArcGIS Online dalam skenario apa pun.**