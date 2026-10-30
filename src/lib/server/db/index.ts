import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let current: DB | undefined;

/** Bind the Cloudflare D1 database for this request (called from hooks.server.ts). */
export function useD1(d1: D1Database) {
	current = drizzle(d1, { schema });
}

// The D1 binding is the same object for every request in an isolate, so a
// module-level handle is safe; the proxy lets modules `import { db }` directly.
export const db = new Proxy({} as DB, {
	get(_, prop) {
		if (!current) throw new Error('D1 binding "DB" is not available (check wrangler.jsonc)');
		return Reflect.get(current, prop, current);
	}
});
