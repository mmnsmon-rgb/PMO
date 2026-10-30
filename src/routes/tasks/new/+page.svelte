<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import TaskForm from '$lib/components/task-form.svelte';
	import { today } from '$lib/labels';

	let { data, form } = $props();
</script>

<svelte:head><title>เพิ่มงาน · Project Tracker</title></svelte:head>

<h1 class="mb-6 text-2xl font-semibold">เพิ่มงานใหม่ <span class="text-muted-foreground text-base font-normal">({data.code})</span></h1>

<Card.Root class="max-w-3xl">
	<Card.Content>
		<TaskForm
			action="?/create"
			submitLabel="สร้างงาน"
			full
			projects={data.projects}
			members={data.members}
			message={form?.message}
			task={{
				title: '',
				projectId: data.projectId,
				assigneeId: null,
				priority: 'medium',
				status: 'todo',
				startDate: today(),
				dueDate: null,
				estimatedHours: 0,
				actualHours: 0,
				progress: 0,
				note: null
			}}
		/>
	</Card.Content>
</Card.Root>
