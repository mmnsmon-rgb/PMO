// Shared (client + server) daily-wage pay calculation. Mirrors the formulas in
// the "DSV รายวัน" sheet of the old Excel files so totals match to the satang.

export type Shift = 'D' | 'N' | 'H';

export const SHIFT_LABEL: Record<Shift, string> = { D: 'กะเช้า (D)', N: 'กะดึก (N)', H: 'ครึ่งวัน (H)' };
export const SHEET_STATUS_LABEL = { draft: 'ร่าง', submitted: 'รอตรวจ', approved: 'อนุมัติแล้ว' } as const;
export type SheetStatusKey = keyof typeof SHEET_STATUS_LABEL;

/** Row 2 of the Excel sheet ("ไม่ต้องกรอก"); OT rates were 500/8 × 1, 1.5, 3. */
export const DEFAULT_RATES = { dailyWage: 500, travelAllowance: 0, mealAllowance: 0, nightAllowance: 50 };
export type Rates = typeof DEFAULT_RATES;

/** Banks from the "Bank" sheet. SCB is paid in its own batch ("SCB" sheet), the rest in "Other". */
export const BANKS = [
	'ไทยพาณิชย์',
	'กรุงเทพ',
	'กสิกรไทย',
	'กรุงไทย',
	'ทหารไทยธนชาต จำกัด (มหาชน)',
	'ซิตี้แบงค์',
	'ซีไอเอ็มบี',
	'ยูโอบี',
	'กรุงศรีอยุธยา',
	'ออมสิน',
	'เพื่อการเกษตรและสหกรณ์',
	'เกียรตินาคิน',
	'อิสลามแห่งประเทศไทย',
	'แลนด์แอนด์เฮ้าส์'
];
export const isSCB = (bank: string) => bank.trim() === 'ไทยพาณิชย์';

export type PayInput = {
	shift: Shift;
	ot1Hours: number;
	ot15Hours: number;
	ot3Hours: number;
	incentive: number;
	lateMinutes: number;
	deduction: number;
};

/** Excel ROUNDDOWN(x, 2); the epsilon absorbs float noise like 784.3749999. */
export const floor2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

export function calcPay(e: PayInput, r: Rates) {
	const fullDay = e.shift === 'D' || e.shift === 'N' ? 1 : 0;
	const days = fullDay + (e.shift === 'H' ? 0.5 : 0);
	const hourly = r.dailyWage / 8;
	const wage = days * r.dailyWage;
	const allowance = fullDay * (r.travelAllowance + r.mealAllowance) + (e.shift === 'N' ? r.nightAllowance : 0);
	const ot = hourly * (e.ot1Hours + e.ot15Hours * 1.5 + e.ot3Hours * 3);
	const late = (hourly / 60) * e.lateMinutes;
	return {
		days,
		wage,
		allowance,
		ot,
		late,
		total: floor2(wage + allowance + ot + e.incentive - late - e.deduction)
	};
}

export const otHours = (e: Pick<PayInput, 'ot1Hours' | 'ot15Hours' | 'ot3Hours'>) => e.ot1Hours + e.ot15Hours + e.ot3Hours;

const baht = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtBaht = (n: number) => baht.format(n);
const num = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
export const fmtNum = (n: number) => num.format(n);

/** Strip zero-width spaces (common in names pasted from LINE) and collapse whitespace. */
export const cleanName = (s: string) => s.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
export const cleanAccount = (s: string) => s.replace(/\D/g, '');

export type WorkerRow = { line: number; name: string; bank: string; accountNo: string; department: string | null; active?: boolean };

/**
 * Find the header row (within the first 15 rows) by its column titles and read workers below it.
 * Accepts the /workers export and the old "เงินสด DSV" daily files (header on row 3).
 */
export function parseWorkerTable(grid: string[][]): { error: string } | { rows: WorkerRow[] } {
	const find = (cells: string[], re: RegExp) => cells.findIndex((c) => re.test(c.replace(/\s+/g, '')));
	for (let h = 0; h < Math.min(grid.length, 15); h++) {
		const head = (grid[h] ?? []).map((c) => String(c ?? ''));
		const col = {
			name: find(head, /^(ชื่อ-?นามสกุล|ชื่อ|name)$/i),
			bank: find(head, /^(ธนาคาร|bank)$/i),
			account: find(head, /^(เลขบัญชี|เลขที่บัญชี|account(no)?)$/i),
			department: find(head, /^(หน่วยงาน|department|แผนก|ไซต์)$/i),
			active: find(head, /^(สถานะ|status)$/i)
		};
		if (col.name < 0 || col.account < 0) continue;
		const rows: WorkerRow[] = [];
		for (let r = h + 1; r < grid.length; r++) {
			const cell = (i: number) => (i < 0 ? '' : String(grid[r]?.[i] ?? '').trim());
			const name = cleanName(cell(col.name));
			if (!name) continue;
			const status = cell(col.active);
			rows.push({
				line: r + 1,
				name,
				bank: cell(col.bank),
				accountNo: cleanAccount(cell(col.account)),
				department: cell(col.department) || null,
				...(status ? { active: !/ปิด|inactive|ระงับ/i.test(status) } : {})
			});
		}
		return { rows };
	}
	return { error: 'ไม่พบหัวตาราง — ต้องมีคอลัมน์ "ชื่อ-นามสกุล" และ "เลขบัญชี" (ดูตัวอย่างจากไฟล์ส่งออก)' };
}

/** Problem with an imported row, or null when it is usable. */
export function workerRowError(r: Pick<WorkerRow, 'name' | 'bank' | 'accountNo'>) {
	if (!r.bank) return 'ไม่มีธนาคาร';
	if (r.accountNo.length < 10 || r.accountNo.length > 15)
		return r.accountNo.length === 9 ? 'เลขบัญชี 9 หลัก (เลข 0 ข้างหน้าอาจหาย — จัดรูปแบบคอลัมน์เป็นข้อความ)' : 'เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก';
	return null;
}
