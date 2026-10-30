<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import TaskTable from '$lib/components/task-table.svelte';
	import { pct } from '$lib/labels';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Columns3 from '@lucide/svelte/icons/columns-3';

	let { data, form } = $props();
	let editOpen = $state(false);
	const isAdmin = $derived(page.data.user?.role === 'admin');
	const s = $derived(data.summary);
</script>

<svelte:head><title>{data.project.name} · Project Tracker</title></svelte:head>

<a href="/projects" class="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
	<ChevronLeft class="size-4" />โปรเจกต์ทั้งหมด
</a>

<div class="mb-6 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">{data.project.name}</h1>
		{#if data.project.description}<p class="text-muted-foreground mt-1 text-sm">{data.project.description}</p>{/if}
		<p class="text-muted-foreground mt-2 text-sm">
			{s.total} งาน · เสร็จ {s.done} ({pct(s.completion)}) ·
			<span class={s.overdue ? 'font-medium text-rose-600' : ''}>เกินกำหนด {s.overdue}</span> · ชม. {s.est}/{s.actual}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Button href="/board?project={data.project.id}&assignee=" variant="outline" size="sm"><Columns3 /> ดูแบบ Kanban</Button>
		{#if isAdmin}
			<Dialog.Root bind:open={editOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}<Button {...props} variant="outline" size="sm"><Pencil /> แก้ไข</Button>{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<Dialog.Header><Dialog.Title>แก้ไขโปรเจกต์</Dialog.Title></Dialog.Header>
					<form
						method="POST"
						action="?/update"
						class="space-y-4"
						use:enhance={() =>
							async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') editOpen = false;
							}}
					>
						<div class="space-y-2">
							<Label for="name">ชื่อโปรเจกต์</Label>
							<Input id="name" name="name" required value={data.project.name} />
						</div>
						<div class="space-y-2">
							<Label for="description">รายละเอียด</Label>
							<Textarea id="description" name="description" rows={3} value={data.project.description ?? ''} />
						</div>
						{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
						<Dialog.Footer class="sm:justify-between">
							<Button
								type="submit"
								formaction="?/delete"
								variant="destructive"
								onclick={(e) => {
									if (!confirm(`ลบโปรเจกต์ "${data.project.name}" และงานทั้งหมด ${s.total} งาน?`)) e.preventDefault();
								}}>ลบโปรเจกต์</Button
							>
							<Button type="submit">บันทึก</Button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>
			<Button href="/tasks/new?project={data.project.id}" size="sm"><Plus /> เพิ่มงาน</Button>
		{/if}
	</div>
</div>

<Card.Root>
	<Card.Content><TaskTable tasks={data.tasks} /></Card.Content>
</Card.Root>
