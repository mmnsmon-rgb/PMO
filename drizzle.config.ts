import { defineConfig } from 'drizzle-kit';

// Local: SQLite file via libsql. When moving to Cloudflare D1, switch dialect
// to 'sqlite' + driver 'd1-http' and point at the D1 database.
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'file:local.db' },
	strict: true,
	verbose: true
});
