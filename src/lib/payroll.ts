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
