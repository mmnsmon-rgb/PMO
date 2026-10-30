// Shared (client + server) labels and date helpers.

export const STATUS_LABEL = { todo: 'To do', doing: 'Doing', done: 'Done' } as const;
export const STATUS_TH = { todo: 'ยังไม่เริ่ม', doing: 'กำลังทำ', done: 'เสร็จแล้ว' } as const;
export const PRIORITY_LABEL = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' } as const;

export const FIELD_LABEL: Record<string, string> = {
	title: 'ชื่องาน',
	projectId: 'โปรเจกต์',
	assigneeId: 'ผู้รับผิดชอบ',
	priority: 'ความสำคัญ',
	status: 'สถานะ',
	startDate: 'วันเริ่ม',
	dueDate: 'กำหนดส่ง',
	estimatedHours: 'ชม.ประเมิน',
	actualHours: 'ชม.จริง',
	progress: '% ความคืบหน้า',
	note: 'หมายเหตุ',
	name: 'ชื่อ',
	description: 'รายละเอียด',
	email: 'อีเมล',
	role: 'สิทธิ์',
	position: 'ตำแหน่ง',
	duty: 'หน้าที่',
	level: 'ระดับ',
	active: 'สถานะบัญชี',
	password: 'รหัสผ่าน',
	// payroll
	bank: 'ธนาคาร',
	accountNo: 'เลขบัญชี',
	department: 'หน่วยงาน',
	sheetStatus: 'สถานะใบงาน',
	sheetTotal: 'ยอดรวมใบงาน',
	dailyWage: 'ค่าแรง/วัน',
	travelAllowance: 'ค่าเดินทาง',
	mealAllowance: 'ค่าอาหาร',
	nightAllowance: 'ค่ากะดึก',
	exported: 'ไฟล์'
};

export const ACTION_LABEL = {
	create: 'สร้าง',
	update: 'แก้ไข',
	delete: 'ลบ',
	revert: 'ย้อนกลับ',
	import: 'นำเข้า',
	export: 'ส่งออก'
} as const;

/** Today as YYYY-MM-DD in Bangkok time. */
export function today(): string {
	return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
}

export type TimeState = 'done' | 'overdue' | 'soon' | 'normal' | 'none';

/** Mirrors the Excel "สถานะเวลา" formula: overdue / due within 3 days / normal. */
export function timeState(t: { status: string; dueDate: string | null }, now = today()): TimeState {
	if (t.status === 'done') return 'done';
	if (!t.dueDate) return 'none';
	const left = daysBetween(now, t.dueDate);
	if (left < 0) return 'overdue';
	if (left <= 3) return 'soon';
	return 'normal';
}

const thDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const thDateTime = new Intl.DateTimeFormat('th-TH', {
	day: 'numeric',
	month: 'short',
	year: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	timeZone: 'Asia/Bangkok'
});

export const fmtDate = (d: string | null | undefined) => (d ? thDate.format(new Date(d + 'T00:00:00')) : '—');
export const fmtDateTime = (d: string) => thDateTime.format(new Date(d));
export const pct = (n: number) => `${Math.round(n * 100)}%`;
