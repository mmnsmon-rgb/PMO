<script lang="ts" module>
	import { PRIORITY_LABEL, STATUS_LABEL, timeState, daysBetween, today } from '$lib/labels';

	const statusClass = {
		todo: 'bg-slate-100 text-slate-700 border-slate-200',
		doing: 'bg-blue-50 text-blue-700 border-blue-200',
		done: 'bg-emerald-50 text-emerald-700 border-emerald-200'
	} as const;
	const priorityClass = {
		high: 'bg-rose-50 text-rose-700 border-rose-200',
		medium: 'bg-amber-50 text-amber-700 border-amber-200',
		low: 'bg-slate-50 text-slate-600 border-slate-200'
	} as const;
</script>

<script lang="ts">
	let {
		kind,
		task
	}: {
		kind: 'status' | 'priority' | 'time';
		task: { status: 'todo' | 'doing' | 'done'; priority: 'high' | 'medium' | 'low'; dueDate: string | null };
	} = $props();

	const base = 'inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium';
	const ts = $derived(timeState(task));
	const left = $derived(task.dueDate ? daysBetween(today(), task.dueDate) : 0);
</script>

{#if kind === 'status'}
	<span class="{base} {statusClass[task.status]}">{STATUS_LABEL[task.status]}</span>
{:else if kind === 'priority'}
	<span class="{base} {priorityClass[task.priority]}">{PRIORITY_LABEL[task.priority]}</span>
{:else if ts === 'overdue'}
	<span class="{base} border-rose-200 bg-rose-50 text-rose-700">เกินกำหนด {-left} วัน</span>
{:else if ts === 'soon'}
	<span class="{base} border-amber-200 bg-amber-50 text-amber-700">{left === 0 ? 'ครบกำหนดวันนี้' : `เหลือ ${left} วัน`}</span>
{/if}
