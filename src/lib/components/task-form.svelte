<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { PRIORITY_LABEL, STATUS_LABEL } from '$lib/labels';

	type TaskValues = {
		title: string;
		projectId: number | null;
		assigneeId: number | null;
		priority: 'high' | 'medium' | 'low';
		status: 'todo' | 'doing' | 'done';
		startDate: string | null;
		dueDate: string | null;
		estimatedHours: number;
		actualHours: number;
		progress: number;
		note: string | null;
	};

	let {
		task,
		projects,
		members,
		full,
		action = '?/save',
		submitLabel = 'บันทึก',
		message = ''
	}: {
		task: TaskValues;
		projects: { id: number; name: string }[];
		members: { id: number; name: string }[];
		/** admins edit every field; employees only status/progress/hours/note */
		full: boolean;
		action?: string;
		submitLabel?: string;
		message?: string;
	} = $props();

	let saving = $state(false);
	let saved = $state(false);
	const selectClass =
		'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60';
</script>

<form
	method="POST"
	{action}
	class="grid gap-4 sm:grid-cols-2"
	use:enhance={() => {
		saving = true;
		saved = false;
		return async ({ update, result }) => {
			await update({ reset: false });
			saving = false;
			saved = result.type === 'success';
		};
	}}
>
	{#if full}
		<div class="space-y-2 sm:col-span-2">
			<Label for="title">ชื่องาน</Label>
			<Input id="title" name="title" required value={task.title} />
		</div>
		<div class="space-y-2">
			<Label for="projectId">โปรเจกต์</Label>
			<select id="projectId" name="projectId" class={selectClass} required value={task.projectId ?? ''}>
				<option value="" disabled>เลือกโปรเจกต์</option>
				{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</select>
		</div>
		<div class="space-y-2">
			<Label for="assigneeId">ผู้รับผิดชอบ</Label>
			<select id="assigneeId" name="assigneeId" class={selectClass} value={task.assigneeId ?? ''}>
				<option value="">— ยังไม่มอบหมาย —</option>
				{#each members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
			</select>
		</div>
		<div class="space-y-2">
			<Label for="priority">ความสำคัญ</Label>
			<select id="priority" name="priority" class={selectClass} value={task.priority}>
				{#each Object.entries(PRIORITY_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
			</select>
		</div>
	{/if}
	<div class="space-y-2">
		<Label for="status">สถานะ</Label>
		<select id="status" name="status" class={selectClass} value={task.status}>
			{#each Object.entries(STATUS_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
		</select>
	</div>
	{#if full}
		<div class="space-y-2">
			<Label for="startDate">วันเริ่ม</Label>
			<Input id="startDate" name="startDate" type="date" value={task.startDate ?? ''} />
		</div>
		<div class="space-y-2">
			<Label for="dueDate">กำหนดส่ง</Label>
			<Input id="dueDate" name="dueDate" type="date" value={task.dueDate ?? ''} />
		</div>
		<div class="space-y-2">
			<Label for="estimatedHours">ชั่วโมงประเมิน</Label>
			<Input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.5" value={task.estimatedHours} />
		</div>
	{/if}
	<div class="space-y-2">
		<Label for="actualHours">ชั่วโมงใช้จริง</Label>
		<Input id="actualHours" name="actualHours" type="number" min="0" step="0.5" value={task.actualHours} />
	</div>
	<div class="space-y-2">
		<Label for="progress">% ความคืบหน้า</Label>
		<Input id="progress" name="progress" type="number" min="0" max="100" step="5" value={task.progress} />
	</div>
	<div class="space-y-2 sm:col-span-2">
		<Label for="note">หมายเหตุ</Label>
		<Textarea id="note" name="note" rows={3} value={task.note ?? ''} />
	</div>
	<div class="flex items-center gap-3 sm:col-span-2">
		<Button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก…' : submitLabel}</Button>
		{#if message}<span class="text-destructive text-sm">{message}</span>{/if}
		{#if saved && !message}<span class="text-sm text-emerald-600">บันทึกแล้ว</span>{/if}
	</div>
</form>
