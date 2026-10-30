<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import WorkerForm from '$lib/components/worker-form.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import { fmtDate } from '$lib/labels';
	import { fmtBaht, isSCB } from '$lib/payroll';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Search from '@lucide/svelte/icons/search';

	let { data, form } = $props();
	const isAdmin = $derived(page.data.user?.role === 'admin');

	let addOpen = $state(false);
	let editing = $state<(typeof data.workers)[number] | null>(null);
	let q = $state('');
	let showInactive = $state(false);

	const shown = $derived(
		data.workers.filter(
			(w) => (showInactive || w.active) && (!q || `${w.name} ${w.accountNo} ${w.department ?? ''} ${w.bank}`.toLowerCase().includes(q.toLowerCase()))
		)
	);
	const closeOnSuccess = (close: () => void) => () => {
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			if (result.type === 'success') close();
		};
	};
</script>

<svelte:head><title>ลูกจ้างรายวัน · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">ลูกจ้างรายวัน</h1>
		<p class="text-muted-foreground text-sm">
			ทะเบียนชื่อและบัญชีธนาคาร ({data.workers.filter((w) => w.active).length} คนที่ใช้งาน) — กรอกครั้งเดียว ใช้ซ้ำได้ทุกใบงาน
		</p>
	</div>
	<Dialog.Root bind:open={addOpen}>
		<Dialog.Trigger>
			{#snippet child({ props })}<Button {...props} size="sm"><UserPlus /> เพิ่มลูกจ้าง</Button>{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-xl">
			<Dialog.Header><Dialog.Title>เพิ่มลูกจ้างรายวัน</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/create" use:enhance={closeOnSuccess(() => (addOpen = false))} class="space-y-4">
				<WorkerForm idPrefix="new" departments={data.departments} worker={{ name: '', bank: '', accountNo: '', department: null, active: true }} />
				{#if form?.message && !form?.id}<p class="text-destructive text-sm">{form.message}</p>{/if}
				<Dialog.Footer><Button type="submit">เพิ่ม</Button></Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
</div>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<div class="relative">
		<Search class="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
		<Input bind:value={q} placeholder="ค้นหาชื่อ / เลขบัญชี / หน่วยงาน" class="w-72 pl-8" />
	</div>
	<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={showInactive} class="size-4" /> แสดงที่ปิดใช้งาน</label>
</div>

<div class="grid gap-6 {data.history ? 'xl:grid-cols-3' : ''}">
	<Card.Root class={data.history ? 'xl:col-span-2' : ''}>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>ชื่อ-นามสกุล</Table.Head>
						<Table.Head>ธนาคาร</Table.Head>
						<Table.Head>เลขบัญชี</Table.Head>
						<Table.Head>หน่วยงาน</Table.Head>
						<Table.Head class="text-right">วันทำงาน</Table.Head>
						<Table.Head>ทำงานล่าสุด</Table.Head>
						{#if isAdmin}<Table.Head class="text-right">รับแล้ว (฿)</Table.Head><Table.Head></Table.Head>{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each shown as w (w.id)}
						<Table.Row class={w.active ? '' : 'opacity-55'}>
							<Table.Cell class="font-medium">{w.name}</Table.Cell>
							<Table.Cell>
								<span class="rounded px-1.5 py-0.5 text-xs {isSCB(w.bank) ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}">{w.bank}</span>
							</Table.Cell>
							<Table.Cell class="font-mono text-xs">{w.accountNo}</Table.Cell>
							<Table.Cell class="text-sm">{w.department ?? '—'}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{w.days}</Table.Cell>
							<Table.Cell class="text-sm">{fmtDate(w.lastDate)}</Table.Cell>
							{#if isAdmin}
								<Table.Cell class="text-right tabular-nums">{fmtBaht(w.earned)}</Table.Cell>
								<Table.Cell class="text-right whitespace-nowrap">
									<Button variant="ghost" size="sm" onclick={() => (editing = w)}>แก้ไข</Button>
									<Button variant="ghost" size="sm" href="?history={w.id}">ประวัติ</Button>
								</Table.Cell>
							{/if}
						</Table.Row>
					{:else}
						<Table.Row><Table.Cell colspan={8} class="text-muted-foreground py-6 text-center">ไม่พบลูกจ้าง</Table.Cell></Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if data.history}
		<Card.Root>
			<Card.Header>
				<Card.Title>ประวัติการแก้ไข</Card.Title>
				<Card.Description>
					{data.workers.find((w) => w.id === data.historyId)?.name ?? ''} · <a href="/workers" class="hover:underline">ปิด</a>
				</Card.Description>
			</Card.Header>
			<Card.Content><ActivityList entries={data.history} showEntity={false} /></Card.Content>
		</Card.Root>
	{/if}
</div>

<Dialog.Root open={!!editing} onOpenChange={(o) => !o && (editing = null)}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header><Dialog.Title>แก้ไขข้อมูลลูกจ้าง</Dialog.Title></Dialog.Header>
		{#if editing}
			<form method="POST" action="?/update" use:enhance={closeOnSuccess(() => (editing = null))} class="space-y-4">
				<input type="hidden" name="id" value={editing.id} />
				<WorkerForm idPrefix="edit" departments={data.departments} worker={editing} showActive />
				<p class="text-muted-foreground text-xs">
					การแก้ไขเลขบัญชีมีผลกับใบงานใหม่เท่านั้น ใบงานเดิมยังเก็บเลขบัญชีที่ใช้จ่ายจริงไว้
				</p>
				{#if form?.message && form?.id === editing.id}<p class="text-destructive text-sm">{form.message}</p>{/if}
				<Dialog.Footer class="sm:justify-between">
					<Button
						type="submit"
						formaction="?/delete"
						variant="destructive"
						onclick={(e) => {
							if (!confirm(`ลบ ${editing?.name}?`)) e.preventDefault();
						}}>ลบ</Button
					>
					<Button type="submit">บันทึก</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
