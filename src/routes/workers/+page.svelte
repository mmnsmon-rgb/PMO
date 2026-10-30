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
	import Upload from '@lucide/svelte/icons/upload';
	import Download from '@lucide/svelte/icons/download';

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
	let importOpen = $state(false);
	let busy = $state(false);
	type EnhanceResult = { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> };
	const keepOpen = () => {
		busy = true;
		return async ({ update }: EnhanceResult) => {
			await update({ reset: false });
			busy = false;
		};
	};
	const closeImport = () => {
		busy = true;
		return async ({ result, update }: EnhanceResult) => {
			await update();
			busy = false;
			if (result.type === 'success') importOpen = false;
		};
	};
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
	<div class="flex flex-wrap gap-2">
		{#if isAdmin}
			<Button variant="outline" size="sm" onclick={() => (importOpen = true)}><Upload /> นำเข้า Excel</Button>
			<Button variant="outline" size="sm" href="/workers/export" data-sveltekit-reload><Download /> ส่งออก Excel</Button>
		{/if}
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
</div>

{#if form?.imported}
	<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
		นำเข้าเรียบร้อย — เพิ่มใหม่ {form.imported.added} คน · แก้ไข {form.imported.updated} คน
	</p>
{/if}

<Dialog.Root bind:open={importOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>นำเข้ารายชื่อลูกจ้างจาก Excel</Dialog.Title>
			<Dialog.Description>
				รับไฟล์ .xlsx / .csv ที่มีหัวคอลัมน์ "ชื่อ-นามสกุล", "ธนาคาร", "เลขบัญชี" และ "หน่วยงาน" (ไม่บังคับ) — ใช้ไฟล์จากปุ่มส่งออก หรือไฟล์ "เงินสด DSV" รายวันเดิมก็ได้ ·
				จับคู่คนเดิมด้วยเลขบัญชี ช่องว่างในไฟล์จะไม่ลบข้อมูลเดิม
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/preview" enctype="multipart/form-data" use:enhance={keepOpen} class="flex flex-wrap items-center gap-2">
			<input type="file" name="file" accept=".xlsx,.csv" required class="file:bg-muted text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5" />
			<Button type="submit" variant="outline" size="sm" disabled={busy}>ตรวจสอบไฟล์</Button>
		</form>
		{#if form?.importError}<p class="text-destructive text-sm">{form.importError}</p>{/if}

		{#if form?.preview}
			{@const p = form.preview}
			<div class="flex flex-wrap gap-2 text-sm">
				<span class="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">เพิ่มใหม่ {p.counts.new}</span>
				<span class="rounded-md bg-blue-50 px-2 py-1 text-blue-700">แก้ไข {p.counts.update}</span>
				<span class="bg-muted text-muted-foreground rounded-md px-2 py-1">ไม่เปลี่ยน {p.counts.same}</span>
				{#if p.counts.error}<span class="rounded-md bg-rose-50 px-2 py-1 text-rose-700">ข้าม (ผิดพลาด) {p.counts.error}</span>{/if}
				<span class="text-muted-foreground self-center text-xs">จาก {p.source}</span>
			</div>
			{@const shownItems = p.items.filter((i) => i.kind !== 'same')}
			{#if shownItems.length}
				<div class="max-h-80 overflow-y-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/60 text-muted-foreground sticky top-0 text-left text-xs">
							<tr><th class="px-2 py-1.5">แถว</th><th class="px-2">ชื่อ-นามสกุล</th><th class="px-2">ธนาคาร / เลขบัญชี</th><th class="px-2">หน่วยงาน</th><th class="px-2">ผล</th></tr>
						</thead>
						<tbody>
							{#each shownItems as i (i.line + i.accountNo)}
								<tr class="border-t align-top">
									<td class="text-muted-foreground px-2 py-1.5 tabular-nums">{i.line}</td>
									<td class="px-2 py-1.5">{i.name}</td>
									<td class="px-2 py-1.5 text-xs">{i.bank || '—'}<br /><span class="font-mono">{i.accountNo || '—'}</span></td>
									<td class="px-2 py-1.5 text-xs">{i.department ?? '—'}</td>
									<td class="px-2 py-1.5 text-xs">
										{#if i.kind === 'new'}<span class="text-emerald-700">เพิ่มใหม่</span>
										{:else if i.kind === 'error'}<span class="text-rose-700">{i.error}</span>
										{:else}
											{#each i.changes ?? [] as c (c.field)}
												<div>{c.field}: <span class="line-through decoration-rose-400/70">{c.from}</span> → {c.to}</div>
											{/each}
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<form method="POST" action="?/import" use:enhance={closeImport}>
				<input type="hidden" name="source" value={p.source} />
				<input
					type="hidden"
					name="rows"
					value={JSON.stringify(
						p.items
							.filter((i) => i.kind === 'new' || i.kind === 'update')
							.map(({ line, name, bank, accountNo, department, active }) => ({ line, name, bank, accountNo, department, active }))
					)}
				/>
				<Dialog.Footer>
					<Button type="submit" disabled={busy || !(p.counts.new + p.counts.update)}>
						ยืนยันนำเข้า ({p.counts.new + p.counts.update} คน)
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

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
