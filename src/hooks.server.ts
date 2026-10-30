import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { useD1 } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.platform?.env?.DB) useD1(event.platform.env.DB);

	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? await validateSession(token) : null;
	if (token && !event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });

	if (!event.locals.user && !event.url.pathname.startsWith('/login')) {
		redirect(303, '/login');
	}
	return resolve(event);
};
