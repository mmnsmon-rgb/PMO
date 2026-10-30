<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import TaskTable from '$lib/components/task-table.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import { pct } from '$lib/labels';
	import Columns3 from '@lucide/svelte/icons/columns-3';

	let { data } = $props();
	const s = $derived(data.summary);
	let showDone = $state(false);
</script>

<svelte:head><title>งานของฉัน · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">สวัสดี, {page.data.user?.name}</h1>
		<p class="text-muted-foreground text-sm">
			งานของคุณ {s.total} งาน · เสร็จ {s.done} ({pct(s.completion)}) ·
			<span class={s.overdue ? 'font-medium text-rose-600' : ''}>เกินกำหนด {s.overdue}</span>
			· ใกล้ครบกำหนด {s.soon}
		</p>
	</div>
	<Button href="/board" variant="outline" size="sm"><Columns3 /> อัปเดตบน Kanban</Button>
</div>

<div class="grid gap-6 xl:grid-cols-3">
	<div class="space-y-6 xl:col-span-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>งานที่ยังไม่เสร็จ ({data.open.length})</Card.Title>
				<Card.Description>เรียงตามความเร่งด่วน — คลิกชื่องานเพื่ออัปเดต</Card.Description>
			</Card.Header>
			<Card.Content><TaskTable tasks={data.open} show="project" /></Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>
					<button class="hover:underline" onclick={() => (showDone = !showDone)}>
						{showDone ? '▾' : '▸'} งานที่เสร็จแล้ว ({data.done.length})
					</button>
				</Card.Title>
			</Card.Header>
			{#if showDone}<Card.Content><TaskTable tasks={data.done} show="project" /></Card.Content>{/if}
		</Card.Root>
	</div>
	<Card.Root>
		<Card.Header>
			<Card.Title>ประวัติของฉัน</Card.Title>
			<Card.Description>สิ่งที่คุณแก้ และการเปลี่ยนแปลงในงานของคุณ</Card.Description>
		</Card.Header>
		<Card.Content><ActivityList entries={data.history} /></Card.Content>
	</Card.Root>
</div>
