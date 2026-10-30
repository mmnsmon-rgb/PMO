import { and, eq, ne } from 'drizzle-orm';
import { cleanAccount, cleanName, workerRowError, type WorkerRow } from '$lib/payroll';
import { diff, logActivity } from './activity';
import { db } from './db';
import { workers, type Worker } from './db/schema';

type SessionUser = NonNullable<App.Locals['user']>;

export type ImportItem = WorkerRow & {
	kind: 'new' | 'update' | 'same' | 'error';
	error?: string;
	id?: number;
	changes?: { field: string; from: string; to: string }[];
};

/**
 * Compare uploaded rows with the registry (matched by account number). Blank cells
 * never erase existing data, and the last occurrence of a repeated account wins
 * (daily files list the same people again and again).
 */
export async function planWorkerImport(rows: WorkerRow[]) {
	const existing = new Map((await db.select().from(workers)).map((w) => [w.accountNo, w]));
	const byAccount = new Map<string, WorkerRow>();
	const items: ImportItem[] = [];
	for (const r of rows) {
		const err = workerRowError(r);
		if (err) items.push({ ...r, kind: 'error', error: err });
		else byAccount.set(r.accountNo, r);
	}
	const LABEL = { name: 'ชื่อ', bank: 'ธนาคาร', department: 'หน่วยงาน', active: 'สถานะ' } as const;
	const show = (k: string, v: unknown) => (k === 'active' ? (v ? 'ใช้งาน' : 'ปิดใช้งาน') : String(v ?? '—'));
	for (const r of byAccount.values()) {
		const w = existing.get(r.accountNo);
		if (!w) {
			items.push({ ...r, kind: 'new' });
			continue;
		}
		const next = { name: r.name, bank: r.bank, department: r.department ?? w.department, active: r.active ?? w.active };
		const changes = Object.entries(next)
			.filter(([k, v]) => w[k as keyof typeof next] !== v)
			.map(([k, v]) => ({ field: LABEL[k as keyof typeof LABEL], from: show(k, w[k as keyof typeof next]), to: show(k, v) }));
		items.push({ ...r, ...next, id: w.id, kind: changes.length ? 'update' : 'same', changes });
	}
	items.sort((a, b) => a.line - b.line);
	return {
		items,
		counts: {
			new: items.filter((i) => i.kind === 'new').length,
			update: items.filter((i) => i.kind === 'update').length,
			same: items.filter((i) => i.kind === 'same').length,
			error: items.filter((i) => i.kind === 'error').length
		}
	};
}

export async function applyWorkerImport(user: SessionUser, items: ImportItem[], source: string) {
	const fresh = items.filter((i) => i.kind === 'new');
	const updates = items.filter((i) => i.kind === 'update' && i.id);
	const before = new Map((await db.select().from(workers)).map((w) => [w.id, w]));
	const stmts = [];
	// D1: ≤100 bound params per statement → 20 rows × 5 columns
	for (let i = 0; i < fresh.length; i += 20) {
		stmts.push(
			db.insert(workers).values(
				fresh.slice(i, i + 20).map((r) => ({ name: r.name, bank: r.bank, accountNo: r.accountNo, department: r.department, active: r.active ?? true }))
			)
		);
	}
	for (const u of updates) {
		stmts.push(db.update(workers).set({ name: u.name, bank: u.bank, department: u.department, active: u.active ?? true }).where(eq(workers.id, u.id!)));
	}
	if (stmts.length) await db.batch(stmts as [(typeof stmts)[number], ...typeof stmts]);
	for (const u of updates) {
		const w = before.get(u.id!)!;
		const changes = diff(w, { name: u.name, bank: u.bank, department: u.department, active: u.active ?? true }, ['name', 'bank', 'department', 'active']);
		await logActivity({ userId: user.id, entityType: 'worker', entityId: w.id, entityLabel: u.name, action: 'update', changes });
	}
	await logActivity({
		userId: user.id,
		entityType: 'worker',
		entityId: 0,
		entityLabel: `นำเข้าจาก ${source}`,
		action: 'import',
		changes: { importResult: { from: null, to: `เพิ่มใหม่ ${fresh.length} · แก้ไข ${updates.length}` } }
	});
	return { added: fresh.length, updated: updates.length };
}

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
