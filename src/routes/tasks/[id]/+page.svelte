<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import TaskForm from '$lib/components/task-form.svelte';
	import TaskBadges from '$lib/components/task-badges.svelte';
	import ProgressBar from '$lib/components/progress-bar.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import { fmtDate } from '$lib/labels';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();
	const isAdmin = $derived(page.data.user?.role === 'admin');
	const t = $derived(data.task);
</script>

<svelte:head><title>{t.code} {t.title} · Project Tracker</title></svelte:head>

<a href="/projects/{t.projectId}" class="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
	<ChevronLeft class="size-4" />{data.projectName}
</a>

<div class="mb-6 flex flex-wrap items-start justify-between gap-3">
	<div>
		<div class="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-sm">
			{t.code}
			<TaskBadges kind="status" task={t} />
			<TaskBadges kind="priority" task={t} />
			<TaskBadges kind="time" task={t} />
		</div>
		<h1 class="text-2xl font-semibold">{t.title}</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			ผู้รับผิดชอบ: {data.assigneeName ?? '—'} · กำหนดส่ง {fmtDate(t.dueDate)}
		</p>
	</div>
	{#if isAdmin}
		<form method="POST" action="?/delete" use:enhance>
			<Button
				type="submit"
				variant="destructive"
				size="sm"
				onclick={(e) => {
					if (!confirm(`ลบงาน ${t.code}? ประวัติการแก้ไขจะยังเก็บไว้`)) e.preventDefault();
				}}><Trash2 /> ลบงาน</Button
			>
		</form>
	{/if}
</div>

<div class="grid gap-6 lg:grid-cols-5">
	<Card.Root class="lg:col-span-3">
		<Card.Header>
			<Card.Title>{data.canEdit ? 'อัปเดตงาน' : 'รายละเอียดงาน'}</Card.Title>
			{#if data.canEdit && !isAdmin}
				<Card.Description>คุณอัปเดตสถานะ ความคืบหน้า ชั่วโมงจริง และหมายเหตุของงานตัวเองได้</Card.Description>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if data.canEdit}
				<TaskForm task={t} projects={data.projects} members={data.members} full={isAdmin} />
			{:else}
				<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
					<dt class="text-muted-foreground">วันเริ่ม</dt><dd>{fmtDate(t.startDate)}</dd>
					<dt class="text-muted-foreground">กำหนดส่ง</dt><dd>{fmtDate(t.dueDate)}</dd>
					<dt class="text-muted-foreground">ชม. ประเมิน / จริง</dt><dd>{t.estimatedHours} / {t.actualHours}</dd>
					<dt class="text-muted-foreground">ความคืบหน้า</dt><dd><ProgressBar value={t.progress} /></dd>
					<dt class="text-muted-foreground">หมายเหตุ</dt><dd>{t.note ?? '—'}</dd>
				</dl>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="lg:col-span-2">
		<Card.Header>
			<Card.Title>ประวัติการแก้ไข</Card.Title>
			<Card.Description>ใครแก้อะไรเมื่อไร — กด “ย้อนกลับ” เพื่อคืนค่าเดิม</Card.Description>
		</Card.Header>
		<Card.Content>
			<ActivityList entries={data.history} canRevert={data.canEdit} showEntity={false} />
		</Card.Content>
	</Card.Root>
</div>
