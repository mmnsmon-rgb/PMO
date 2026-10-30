import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './db/schema';
import { sha256Hex } from './password';

export const SESSION_COOKIE = 'pmo_session';
const SESSION_DAYS = 30;

export async function createSession(userId: number, cookies: Cookies) {
	const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
	const expiresAt = Date.now() + SESSION_DAYS * 864e5;
	await db.insert(sessions).values({ id: await sha256Hex(token), userId, expiresAt });
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}

export async function validateSession(token: string) {
	const id = await sha256Hex(token);
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id));
	if (!row || row.session.expiresAt < Date.now() || !row.user.active) {
		if (row) await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	const { passwordHash: _, ...user } = row.user;
	return user;
}

export async function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function requireUser(event: Pick<RequestEvent, 'locals'>) {
	if (!event.locals.user) redirect(303, '/login');
	return event.locals.user;
}

export function requireAdmin(event: Pick<RequestEvent, 'locals'>) {
	const user = requireUser(event);
	if (user.role !== 'admin') error(403, 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น');
	return user;
}
