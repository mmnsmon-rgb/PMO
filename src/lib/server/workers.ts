import { and, eq, ne } from 'drizzle-orm';
import { cleanAccount, cleanName } from '$lib/payroll';
import { db } from './db';
import { workers, type Worker } from './db/schema';

export const WORKER_FIELDS = ['name', 'bank', 'accountNo', 'department', 'active'] as const satisfies (keyof Worker)[];

/** Validate the worker form. Returns `{ error }` or `{ values }`. */
export async function parseWorkerForm(form: FormData, id?: number) {
	const s = (k: string) => String(form.get(k) ?? '').trim();
	const name = cleanName(s('name'));
	const bank = s('bank');
	const accountNo = cleanAccount(s('accountNo'));
	if (!name) return { error: 'กรุณาระบุชื่อ-นามสกุล' };
	if (!bank) return { error: 'กรุณาเลือกธนาคาร' };
	if (accountNo.length < 10 || accountNo.length > 15) return { error: 'เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก' };
	const [dupe] = await db
		.select({ id: workers.id, name: workers.name })
		.from(workers)
		.where(id ? and(eq(workers.accountNo, accountNo), ne(workers.id, id)) : eq(workers.accountNo, accountNo));
	if (dupe) return { error: `เลขบัญชีนี้เป็นของ ${dupe.name} อยู่แล้ว` };
	return {
		values: {
			name,
			bank,
			accountNo,
			department: s('department') || null,
			active: form.has('active') ? form.getAll('active').includes('on') : true
		}
	};
}
