# Project Tracker (PMO)

Web App ติดตามงานของทีม แทนการส่งไฟล์ Excel ทาง LINE
SvelteKit (SSR) + Tailwind + shadcn-svelte + Drizzle ORM + SQLite (ย้ายไป Cloudflare D1 ได้ภายหลัง)

## เริ่มใช้งานบนเครื่อง

ฐานข้อมูลในเครื่องเป็น D1 จำลอง (เก็บใน `.wrangler/state`) ผ่าน wrangler

```bash
npm install
npm run db:migrate  # สร้างตารางใน D1 ในเครื่อง
npm run db:seed     # นำเข้าข้อมูลจาก data/project_tracking_sample.xlsx
npm run dev         # http://localhost:5173
```

`npm run db:seed` ล้างข้อมูลเดิมแล้วนำเข้าใหม่จาก Excel ทุกครั้ง (สคริปต์สร้างไฟล์ `seed.sql` แล้วรันด้วย wrangler)

### บัญชีทดสอบ (สำหรับ local เท่านั้น)

ทุกบัญชีในเครื่องใช้รหัสผ่านเดียวกับเว็บจริง (บรรทัดที่ 2 ของไฟล์ `.seed-credentials.txt` ซึ่งไม่ขึ้น git) — ถ้าไม่มีไฟล์นี้ `npm run db:seed` จะสุ่มรหัสใหม่และแสดงให้ดู

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

### ไฟล์เงินสดรายวัน (`data/dsv/เงินสด DSV <วันที่>.xlsx`)

วางไฟล์ไว้ใน `data/dsv/` (ไม่ขึ้น git เพราะมีชื่อและเลขบัญชีจริง) แล้วรัน `npm run db:seed`

| ส่วนของไฟล์ | ความหมาย | นำเข้าเป็น |
|---|---|---|
| ชีต "DSV รายวัน" แถว 2 (T–Z, "ไม่ต้องกรอก") | อัตรา: ค่าแรง 500, ค่าเดินทาง, ค่าอาหาร, OT 1/1.5/3 (= 500÷8×เท่า), กะดึก 50 | อัตราของ `timesheets` |
| F4 | วันที่ทำงาน | `timesheets.work_date` |
| แถว 6+ คอลัมน์ B–E | ธนาคาร, เลขบัญชี, ชื่อ, หน่วยงาน (เช่น DSV กม.39) | `workers` (1 คน = 1 เลขบัญชี) |
| F | กะ: D เช้า, N ดึก, H ครึ่งวัน | `timesheet_entries.shift` |
| L / N / P | ชม. OT 1.0 / 1.5 / 3.0 | `ot1_hours` / `ot15_hours` / `ot3_hours` |
| R, AB, AD | Incentive, มาสาย (นาที), หักอื่นๆ | `incentive`, `late_minutes`, `deduction` |
| G–K, M–Q, S–AE | สูตรคำนวณ | ไม่นำเข้า — คำนวณใหม่ด้วย `calcPay()` (ตรวจแล้วตรงกับ Excel ทุกแถว) |
| ชีต "SCB" / "Other" | คนเดียวกันแยกตามธนาคารเพื่อโอน | ไม่นำเข้า — สร้างใหม่ในหน้า "สรุปทำจ่าย" |
| ชีต "Bank" | รายชื่อธนาคาร | `BANKS` ใน `src/lib/payroll.ts` |

1 ไฟล์ที่มีหลายหน่วยงาน (เช่น 9 ต.ค.) ถูกแยกเป็น 1 ใบงานต่อหน่วยงาน · ใบงานวันล่าสุดนำเข้าเป็น "รอตรวจ" ที่เหลือ "อนุมัติแล้ว"
บัญชีผู้คีย์ตัวอย่าง: `somsak@example.com` (DSV กม.39), `malee@example.com` (DSV กม.19)

### ค่าแรงรายวัน — ขั้นตอนการทำงาน

1. **ผู้คีย์ (พนักงาน)** สร้างใบงาน (วันที่ + หน่วยงาน) → เพิ่มชื่อ / "ดึงรายชื่อ" จากใบล่าสุด → กรอกกะ, OT, มาสาย → ระบบคำนวณยอดทันที → **ส่งตรวจ**
2. **Admin** ตรวจ → **อนุมัติ** หรือ **ตีกลับให้แก้** (ใบที่อนุมัติแล้วแก้ไม่ได้จนกว่าจะปลดล็อก)
3. **Admin** หน้า "สรุปทำจ่าย": สรุปรายวัน / รายเดือน / ตามหน่วยงาน / ตามผู้คีย์ + รายการโอนต่อคน → ดาวน์โหลด **ไฟล์ทำจ่าย .xlsx ไฟล์เดียว** (ชีต SCB, Other, รายวัน, สรุปรายวัน)
- ระบบเตือนวันที่ไม่มีใบงาน และลูกจ้างที่ถูกคีย์ซ้ำในวันเดียวกัน (กันจ่ายซ้ำ)
- ใบงานเก็บสำเนาธนาคาร/เลขบัญชี ณ วันที่คีย์ — แก้เลขบัญชีภายหลังไม่กระทบยอดที่จ่ายไปแล้ว
- พนักงานเห็นเฉพาะใบงานของตัวเอง และเห็นเลขบัญชีแบบปิดบัง (••••1234)

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
  timesheets/, [id]         ใบงานค่าแรงรายวัน (แทนไฟล์ Excel ทาง LINE) + อนุมัติ
  workers/                  ทะเบียนลูกจ้างรายวัน + บัญชีธนาคาร
  payroll/, payroll/export  สรุปรายวัน/รายเดือน + ไฟล์ทำจ่าย .xlsx (Admin)
src/lib/payroll.ts          สูตรคำนวณค่าแรง (ใช้ร่วมกันทั้งหน้าเว็บและ server)
src/lib/server/xlsx.ts      สร้างไฟล์ .xlsx โดยไม่ต้องใช้ library (รันบน Workers ได้)
```

## Deploy (Cloudflare Workers + D1)

- Worker: `pmo` · D1: `pmo-db` (binding `DB`) ตั้งค่าอยู่ใน `wrangler.jsonc`
- Deploy: `npm run deploy` (build แล้ว `wrangler deploy` ต้อง `npx wrangler login` ก่อน)
- แก้ schema: แก้ `src/lib/server/db/schema.ts` → `npm run db:generate` → `npm run db:migrate` (ในเครื่อง) และ `npm run db:migrate:remote` (production)
- นำเข้า Excel ขึ้น production ใหม่ (**ข้อมูลบนเว็บจริงจะถูกล้างทั้งหมด**):
  `node scripts/seed.ts --out seed-remote.sql` แล้ว `npx wrangler d1 execute pmo-db --remote --file seed-remote.sql`
