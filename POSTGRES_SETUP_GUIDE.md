# Panduan PostgreSQL, Prisma Migration, Seed & Koneksi DBeaver

> **Status Database Saat Ini**:
> Database **Neon PostgreSQL** Anda sudah **BERHASIL TERHUBUNG & TER-MIGRASI**!
> Seluruh tabel (12 tabel) dan data awal (Master Module `AUTH`, `TRX`, & Fitur) sudah otomatis dibuat dan di-seed.

---

## ⚡ Detail Koneksi DBeaver Siap Pakai

Berikut adalah detail koneksi yang bisa langsung Anda masukkan ke **DBeaver**:

| Pengaturan | Nilai / Value |
| :--- | :--- |
| **Database Driver** | **PostgreSQL** |
| **Host** | `ep-rapid-art-b5bwr1ur-pooler.c-7.us-east-2.aws.neon.tech` |
| **Port** | `5432` |
| **Database** | `neondb` |
| **Username** | `neondb_owner` |
| **Password** | `npg_CrqP2daN3zYO` |
| **SSL Mode** | Centang **Use SSL**, pilih `require` |

### Atau Menggunakan JDBC URL Langsung di DBeaver:
```
jdbc:postgresql://ep-rapid-art-b5bwr1ur-pooler.c-7.us-east-2.aws.neon.tech:5432/neondb?sslmode=require
```

---

## 1. Langkah-langkah Membuka di DBeaver


Pilih salah satu penyedia Cloud PostgreSQL gratis/populer berikut:

### Opsi A: Supabase (Sangat Direkomendasikan)
1. Buka [https://supabase.com](https://supabase.com) dan buat project baru.
2. Masuk ke menu **Project Settings** $\rightarrow$ **Database**.
3. Di bagian **Connection string**, pilih tab **URI** atau **Node.js** (mode *Transaction/Session* atau port `5432`/`6543`).
4. Contoh format:
   ```env
   DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
   ```

### Opsi B: Neon Tech
1. Buka [https://neon.tech](https://neon.tech) dan buat database baru.
2. Salin connection string yang disediakan di dashboard.
3. Contoh format:
   ```env
   DATABASE_URL="postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require"
   ```

### Opsi C: Railway
1. Buat project baru di [https://railway.app](https://railway.app) $\rightarrow$ **New** $\rightarrow$ **Database** $\rightarrow$ **PostgreSQL**.
2. Masuk ke tab **Variables** $\rightarrow$ salin `DATABASE_URL`.

---

## 2. Masukkan ke `.env.local`

Buka file `.env.local` di root project, lalu tambahkan / isi connection string Anda:

```bash
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"
```

---

## 3. Menjalankan Migration & Push Schema

Setelah `DATABASE_URL` terisi, jalankan salah satu perintah berikut:

### Cara 1: Push Schema Langsung (Paling Cepat & Praktis)
```bash
npm run db:push
```
Perintah ini akan langsung membuat seluruh tabel di PostgreSQL sesuai dengan `prisma/schema.prisma`.

### Cara 2: Menggunakan Prisma Migrate (Tracking Histori Migrasi)
```bash
npm run db:migrate
```

---

## 4. Menjalankan Database Seed

Untuk mengisi data awal (Master Module `AUTH`, `TRX`, Master Feature, dan sequence counter):

```bash
npm run db:seed
```

Hasil seed:
- Module: `AUTH` (*Authentication & Authorization*), `TRX` (*Transaction & Payments*)
- Feature: *Login & Registrasi*, *Reset Password*, *Payment Gateway*
- Sequence: Counter ID awal untuk test cases (`AUTH-001`, `TRX-001`)

---

## 5. Migrasi Data dari SQLite Lama ke PostgreSQL (Opsional)

Jika Anda sudah memiliki data lama di SQLite (`data/qa-manager.db`) dan ingin memindahkannya ke PostgreSQL Cloud:

```bash
node scripts/migrate-to-postgres.mjs
```

Script ini akan membaca semua tabel di SQLite dan memindahkannya secara otomatis ke PostgreSQL tanpa kehilangan relasi data.

---

## 6. Panduan Menghubungkan ke DBeaver

Untuk mengelola dan melihat database PostgreSQL langsung dari **DBeaver**:

### Langkah-langkah di DBeaver:
1. Buka aplikasi **DBeaver**.
2. Klik menu **Database** $\rightarrow$ **New Database Connection** (atau klik ikon colokan kabel/tambah koneksi di kiri atas).
3. Pilih driver **PostgreSQL** $\rightarrow$ klik **Next**.
4. Di tab **Main Settings**, Anda dapat memilih salah satu dari 2 cara input:

#### Cara A: Menggunakan Connection URL (Paling Mudah)
- Ganti tab atau pilihan input dari **Host** ke **URL**.
- Tempel connection string Anda:
  ```
  jdbc:postgresql://host:port/database?sslmode=require
  ```
  *(Catatan: ganti awalan `postgresql://` menjadi `jdbc:postgresql://` jika menggunakan mode URL DBeaver)*

#### Cara B: Menggunakan Parameter Terpisah (Host, Port, User, Password)
- **Host**: Contoh `aws-0-ap-southeast-1.pooler.supabase.com` atau endpoint Neon Anda.
- **Port**: `5432` (atau `6543` jika menggunakan Supabase Pooler).
- **Database**: `postgres` (atau nama DB Anda).
- **Authentication**: `Database Native`.
- **Username**: Contoh `postgres` atau `postgres.[project-ref]`.
- **Password**: Password database Anda.
- Masuk ke tab **SSL** $\rightarrow$ centang **Use SSL** $\rightarrow$ pilih SSL mode `require` (diperlukan untuk Supabase/Neon).

5. Klik tombol **Test Connection** di kiri bawah:
   - Jika DBeaver meminta download driver PostgreSQL, klik **Download** (otomatis).
   - Pastikan muncul notifikasi hijau `Connected`.
6. Klik **Finish**.
7. Sekarang di panel Database Navigator sebelah kiri, Anda bisa membuka:
   `Databases` $\rightarrow$ `postgres` $\rightarrow$ `Schemas` $\rightarrow$ `public` $\rightarrow$ `Tables`
   dan melihat semua tabel QA Studio:
   - `modules`
   - `features`
   - `requirements`
   - `requirement_history`
   - `test_cases`
   - `executions`
   - `tc_sequence`
   - `change_log`
   - `weekly_snapshots`
   - `activity_log`
   - `ai_drafts`
   - `test_case_comments`

---

## 7. Prisma Studio (GUI Alternatif di Browser)

Selain DBeaver, Anda juga bisa membuka Prisma Studio bawaan untuk melihat dan mengedit data langsung di browser:

```bash
npm run db:studio
```
Buka browser di `http://localhost:5555`.
