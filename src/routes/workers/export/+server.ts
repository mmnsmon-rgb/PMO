import { asc, eq, sql } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/auth';
import { logActivity } from '$lib/server/activity';
import { db } from '$lib/server/db';
import { timesheetEntries, timesheets, workers } from '$lib/server/db/schema';
import { buildXlsx } from '$lib/server/xlsx';
import { today } from '$lib/labels';
import type { RequestHandler } from './$types';

// Column titles match what the import on /workers looks for, so the file round-trips.
export const GET: RequestHandler = async (event) => {
	const admin = requireAdmin(event);
	const list = await db
		.select({
			name: workers.name,
			bank: workers.bank,
			accountNo: workers.accountNo,
			department: workers.department,
			active: workers.active,
			days: sql<number>`count(${timesheetEntries.id})`,
			lastDate: sql<string | null>`max(${timesheets.workDate})`
		})
		.from(workers)
		.leftJoin(timesheetEntries, eq(timesheetEntries.workerId, workers.id))
		.leftJoin(timesheets, eq(timesheetEntries.timesheetId, timesheets.id))
		.groupBy(workers.id)
		.orderBy(asc(workers.department), asc(workers.name));

	const file = buildXlsx([
		{
			name: 'ลูกจ้างรายวัน',
			widths: [6, 28, 26, 14, 16, 12, 10, 12],
			rows: [
				['ลำดับ', 'ชื่อ-นามสกุล', 'ธนาคาร', 'เลขบัญชี', 'หน่วยงาน', 'สถานะ', 'วันทำงาน', 'ทำงานล่าสุด'],
				...list.map((w, i) => [i + 1, w.name, w.bank, w.accountNo, w.department, w.active ? 'ใช้งาน' : 'ปิดใช้งาน', w.days, w.lastDate])
			]
		}
	]);
	await logActivity({
		userId: admin.id,
		entityType: 'worker',
		entityId: 0,
		entityLabel: 'รายชื่อลูกจ้างรายวัน',
		action: 'export',
		changes: { exported: { from: null, to: `${list.length} คน` } }
	});
	return new Response(file, {
		headers: {
			'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'content-disposition': `attachment; filename="workers_${today()}.xlsx"`
		}
	});
};
