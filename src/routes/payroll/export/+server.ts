import { requireAdmin } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { buildReport, reportParams } from '$lib/server/payroll-report';
import { buildXlsx, type Cell } from '$lib/server/xlsx';
import { isSCB } from '$lib/payroll';
import type { RequestHandler } from './$types';

// Same layout as the old "SCB" / "Other" sheets (bank, account, name, amount, site),
// but one file for the whole period instead of one per day.
export const GET: RequestHandler = async (event) => {
	const admin = requireAdmin(event);
	const { from, to, scope } = reportParams(event.url);
	const r = await buildReport(from, to, scope);

	const payHeader: Cell[] = ['ธนาคาร', 'เลขบัญชี', 'ชื่อ-นามสกุล', 'จำนวนเงิน', 'หน่วยงาน', 'วันทำงาน', 'OT (ชม.)'];
	const payRows = (scb: boolean) => {
		const list = r.payments.filter((p) => isSCB(p.bank) === scb);
		const sum = Math.round(list.reduce((a, p) => a + p.total, 0) * 100) / 100;
		return [payHeader, ...list.map((p) => [p.bank, p.accountNo, p.name, p.total, p.departments, p.days, p.ot]), [], ['', '', 'รวม', sum]];
	};
	const widths = [26, 14, 28, 12, 22, 10, 10];

	const file = buildXlsx([
		{ name: 'SCB', rows: payRows(true), widths },
		{ name: 'Other', rows: payRows(false), widths },
		{
			name: 'รายวัน',
			widths: [12, 16, 26, 14, 28, 6, 8, 8, 8, 12],
			rows: [
				['วันที่', 'หน่วยงาน', 'ธนาคาร', 'เลขบัญชี', 'ชื่อ-นามสกุล', 'กะ', 'OT1.0', 'OT1.5', 'OT3.0', 'รวม'],
				...r.rows.map((x) => [x.workDate, x.department, x.bank, x.accountNo, x.workerName, x.shift, x.ot1Hours, x.ot15Hours, x.ot3Hours, x.total])
			]
		},
		{
			name: 'สรุปรายวัน',
			widths: [12, 8, 8, 10, 14, 14, 14],
			rows: [
				['วันที่', 'ใบงาน', 'คน', 'OT (ชม.)', 'SCB', 'ธนาคารอื่น', 'รวม'],
				...r.daily.map((d) => [d.date, d.sheets, d.people, d.ot, d.scb, d.other, d.total]),
				[],
				['รวม', r.total.sheets, r.total.people, r.total.ot, r.total.scb, r.total.other, r.total.total]
			]
		}
	]);

	await logActivity({
		userId: admin.id,
		entityType: 'timesheet',
		entityId: 0,
		entityLabel: `ไฟล์ทำจ่าย ${from} – ${to}`,
		action: 'export',
		changes: { exported: { from: null, to: `${r.payments.length} บัญชี · ${r.total.total.toFixed(2)} ฿` } }
	});

	return new Response(file, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="payroll_${from}_${to}.xlsx"`
		}
	});
};
