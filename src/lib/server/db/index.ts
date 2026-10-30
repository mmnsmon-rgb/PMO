import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// Local SQLite file. For Cloudflare D1, replace with
// `drizzle(platform.env.DB, { schema })` from 'drizzle-orm/d1' in hooks.server.ts.
const client = createClient({ url: env.DATABASE_URL ?? 'file:local.db' });

export const db = drizzle(client, { schema });
export type DB = typeof db;
