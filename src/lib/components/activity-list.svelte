<script lang="ts">
	import { enhance } from '$app/forms';
	import { ACTION_LABEL, fmtDateTime } from '$lib/labels';
	import Undo2 from '@lucide/svelte/icons/undo-2';

	type Entry = {
		id: number;
		createdAt: string;
		by: string;
		action: keyof typeof ACTION_LABEL;
		entityType: 'task' | 'project' | 'user';
		entityId: number;
		entityLabel: string;
		revertable: boolean;
		changes: { field: string; label: string; from: string; to: string }[];
	};

	let {
		entries,
		canRevert = false,
		showEntity = true
	}: { entries: Entry[]; canRevert?: boolean; showEntity?: boolean } = $props();

	const actionClass: Record<string, string> = {
		create: 'bg-emerald-500',
		update: 'bg-blue-500',
		delete: 'bg-rose-500',
		revert: 'bg-amber-500',
		import: 'bg-slate-400'
	};
	const entityTH = { task: 'งาน', project: 'โปรเจกต์', user: 'พนักงาน' };
	const href = (e: Entry) =>
		e.action === 'delete' ? null : e.entityType === 'task' ? `/tasks/${e.entityId}` : e.entityType === 'project' ? `/projects/${e.entityId}` : null;
</script>

{#if entries.length === 0}
	<p class="text-muted-foreground py-6 text-center text-sm">ยังไม่มีประวัติ</p>
{:else}
	<ol class="relative space-y-4 border-l pl-5">
		{#each entries as e (e.id)}
			<li class="relative">
				<span class="absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white {actionClass[e.action]}"></span>
				<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
					<span class="font-medium">{e.by}</span>
					<span class="text-muted-foreground">{ACTION_LABEL[e.action]}{entityTH[e.entityType]}</span>
					{#if showEntity}
						{@const link = href(e)}
						{#if link}
							<a href={link} class="hover:underline">{e.entityLabel}</a>
						{:else}
							<span>{e.entityLabel}</span>
						{/if}
					{/if}
					<span class="text-muted-foreground ml-auto text-xs">{fmtDateTime(e.createdAt)}</span>
				</div>
				{#if e.changes.length}
					<ul class="text-muted-foreground mt-1 space-y-0.5 text-xs">
						{#each e.changes as c (c.field)}
							<li>
								{c.label}: <span class="line-through decoration-rose-400/70">{c.from}</span> →
								<span class="text-foreground">{c.to}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if canRevert && e.revertable}
					<form method="POST" action="/tasks/{e.entityId}?/revert" use:enhance class="mt-1">
						<input type="hidden" name="logId" value={e.id} />
						<button
							class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
							onclick={(ev) => {
								if (!confirm('ย้อนค่ากลับเป็นค่าก่อนการแก้ไขครั้งนี้?')) ev.preventDefault();
							}}
						>
							<Undo2 class="size-3" /> ย้อนกลับการแก้ไขนี้
						</button>
					</form>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
