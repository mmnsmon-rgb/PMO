import { timeState, today } from '$lib/labels';
import type { TaskRow } from './tasks';

export function summarize(rows: Pick<TaskRow, 'status' | 'dueDate' | 'estimatedHours' | 'actualHours'>[]) {
	const now = today();
	const s = { total: 0, todo: 0, doing: 0, done: 0, overdue: 0, soon: 0, est: 0, actual: 0, completion: 0 };
	for (const t of rows) {
		s.total++;
		s[t.status]++;
		const ts = timeState(t, now);
		if (ts === 'overdue') s.overdue++;
		if (ts === 'soon') s.soon++;
		s.est += t.estimatedHours;
		s.actual += t.actualHours;
	}
	s.completion = s.total ? s.done / s.total : 0;
	return s;
}
export type Summary = ReturnType<typeof summarize>;

export function groupBy<T, K>(rows: T[], key: (r: T) => K) {
	const m = new Map<K, T[]>();
	for (const r of rows) {
		const k = key(r);
		const list = m.get(k);
		if (list) list.push(r);
		else m.set(k, [r]);
	}
	return m;
}
