<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import TaskBadges from '$lib/components/task-badges.svelte';
	import ProgressBar from '$lib/components/progress-bar.svelte';
	import { STATUS_LABEL, fmtDate } from '$lib/labels';
	import { cn } from '$lib/utils';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Plus from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
	const user = $derived(page.data.user!);
	const isAdmin = $derived(user.role === 'admin');

	type Status = 'todo' | 'doing' | 'done';
	const columns: { key: Status; tint: string }[] = [
		{ key: 'todo', tint: 'bg-sky-400' },
		{ key: 'doing', tint: 'bg-blue-600' },
		{ key: 'done', tint: 'bg-emerald-500' }
	];

	// optimistic status overrides so drops render instantly; cleared once server data reloads
	let pending = $state<Record<number, Status>>({});
	const items = $derived(
		data.tasks.map((t) => {
			const s = pending[t.id];
			return s ? { ...t, status: s, progress: s === 'done' ? 100 : t.progress } : t;
		})
	);

	let dragId = $state<number | null>(null);
	let over = $state<Status | null>(null);
	let errorMsg = $state('');

	const canEdit = (t: { assigneeId: number | null }) => isAdmin || t.assigneeId === user.id;

	async function move(id: number, status: Status) {
		const t = items.find((x) => x.id === id);
		if (!t || t.status === status) return;
		pending[id] = status;
		errorMsg = '';
		const body = new FormData();
		body.set('id', String(id));
		body.set('status', status);
		const res = await fetch('?/move', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		const result = deserialize(await res.text());
		if (result.type !== 'success') {
			errorMsg = result.type === 'error' ? (result.error?.message ?? 'อัปเดตไม่สำเร็จ') : 'อัปเดตไม่สำเร็จ';
		}
		await invalidateAll();
		delete pending[id];
	}

	function setFilter(key: string, value: string) {
		const url = new URL(page.url);
		url.searchParams.set(key, value);
		goto(url, { keepFocus: true, noScroll: true });
	}

	const selectClass =
		'border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-3 outline-none';
</script>

<svelte:head><title>Kanban Board · Project Tracker</title></svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">Kanban Board</h1>
		<p class="text-muted-foreground text-sm">ลากการ์ดไปยังคอลัมน์เพื่ออัปเดตสถานะ — ทุกการเปลี่ยนแปลงถูกบันทึกในประวัติ</p>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		<select class={selectClass} value={data.filter.projectId ?? ''} onchange={(e) => setFilter('project', e.currentTarget.value)}>
			<option value="">ทุกโปรเจกต์</option>
			{#each data.projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
		<select class={selectClass} value={data.filter.assigneeId ?? ''} onchange={(e) => setFilter('assignee', e.currentTarget.value)}>
			<option value="">ทุกคน</option>
			{#each data.members as m (m.id)}<option value={m.id}>{m.id === user.id ? `${m.name} (ฉัน)` : m.name}</option>{/each}
		</select>
		{#if isAdmin}
			<Button href="/tasks/new{data.filter.projectId ? `?project=${data.filter.projectId}` : ''}" size="sm"><Plus /> เพิ่มงาน</Button>
		{/if}
	</div>
</div>

{#if errorMsg}
	<div class="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMsg}</div>
{/if}

<div class="grid gap-4 md:grid-cols-3">
	{#each columns as col (col.key)}
		{@const list = items.filter((t) => t.status === col.key)}
		<section
			role="list"
			aria-label={STATUS_LABEL[col.key]}
			class={cn('bg-secondary/60 flex min-h-64 flex-col rounded-xl border p-3 transition-colors', over === col.key && 'border-blue-400 bg-blue-50/60')}
			ondragover={(e) => {
				if (dragId === null) return;
				e.preventDefault();
				over = col.key;
			}}
			ondragleave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) over = null;
			}}
			ondrop={(e) => {
				e.preventDefault();
				over = null;
				if (dragId !== null) move(dragId, col.key);
				dragId = null;
			}}
		>
			<header class="mb-3 flex items-center gap-2 px-1">
				<span class="size-2 rounded-full {col.tint}"></span>
				<h2 class="text-sm font-semibold">{STATUS_LABEL[col.key]}</h2>
				<span class="text-muted-foreground bg-background rounded-full px-2 text-xs tabular-nums">{list.length}</span>
			</header>
			<div class="flex flex-col gap-2">
				{#each list as t (t.id)}
					{@const editable = canEdit(t)}
					<article
						role="listitem"
						draggable={editable}
						ondragstart={(e) => {
							dragId = t.id;
							e.dataTransfer?.setData('text/plain', String(t.id));
						}}
						ondragend={() => {
							dragId = null;
							over = null;
						}}
						class={cn(
							'bg-card rounded-lg border p-3 shadow-xs transition-shadow',
							editable ? 'cursor-grab hover:shadow-md active:cursor-grabbing' : 'opacity-90',
							dragId === t.id && 'opacity-40'
						)}
					>
						<div class="mb-1.5 flex items-center gap-1.5">
							<span class="text-muted-foreground text-xs">{t.code}</span>
							<TaskBadges kind="priority" task={t} />
							<span class="ml-auto"><TaskBadges kind="time" task={t} /></span>
						</div>
						<a href="/tasks/{t.id}" class="block text-sm leading-snug font-medium hover:underline">{t.title}</a>
						<div class="text-muted-foreground mt-1 truncate text-xs">{t.projectName}</div>
						{#if t.status !== 'todo'}<ProgressBar value={t.progress} class="mt-2" />{/if}
						<div class="mt-2 flex items-center gap-2 text-xs">
							<span class="bg-secondary grid size-6 place-items-center rounded-full text-[11px] font-medium" title={t.assigneeName ?? ''}>
								{t.assigneeName?.slice(0, 1) ?? '?'}
							</span>
							<span class="truncate">{t.assigneeName ?? 'ยังไม่มอบหมาย'}</span>
							<span class="text-muted-foreground ml-auto inline-flex items-center gap-1 whitespace-nowrap">
								<CalendarDays class="size-3" />{fmtDate(t.dueDate)}
							</span>
						</div>
						{#if editable}
							<!-- keyboard / touch alternative to drag & drop -->
							<label class="sr-only" for="st-{t.id}">สถานะ</label>
							<select
								id="st-{t.id}"
								class="text-muted-foreground mt-2 w-full rounded border bg-transparent px-1 py-0.5 text-xs md:hidden"
								value={t.status}
								onchange={(e) => move(t.id, e.currentTarget.value as Status)}
							>
								{#each columns as c (c.key)}<option value={c.key}>{STATUS_LABEL[c.key]}</option>{/each}
							</select>
						{/if}
					</article>
				{:else}
					<p class="text-muted-foreground py-8 text-center text-xs">ไม่มีงาน</p>
				{/each}
			</div>
		</section>
	{/each}
</div>
