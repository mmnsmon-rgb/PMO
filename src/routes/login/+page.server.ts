import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession } from '$lib/server/auth';
import { verifyPassword } from '$lib/server/password';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		const [user] = await db.select().from(users).where(eq(users.email, email));
		if (!user || !(await verifyPassword(password, user.passwordHash))) {
			return fail(400, { email, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
		}
		if (!user.active) return fail(403, { email, message: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin' });
		await createSession(user.id, cookies);
		redirect(303, '/');
	}
};
