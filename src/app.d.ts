import type { D1Database } from '@cloudflare/workers-types';
import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: Omit<User, 'passwordHash'> | null;
		}
		interface Platform {
			env: {
				DB: D1Database;
			};
		}
	}
}

export {};
