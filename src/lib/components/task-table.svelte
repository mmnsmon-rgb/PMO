<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import TaskBadges from '$lib/components/task-badges.svelte';
	import ProgressBar from '$lib/components/progress-bar.svelte';
	import { fmtDate } from '$lib/labels';

	type Row = {
		id: number;
		code: string;
		title: string;
		status: 'todo' | 'doing' | 'done';
		priority: 'high' | 'medium' | 'low';
		dueDate: string | null;
		progress: number;
		projectName: string;
		assigneeName: string | null;
		note: string | null;
	};
	let { tasks, show = 'assignee' }: { tasks: Row[]; show?: 'assignee' | 'project' } = $props();
</script>

{#if tasks.length === 0}
	<p class="text-muted-foreground py-6 text-center text-sm">ไม่มีงาน</p>
{:else}
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-16">รหัส</Table.Head>
				<Table.Head>ชื่องาน</Table.Head>
				<Table.Head>{show === 'assignee' ? 'ผู้รับผิดชอบ' : 'โปรเจกต์'}</Table.Head>
				<Table.Head>สถานะ</Table.Head>
				<Table.Head>กำหนดส่ง</Table.Head>
				<Table.Head class="w-36">ความคืบหน้า</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each tasks as t (t.id)}
				<Table.Row>
					<Table.Cell class="text-muted-foreground text-xs">{t.code}</Table.Cell>
					<Table.Cell class="max-w-80 whitespace-normal">
						<a href="/tasks/{t.id}" class="font-medium hover:underline">{t.title}</a>
						<span class="ml-1 align-middle"><TaskBadges kind="priority" task={t} /></span>
						{#if t.note}<div class="text-muted-foreground truncate text-xs">{t.note}</div>{/if}
					</Table.Cell>
					<Table.Cell>{show === 'assignee' ? (t.assigneeName ?? '—') : t.projectName}</Table.Cell>
					<Table.Cell><TaskBadges kind="status" task={t} /></Table.Cell>
					<Table.Cell>
						<div>{fmtDate(t.dueDate)}</div>
						<TaskBadges kind="time" task={t} />
					</Table.Cell>
					<Table.Cell><ProgressBar value={t.progress} /></Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/if}
