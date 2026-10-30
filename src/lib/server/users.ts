import { and, eq, ne } from 'drizzle-orm';
import { db } from './db';
import { users, type User } from './db/schema';

export const USER_FIELDS = ['name', 'email', 'role', 'position', 'duty', 'level', 'startDate', 'active'] as const satisfies (keyof User)[];

/** Validate the user form. Returns `{ error }` or `{ values, password }`. */
export async function parseUserForm(form: FormData, opts: { id?: number; requirePassword: boolean }) {
	const s = (k: string) => String(form.get(k) ?? '').trim();
	const name = s('name');
	const email = s('email').toLowerCase();
	const password = s('password');
	if (!name) return { error: 'กรุณาระบุชื่อ' };
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'อีเมลไม่ถูกต้อง' };
	if (opts.requirePassword && !password) return { error: 'กรุณาตั้งรหัสผ่าน' };
	if (password && password.length < 6) return { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
	const [dupe] = await db
		.select({ id: users.id })
		.from(users)
		.where(opts.id ? and(eq(users.email, email), ne(users.id, opts.id)) : eq(users.email, email));
	if (dupe) return { error: 'อีเมลนี้มีผู้ใช้แล้ว' };
	return {
		password,
		values: {
			name,
			email,
			role: s('role') === 'admin' ? ('admin' as const) : ('member' as const),
			position: s('position') || null,
			duty: s('duty') || null,
			level: s('level') || null,
			startDate: /^\d{4}-\d{2}-\d{2}$/.test(s('startDate')) ? s('startDate') : null,
			// form sends a hidden "off" plus "on" when checked
			active: form.has('active') ? form.getAll('active').includes('on') : true
		}
	};
}
