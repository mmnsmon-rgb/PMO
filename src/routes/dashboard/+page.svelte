<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import TaskBadges from '$lib/components/task-badges.svelte';
	import ProgressBar from '$lib/components/progress-bar.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import { fmtDate, pct } from '$lib/labels';
	import Printer from '@lucide/svelte/icons/printer';

	let { data } = $props();
	const t = $derived(data.total);

	const kpis = $derived([
		{ label: 'งานทั้งหมด', value: t.total, sub: `${t.todo} ยังไม่เริ่ม · ${t.doing} กำลังทำ` },
		{ label: 'เสร็จแล้ว', value: t.done, sub: `อัตราความสำเร็จ ${pct(t.completion)}` },
		{ label: 'เกินกำหนด', value: t.overdue, sub: `ใกล้ครบกำหนด ${t.soon} งาน`, alert: t.overdue > 0 },
		{ label: 'ชั่วโมง ประเมิน / จริง', value: `${t.est} / ${t.actual}`, sub: 'รวมทุกงาน' }
	]);
</script>

<svelte:head><title>Dashboard · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">Dashboard</h1>
		<p class="text-muted-foreground text-sm">สรุปภาพรวม ณ วันที่ {fmtDate(data.today)}</p>
	</div>
	<Button variant="outline" size="sm" onclick={() => window.print()} class="print:hidden"><Printer /> พิมพ์ / บันทึก PDF</Button>
</div>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	{#each kpis as k (k.label)}
		<Card.Root class="gap-1 border-t-[3px] py-4 {k.alert ? 'border-t-rose-500' : 'border-t-blue-500'}">
			<Card.Content class="px-4">
				<div class="text-muted-foreground text-xs">{k.label}</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums {k.alert ? 'text-rose-600' : 'text-blue-900'}">{k.value}</div>
				<div class="text-muted-foreground mt-1 text-xs">{k.sub}</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

<div class="mt-6 grid gap-6 xl:grid-cols-3">
	<Card.Root class="xl:col-span-2">
		<Card.Header>
			<Card.Title>งานที่เลยกำหนด</Card.Title>
			<Card.Description>ยังไม่เสร็จและเลยวันกำหนดส่งแล้ว ({data.overdue.length} งาน)</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.overdue.length === 0}
				<p class="text-muted-foreground py-4 text-sm">ไม่มีงานเลยกำหนด 🎉</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>งาน</Table.Head>
							<Table.Head>ผู้รับผิดชอบ</Table.Head>
							<Table.Head>กำหนดส่ง</Table.Head>
							<Table.Head>ความคืบหน้า</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.overdue as task (task.id)}
							<Table.Row>
								<Table.Cell class="max-w-72">
									<a href="/tasks/{task.id}" class="block truncate font-medium hover:underline">{task.title}</a>
									<div class="text-muted-foreground text-xs">{task.code} · {task.projectName}</div>
								</Table.Cell>
								<Table.Cell>{task.assigneeName ?? '—'}</Table.Cell>
								<Table.Cell>
									<div class="text-sm">{fmtDate(task.dueDate)}</div>
									<TaskBadges kind="time" {task} />
								</Table.Cell>
								<Table.Cell class="w-36"><ProgressBar value={task.progress} /></Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
			{#if data.dueSoon.length}
				<div class="mt-4 border-t pt-4">
					<div class="mb-2 text-sm font-medium">ใกล้ครบกำหนด (ภายใน 3 วัน)</div>
					<ul class="space-y-1.5">
						{#each data.dueSoon as task (task.id)}
							<li class="flex flex-wrap items-center gap-2 text-sm">
								<TaskBadges kind="time" {task} />
								<a href="/tasks/{task.id}" class="hover:underline">{task.title}</a>
								<span class="text-muted-foreground text-xs">— {task.assigneeName ?? '—'}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>อัปเดตล่าสุด</Card.Title>
			<Card.Description><a href="/activity" class="hover:underline">ดูประวัติทั้งหมด →</a></Card.Description>
		</Card.Header>
		<Card.Content><ActivityList entries={data.recent} /></Card.Content>
	</Card.Root>
</div>

<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>สรุปรายคน</Card.Title>
		<Card.Description>เรียงตามจำนวนงานเกินกำหนด</Card.Description>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>ผู้รับผิดชอบ</Table.Head>
					<Table.Head class="text-right">ทั้งหมด</Table.Head>
					<Table.Head class="text-right">To do</Table.Head>
					<Table.Head class="text-right">Doing</Table.Head>
					<Table.Head class="text-right">Done</Table.Head>
					<Table.Head class="text-right">เกินกำหนด</Table.Head>
					<Table.Head class="text-right">ชม. ประเมิน/จริง</Table.Head>
					<Table.Head class="w-40">% เสร็จ</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.people as p (p.id)}
					<Table.Row>
						<Table.Cell>
							<a href="/board?assignee={p.id}" class="font-medium hover:underline">{p.name}</a>
							<div class="text-muted-foreground text-xs">{p.position ?? ''}</div>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.total}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.todo}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.doing}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.done}</Table.Cell>
						<Table.Cell class="text-right tabular-nums {p.overdue ? 'font-semibold text-rose-600' : ''}">{p.overdue}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.est} / {p.actual}</Table.Cell>
						<Table.Cell><ProgressBar value={Math.round(p.completion * 100)} /></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<Card.Root class="mt-6">
	<Card.Header>
		<Card.Title>สรุปรายโปรเจกต์</Card.Title>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>โปรเจกต์</Table.Head>
					<Table.Head class="text-right">ทั้งหมด</Table.Head>
					<Table.Head class="text-right">To do</Table.Head>
					<Table.Head class="text-right">Doing</Table.Head>
					<Table.Head class="text-right">Done</Table.Head>
					<Table.Head class="text-right">เกินกำหนด</Table.Head>
					<Table.Head class="w-40">ความคืบหน้าเฉลี่ย</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.projects as p (p.id)}
					<Table.Row>
						<Table.Cell><a href="/projects/{p.id}" class="font-medium hover:underline">{p.name}</a></Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.total}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.todo}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.doing}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{p.done}</Table.Cell>
						<Table.Cell class="text-right tabular-nums {p.overdue ? 'font-semibold text-rose-600' : ''}">{p.overdue}</Table.Cell>
						<Table.Cell><ProgressBar value={p.avgProgress} /></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
