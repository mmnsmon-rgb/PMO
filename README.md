# Project Tracker (PMO)

Web App ติดตามงานของทีม แทนการส่งไฟล์ Excel ทาง LINE
SvelteKit (SSR) + Tailwind + shadcn-svelte + Drizzle ORM + SQLite (ย้ายไป Cloudflare D1 ได้ภายหลัง)

## เริ่มใช้งานบนเครื่อง

```bash
npm install
npm run db:push     # สร้างตารางใน local.db
npm run db:seed     # นำเข้าข้อมูลจาก data/project_tracking_sample.xlsx
npm run dev         # http://localhost:5173
```

`npm run db:seed` ล้างข้อมูลเดิมแล้วนำเข้าใหม่จาก Excel ทุกครั้ง (ใช้ไฟล์อื่นได้: `node scripts/seed.ts path/to/file.xlsx`)

### บัญชีทดสอบ (สำหรับ local เท่านั้น)

ทุกบัญชีใช้รหัสผ่าน `pmo1234` (ตั้งไว้ใน `scripts/seed.ts`)

| บัญชี | สิทธิ์ |
|---|---|
| `admin@example.com` | Admin (บัญชีระบบ) |
| `vipa@example.com` | Admin (หัวหน้าทีม) |
| อีเมลอื่นในชีต "ทีมงาน" เช่น `napa@example.com` | พนักงาน |

## การนำเข้าจาก Excel

| ชีต | นำเข้าเป็น |
|---|---|
| ภาพรวม | ไม่นำเข้า (เป็นสูตรสรุป) — ระบบคำนวณใหม่ในหน้า Dashboard |
| ทีมงาน | `users` (ชื่อ ตำแหน่ง หน้าที่ อีเมล วันเริ่มงาน ระดับ) |
| งานทั้งหมด | `projects` (จากคอลัมน์ "ลูกค้า / โครงการ") + `tasks` |

สถานะใน Excel → สถานะในระบบ: ยังไม่เริ่ม→To do, กำลังดำเนินการ→Doing, รอตรวจ→Doing, ระงับ→To do, เสร็จแล้ว→Done
(รอตรวจ / ระงับ ถูกเติม `[รอตรวจ]` / `[ระงับ]` ไว้ในหมายเหตุ) — คอลัมน์ "วันคงเหลือ" และ "สถานะเวลา" คำนวณสดตามวันที่ปัจจุบัน

## สิทธิ์การใช้งาน

- **Admin**: Dashboard, จัดการพนักงาน, สร้าง/แก้/ลบ โปรเจกต์และงาน, ดูประวัติทุกคน
- **พนักงาน**: เห็นทุกงาน แต่อัปเดตได้เฉพาะงานตัวเอง (สถานะ, % ความคืบหน้า, ชม.จริง, หมายเหตุ), ดูประวัติของตัวเอง
- ทุกการแก้ไขบันทึกลง `activity_logs` แบบ field-level (ค่าเดิม → ค่าใหม่) และกด "ย้อนกลับ" ได้
- พนักงานที่มีประวัติการแก้ไขแล้วลบไม่ได้ (ให้ปิดใช้งานบัญชีแทน) เพื่อไม่ให้ประวัติหาย

## โครงสร้างโปรเจกต์

```
scripts/seed.ts             นำเข้า Excel → DB
data/                       ไฟล์ Excel ต้นฉบับ
src/hooks.server.ts         ตรวจ session ทุก request, บังคับ login
src/lib/server/
  db/schema.ts              ตาราง users, sessions, projects, tasks, activity_logs
  db/index.ts               การเชื่อมต่อ DB (จุดเดียวที่ต้องแก้ตอนย้ายไป D1)
  auth.ts, password.ts      session cookie + PBKDF2 (Web Crypto — รันบน Workers ได้)
  tasks.ts                  query/แก้ไขงาน + ตรวจสิทธิ์ + log + revert
  activity.ts               บันทึกและแสดงประวัติ
src/routes/
  login, logout
  dashboard/                รายงานรายคน รายโปรเจกต์ งานเลยกำหนด (Admin)
  my/                       งานของฉัน
  board/                    Kanban (ลากวางเปลี่ยนสถานะ)
  projects/, projects/[id]  รายการโปรเจกต์ / งานในโปรเจกต์
  tasks/new, tasks/[id]     สร้างงาน / แก้ไข + ประวัติ + ย้อนกลับ
  activity/                 Activity Log พร้อมตัวกรอง
  users/, users/[id]        จัดการพนักงาน (Admin)
```

## ย้ายไป Cloudflare D1 / Pages (ภายหลัง)

1. สร้าง D1: `npx wrangler d1 create pmo` แล้วเพิ่ม binding `DB` ใน `wrangler.toml`
2. `npm run db:generate` แล้ว `npx wrangler d1 migrations apply pmo --remote` (ใช้ไฟล์ใน `drizzle/`)
3. เปลี่ยน `src/lib/server/db/index.ts` เป็น `drizzle(platform.env.DB, { schema })` จาก `drizzle-orm/d1`
   และสร้าง db ต่อ request ใน `hooks.server.ts` (`event.locals.db`)
4. Adapter ตั้งเป็น `@sveltejs/adapter-cloudflare` ไว้แล้ว
