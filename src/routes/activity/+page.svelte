<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import ActivityList from '$lib/components/activity-list.svelte';

	let { data } = $props();
	const isAdmin = $derived(page.data.user?.role === 'admin');
	const selectClass = 'border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none';

	const pageHref = (n: number) => {
		const u = new URL(page.url);
		u.searchParams.set('page', String(n));
		return u.pathname + u.search;
	};
</script>

<svelte:head><title>ประวัติการแก้ไข · Project Tracker</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold">ประวัติการแก้ไข (Activity Log)</h1>
	<p class="text-muted-foreground text-sm">
		{isAdmin ? 'บันทึกทุกการเปลี่ยนแปลงในระบบ' : 'การเปลี่ยนแปลงที่คุณทำ'} — ข้อมูลไม่ถูกเขียนทับ ย้อนดูและย้อนกลับได้
	</p>
</div>

<form method="GET" class="mb-4 flex flex-wrap items-end gap-2">
	{#if isAdmin}
		<select name="user" class={selectClass} value={data.filter.user}>
			<option value="">ทุกคน</option>
			{#each data.members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
		</select>
	{/if}
	<select name="type" class={selectClass} value={data.filter.type}>
		<option value="">ทุกประเภท</option>
		<option value="task">งาน</option>
		<option value="project">โปรเจกต์</option>
		<option value="timesheet">ใบงานค่าแรง</option>
		<option value="worker">ลูกจ้างรายวัน</option>
		{#if isAdmin}<option value="user">พนักงาน</option>{/if}
	</select>
	<Input type="date" name="from" value={data.filter.from} class="w-auto" aria-label="ตั้งแต่วันที่" />
	<Input type="date" name="to" value={data.filter.to} class="w-auto" aria-label="ถึงวันที่" />
	<Button type="submit" variant="outline" size="sm">กรอง</Button>
	<Button href="/activity" variant="ghost" size="sm">ล้าง</Button>
</form>

<Card.Root>
	<Card.Content>
		<ActivityList entries={data.entries} canRevert />
		<div class="mt-6 flex justify-between">
			{#if data.page > 1}<Button href={pageHref(data.page - 1)} variant="outline" size="sm">← ใหม่กว่า</Button>{:else}<span></span>{/if}
			{#if data.hasMore}<Button href={pageHref(data.page + 1)} variant="outline" size="sm">เก่ากว่า →</Button>{/if}
		</div>
	</Card.Content>
</Card.Root>
