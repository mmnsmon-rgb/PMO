// Build SQL that adds every worker found in the daily cash files to the registry,
// without touching existing rows (matched by account number). Safe for production.
//
//   node scripts/workers-sql.ts [dir=data/dsv] [--out seed-workers.sql]
//   npx wrangler d1 execute pmo-db --remote --file seed-workers.sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from '../src/lib/server/xlsx-read.ts';
import { parseWorkerTable, workerRowError, type WorkerRow } from '../src/lib/payroll.ts';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args.splice(outIdx, 2)[1] : 'seed-workers.sql';
const DIR = args[0] ?? 'data/dsv';

// process in day order so the latest file's name/bank/site wins
const day = (f: string) => Number(/DSV\s+(\d+)/.exec(f)?.[1] ?? 0);
const files = readdirSync(DIR)
	.filter((f) => /\.(xlsx)$/i.test(f) && !f.startsWith('~$'))
	.sort((a, b) => day(a) - day(b));

const byAccount = new Map<string, WorkerRow>();
for (const f of files) {
	const parsed = parseWorkerTable(await readXlsx(new Uint8Array(readFileSync(join(DIR, f)))));
	if ('error' in parsed) {
		console.warn(`${f}: ${parsed.error}`);
		continue;
	}
	for (const r of parsed.rows) {
		const err = workerRowError(r);
		if (err) console.warn(`${f} row ${r.line}: ${r.name} — ${err}`);
		else byAccount.set(r.accountNo, r);
	}
}

const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
const lines = [...byAccount.values()].map(
	(w) =>
		`INSERT INTO workers (name, bank, account_no, department) VALUES (${q(w.name)}, ${q(w.bank)}, ${q(w.accountNo)}, ${q(w.department)}) ON CONFLICT(account_no) DO NOTHING;`
);
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT}: ${byAccount.size} workers from ${files.length} files (existing account numbers are skipped)`);
