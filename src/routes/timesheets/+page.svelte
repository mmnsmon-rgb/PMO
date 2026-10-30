<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SheetStatus from '$lib/components/sheet-status.svelte';
	import { fmtDate, fmtDateTime, today } from '$lib/labels';
	import { fmtBaht, SHEET_STATUS_LABEL } from '$lib/payroll';
	import FilePlus from '@lucide/svelte/icons/file-plus';

	let { data, form } = $props();
	const isAdmin = $derived(page.data.user?.role === 'admin');
	let open = $state(false);
	const selectClass = 'border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none';

	const totals = $derived({
		sheets: data.sheets.length,
		headcount: data.sheets.reduce((a, s) => a + s.headcount, 0),
		total: data.sheets.reduce((a, s) => a + s.total, 0),
		pending: data.sheets.filter((s) => s.status === 'submitted').length,
		draft: data.sheets.filter((s) => s.status === 'draft').length
	});
</script>

<svelte:head><title>ใบงานค่าแรงรายวัน · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">ใบงานค่าแรงรายวัน</h1>
		<p class="text-muted-foreground text-sm">
			คีย์เงินสดรายวันแทนไฟล์ Excel — 1 ใบ = 1 หน่วยงาน / 1 วัน · {isAdmin ? 'ทุกคนในทีม' : 'เฉพาะใบที่คุณส่ง'}
		</p>
	</div>
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}<Button {...props} size="sm"><FilePlus /> สร้างใบงาน</Button>{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header><Dialog.Title>สร้างใบงานค่าแรงรายวัน</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/create" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="workDate">วันที่ทำงาน</Label>
					<Input id="workDate" name="workDate" type="date" required max={today()} value={today()} />
				</div>
				<div class="space-y-2">
					<Label for="department">หน่วยงาน</Label>
					<Input id="department" name="department" list="departments" required placeholder="เช่น DSV กม.39" />
					<datalist id="departments">{#each data.departments as d (d)}<option value={d}></option>{/each}</datalist>
				</div>
				{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
				<Dialog.Footer><Button type="submit">สร้างและเริ่มคีย์</Button></Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
</div>

<form method="GET" class="mb-4 flex flex-wrap items-end gap-2">
	<Input type="month" name="month" value={data.filter.month} class="w-auto" aria-label="เดือน" />
	<select name="status" class={selectClass} value={data.filter.status}>
		<option value="">ทุกสถานะ</option>
		{#each Object.entries(SHEET_STATUS_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
	</select>
	<select name="department" class={selectClass} value={data.filter.department}>
		<option value="">ทุกหน่วยงาน</option>
		{#each data.departments as d (d)}<option value={d}>{d}</option>{/each}
	</select>
	{#if isAdmin}
		<select name="user" class={selectClass} value={data.filter.user}>
			<option value="">ทุกคนที่ส่ง</option>
			{#each data.members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
		</select>
	{/if}
	<Button type="submit" variant="outline" size="sm">กรอง</Button>
	<Button href="/timesheets" variant="ghost" size="sm">ล้าง</Button>
</form>

<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
	{#each [{ l: 'ใบงาน', v: totals.sheets, s: `ร่าง ${totals.draft} · รอตรวจ ${totals.pending}` }, { l: 'จำนวนคน-วัน', v: totals.headcount, s: 'รวมทุกใบในตัวกรอง' }, { l: 'ยอดเงินรวม (฿)', v: fmtBaht(totals.total), s: 'รวมทุกสถานะ' }, { l: 'รอตรวจ', v: totals.pending, s: isAdmin ? 'รอ Admin อนุมัติ' : 'ส่งแล้ว รอ Admin', alert: totals.pending > 0 }] as k (k.l)}
		<Card.Root class="gap-1 border-t-[3px] py-4 {k.alert ? 'border-t-amber-500' : 'border-t-blue-500'}">
			<Card.Content class="px-4">
				<div class="text-muted-foreground text-xs">{k.l}</div>
				<div class="mt-1 text-2xl font-semibold text-blue-900 tabular-nums">{k.v}</div>
				<div class="text-muted-foreground mt-1 text-xs">{k.s}</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

<Card.Root>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>วันที่ทำงาน</Table.Head>
					<Table.Head>หน่วยงาน</Table.Head>
					<Table.Head>ผู้ส่ง</Table.Head>
					<Table.Head class="text-right">คน</Table.Head>
					<Table.Head class="text-right">ยอดเงิน (฿)</Table.Head>
					<Table.Head>สถานะ</Table.Head>
					<Table.Head>แก้ไขล่าสุด</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.sheets as s (s.id)}
					<Table.Row class="cursor-pointer" onclick={() => (location.href = `/timesheets/${s.id}`)}>
						<Table.Cell><a href="/timesheets/{s.id}" class="font-medium hover:underline">{fmtDate(s.workDate)}</a></Table.Cell>
						<Table.Cell>{s.department}</Table.Cell>
						<Table.Cell>{s.submitterName ?? '—'}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{s.headcount}</Table.Cell>
						<Table.Cell class="text-right font-medium tabular-nums">{fmtBaht(s.total)}</Table.Cell>
						<Table.Cell><SheetStatus status={s.status} /></Table.Cell>
						<Table.Cell class="text-muted-foreground text-xs">{fmtDateTime(s.updatedAt)}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={7} class="text-muted-foreground py-8 text-center">ยังไม่มีใบงานในเดือนนี้ — กด "สร้างใบงาน" เพื่อเริ่มคีย์</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
