import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes SQL migrations to ./drizzle, which wrangler
// applies to D1 (`migrations_dir` in wrangler.jsonc).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	strict: true,
	verbose: true
});
