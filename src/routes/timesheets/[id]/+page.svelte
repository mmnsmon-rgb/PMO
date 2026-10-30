<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SheetStatus from '$lib/components/sheet-status.svelte';
	import WorkerForm from '$lib/components/worker-form.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import { fmtDate, fmtDateTime } from '$lib/labels';
	import { calcPay, fmtBaht, fmtNum, isSCB, otHours, SHIFT_LABEL, type Rates, type Shift } from '$lib/payroll';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Copy from '@lucide/svelte/icons/copy';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { data, form } = $props();
	const isAdmin = $derived(page.data.user?.role === 'admin');

	type Row = {
		workerId: number;
		shift: Shift;
		ot1Hours: number;
		ot15Hours: number;
		ot3Hours: number;
		incentive: number;
		lateMinutes: number;
		deduction: number;
		note: string;
	};
	const toRows = (list: typeof data.entries): Row[] =>
		list.map((e) => ({
			workerId: e.workerId,
			shift: e.shift,
			ot1Hours: e.ot1Hours,
			ot15Hours: e.ot15Hours,
			ot3Hours: e.ot3Hours,
			incentive: e.incentive,
			lateMinutes: e.lateMinutes,
			deduction: e.deduction,
			note: e.note ?? ''
		}));
	const toRates = (s: typeof data.sheet): Rates => ({
		dailyWage: s.dailyWage,
		travelAllowance: s.travelAllowance,
		mealAllowance: s.mealAllowance,
		nightAllowance: s.nightAllowance
	});

	// local editable copy (initialised synchronously so SSR and hydration agree);
	// re-synced when the server data changes — after a save, or on navigating to another sheet
	const initial = untrack(() => data);
	let rows = $state<Row[]>(toRows(initial.entries));
	let rates = $state<Rates>(toRates(initial.sheet));
	let workerList = $state([...initial.workers]);
	let dirty = $state(false);
	let saving = $state(false);
	let synced = { sheetId: initial.sheet.id, entries: initial.entries };
	$effect.pre(() => {
		const { sheet, entries, workers } = data;
		if (entries === synced.entries) return;
		if (dirty && sheet.id === synced.sheetId) return; // keep unsaved edits
		synced = { sheetId: sheet.id, entries };
		rows = toRows(entries);
		rates = toRates(sheet);
		workerList = [...workers];
		dirty = false;
	});

	const workerById = $derived(new Map(workerList.map((w) => [w.id, w])));
	// for the snapshot: an existing row shows the bank details it was paid with
	const snapshot = $derived(new Map(data.entries.map((e) => [e.workerId, e])));
	const shown = (id: number) => {
		const s = snapshot.get(id);
		const w = workerById.get(id);
		return { name: s?.workerName ?? w?.name ?? `#${id}`, bank: s?.bank ?? w?.bank ?? '', accountNo: s?.accountNo ?? w?.accountNo ?? '' };
	};
	const clean = (n: number | null | undefined) => (Number.isFinite(n) && n! > 0 ? Number(n) : 0);
	const pay = (r: Row) =>
		calcPay(
			{
				shift: r.shift,
				ot1Hours: clean(r.ot1Hours),
				ot15Hours: clean(r.ot15Hours),
				ot3Hours: clean(r.ot3Hours),
				incentive: clean(r.incentive),
				lateMinutes: clean(r.lateMinutes),
				deduction: clean(r.deduction)
			},
			{
				dailyWage: clean(rates.dailyWage),
				travelAllowance: clean(rates.travelAllowance),
				mealAllowance: clean(rates.mealAllowance),
				nightAllowance: clean(rates.nightAllowance)
			}
		);
	const summary = $derived.by(() => {
		const s = { people: rows.length, days: 0, ot: 0, total: 0, scb: 0, other: 0 };
		for (const r of rows) {
			const p = pay(r);
			s.days += p.days;
			s.ot += otHours({ ot1Hours: clean(r.ot1Hours), ot15Hours: clean(r.ot15Hours), ot3Hours: clean(r.ot3Hours) });
			s.total += p.total;
			if (isSCB(shown(r.workerId).bank)) s.scb += p.total;
			else s.other += p.total;
		}
		return s;
	});
	const doubleBooked = $derived(new Map(data.sameDay.map((d) => [d.workerId, d])));

	const blank = (workerId: number, shift: Shift = 'D'): Row => ({
		workerId,
		shift,
		ot1Hours: 0,
		ot15Hours: 0,
		ot3Hours: 0,
		incentive: 0,
		lateMinutes: 0,
		deduction: 0,
		note: ''
	});
	const inSheet = $derived(new Set(rows.map((r) => r.workerId)));
	const addable = $derived(
		[...workerList].sort(
			(a, b) => Number(b.department === data.sheet.department) - Number(a.department === data.sheet.department) || a.name.localeCompare(b.name, 'th')
		)
	);
	const label = (w: (typeof data.workers)[number]) => `${w.name} · ${w.bank} ${w.accountNo}`;

	let pick = $state('');
	function addPicked() {
		const w = workerList.find((x) => label(x) === pick || x.name === pick.trim());
		if (!w) return;
		if (!inSheet.has(w.id)) {
			rows.push(blank(w.id));
			dirty = true;
		}
		pick = '';
	}
	function copyPrev() {
		if (!data.prev) return;
		let added = 0;
		for (const c of data.prev.crew) {
			if (inSheet.has(c.workerId) || !workerById.has(c.workerId)) continue;
			rows.push(blank(c.workerId, c.shift));
			added++;
		}
		if (added) dirty = true;
	}
	function remove(i: number) {
		rows.splice(i, 1);
		dirty = true;
	}

	let newOpen = $state(false);
	let newError = $state('');

	beforeNavigate((nav) => {
		if (dirty && !saving && !confirm('มีข้อมูลที่ยังไม่บันทึก ออกจากหน้านี้?')) nav.cancel();
	});

	const numClass = 'h-8 w-16 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:border-transparent disabled:bg-transparent';
	const cols = [
		{ k: 'ot1Hours', l: 'OT 1.0', u: 'ชม.' },
		{ k: 'ot15Hours', l: 'OT 1.5', u: 'ชม.' },
		{ k: 'ot3Hours', l: 'OT 3.0', u: 'ชม.' },
		{ k: 'incentive', l: 'Incentive', u: '฿' },
		{ k: 'lateMinutes', l: 'มาสาย', u: 'นาที' },
		{ k: 'deduction', l: 'หักอื่นๆ', u: '฿' }
	] as const;
</script>

<svelte:head><title>{data.sheet.department} {fmtDate(data.sheet.workDate)} · ใบงาน</title></svelte:head>
<svelte:window
	onbeforeunload={(e) => {
		if (dirty) e.preventDefault();
	}}
/>

<a href="/timesheets" class="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
	<ChevronLeft class="size-4" />ใบงานทั้งหมด
</a>

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			if (result.type === 'redirect') dirty = false;
			await update({ reset: false });
			// clearing dirty after the reload lets the $effect re-sync rows from the saved data
			if (result.type === 'success') dirty = false;
			saving = false;
		};
	}}
>
	<input type="hidden" name="entries" value={JSON.stringify(rows)} />

	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-semibold">{data.sheet.department}</h1>
				<SheetStatus status={data.sheet.status} />
				{#if dirty}<span class="text-xs text-amber-600">● ยังไม่บันทึก</span>{/if}
			</div>
			<p class="text-muted-foreground text-sm">
				วันที่ทำงาน {fmtDate(data.sheet.workDate)} · คีย์โดย {data.sheet.submitterName ?? '—'}
				{#if data.sheet.submittedAt}· ส่งเมื่อ {fmtDateTime(data.sheet.submittedAt)}{/if}
				{#if data.sheet.approvedAt}· อนุมัติโดย {data.sheet.approverName ?? '—'} {fmtDateTime(data.sheet.approvedAt)}{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2 print:hidden">
			{#if data.canEdit}
				<Button type="submit" variant="outline" disabled={saving}>บันทึก</Button>
				{#if data.sheet.status === 'draft'}
					<Button
						type="submit"
						formaction="?/submit"
						disabled={saving}
						onclick={(e) => {
							if (!confirm(`ส่งใบงานให้ Admin ตรวจ? (${summary.people} คน · ${fmtBaht(summary.total)} บาท)`)) e.preventDefault();
						}}>ส่งตรวจ</Button
					>
				{/if}
			{/if}
			{#if isAdmin && data.sheet.status === 'submitted'}
				<Button type="submit" formaction="?/approve" class="bg-emerald-600 hover:bg-emerald-700" disabled={saving || dirty} title={dirty ? 'บันทึกก่อนอนุมัติ' : ''}>อนุมัติ</Button>
			{/if}
			{#if (isAdmin && data.sheet.status !== 'draft') || (data.isOwner && data.sheet.status === 'submitted')}
				<Button type="submit" formaction="?/reopen" variant="outline" disabled={saving}>
					{isAdmin ? (data.sheet.status === 'approved' ? 'ปลดล็อกเพื่อแก้ไข' : 'ตีกลับให้แก้') : 'ดึงกลับมาแก้'}
				</Button>
			{/if}
			{#if data.canEdit && data.sheet.status === 'draft'}
				<Button
					type="submit"
					formaction="?/delete"
					variant="ghost"
					class="text-destructive"
					onclick={(e) => {
						if (!confirm('ลบใบงานนี้?')) e.preventDefault();
						else dirty = false;
					}}><Trash2 /></Button
				>
			{/if}
		</div>
	</div>

	{#if form?.message}
		<p class="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">{form.message}</p>
	{:else if form?.approved}
		<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">อนุมัติแล้ว — ยอดนี้จะรวมในสรุปทำจ่าย</p>
	{:else if form?.submitted}
		<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">ส่งตรวจแล้ว — รอ Admin อนุมัติ</p>
	{:else if form?.saved && !dirty}
		<p class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">บันทึกแล้ว</p>
	{/if}

	<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
		{#each [{ l: 'จำนวนคน', v: summary.people }, { l: 'วันทำงานรวม', v: fmtNum(summary.days) }, { l: 'OT รวม (ชม.)', v: fmtNum(summary.ot) }, { l: 'SCB / ธนาคารอื่น', v: `${fmtBaht(summary.scb)} / ${fmtBaht(summary.other)}` }, { l: 'ยอดรวม (฿)', v: fmtBaht(summary.total), strong: true }] as k (k.l)}
			<Card.Root class="gap-1 border-t-[3px] py-3 {k.strong ? 'border-t-emerald-500' : 'border-t-blue-500'}">
				<Card.Content class="px-4">
					<div class="text-muted-foreground text-xs">{k.l}</div>
					<div class="mt-1 font-semibold tabular-nums {k.strong ? 'text-2xl text-emerald-700' : 'text-lg text-blue-900'}">{k.v}</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<Card.Root>
		<Card.Header class="flex flex-row flex-wrap items-center justify-between gap-3">
			<div>
				<Card.Title>รายชื่อและเวลาทำงาน</Card.Title>
				<Card.Description>
					ค่าแรง {fmtBaht(rates.dailyWage)} ฿/วัน · OT ต่อชม. = ค่าแรง ÷ 8 × (1 / 1.5 / 3) · กะดึก +{fmtNum(rates.nightAllowance)} ฿ · มาสายหักนาทีละ
					{fmtNum(rates.dailyWage / 8 / 60)} ฿
				</Card.Description>
			</div>
			{#if data.canEdit}
				<div class="flex flex-wrap items-center gap-2 print:hidden">
					<Input
						bind:value={pick}
						list="worker-options"
						placeholder="พิมพ์ชื่อเพื่อเพิ่มลูกจ้าง…"
						class="w-64"
						onchange={addPicked}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addPicked();
							}
						}}
					/>
					<datalist id="worker-options">
						{#each addable.filter((w) => !inSheet.has(w.id)) as w (w.id)}<option value={label(w)}></option>{/each}
					</datalist>
					<Button type="button" variant="outline" size="sm" onclick={() => (newOpen = true)}><UserPlus /> ลูกจ้างใหม่</Button>
					{#if data.prev}
						<Button type="button" variant="outline" size="sm" onclick={copyPrev} title="เพิ่มทุกคนจากใบงานล่าสุดของหน่วยงานนี้">
							<Copy /> ดึงรายชื่อจาก {fmtDate(data.prev.workDate)}
						</Button>
					{/if}
				</div>
			{/if}
		</Card.Header>
		<Card.Content>
			{#if isAdmin && data.canEdit}
				<div class="bg-muted/50 mb-4 flex flex-wrap items-end gap-3 rounded-lg p-3 text-sm">
					<span class="text-muted-foreground self-center text-xs">อัตราของใบนี้ (Admin):</span>
					{#each [{ k: 'dailyWage', l: 'ค่าแรง/วัน' }, { k: 'travelAllowance', l: 'ค่าเดินทาง' }, { k: 'mealAllowance', l: 'ค่าอาหาร' }, { k: 'nightAllowance', l: 'ค่ากะดึก' }] as const as f (f.k)}
						<label class="space-y-1">
							<span class="text-muted-foreground block text-xs">{f.l}</span>
							<input type="number" name={f.k} min="0" step="0.01" class="{numClass} w-24" bind:value={rates[f.k]} oninput={() => (dirty = true)} />
						</label>
					{/each}
				</div>
			{/if}

			<div class="overflow-x-auto">
				<table class="w-full min-w-[1100px] text-sm">
					<thead>
						<tr class="text-muted-foreground border-b text-left text-xs">
							<th class="w-8 py-2 font-medium">#</th>
							<th class="py-2 font-medium">ชื่อ-นามสกุล / บัญชี</th>
							<th class="py-2 font-medium">กะ</th>
							{#each cols as c (c.k)}<th class="py-2 text-right font-medium">{c.l} <span class="font-normal">({c.u})</span></th>{/each}
							<th class="py-2 pl-2 font-medium">หลักฐาน / หมายเหตุ</th>
							<th class="py-2 text-right font-medium">รวม (฿)</th>
							<th class="w-8"></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r, i (r.workerId)}
							{@const w = shown(r.workerId)}
							{@const p = pay(r)}
							{@const dup = doubleBooked.get(r.workerId)}
							<tr class="border-b last:border-0 hover:bg-blue-50/40">
								<td class="text-muted-foreground py-1.5 tabular-nums">{i + 1}</td>
								<td class="py-1.5">
									<div class="font-medium">{w.name}</div>
									<div class="text-muted-foreground text-xs">
										<span class={isSCB(w.bank) ? 'text-violet-700' : ''}>{w.bank}</span> · <span class="font-mono">{w.accountNo}</span>
									</div>
									{#if dup}
										<a href="/timesheets/{dup.sheetId}" class="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline">
											<TriangleAlert class="size-3" /> อยู่ในใบ {dup.department} วันเดียวกันด้วย
										</a>
									{/if}
								</td>
								<td class="py-1.5">
									<select
										class="border-input bg-background h-8 rounded-md border px-1.5 text-sm disabled:border-transparent disabled:bg-transparent disabled:opacity-100"
										bind:value={r.shift}
										disabled={!data.canEdit}
										onchange={() => (dirty = true)}
									>
										{#each Object.entries(SHIFT_LABEL) as [k, v] (k)}<option value={k}>{v}</option>{/each}
									</select>
								</td>
								{#each cols as c (c.k)}
									<td class="py-1.5 text-right">
										<input
											type="number"
											min="0"
											step={c.k === 'lateMinutes' ? 1 : 0.5}
											class={numClass}
											bind:value={r[c.k]}
											disabled={!data.canEdit}
											oninput={() => (dirty = true)}
										/>
									</td>
								{/each}
								<td class="py-1.5 pl-2">
									<input
										class="border-input bg-background h-8 w-full min-w-32 rounded-md border px-2 text-sm outline-none disabled:border-transparent disabled:bg-transparent"
										bind:value={r.note}
										disabled={!data.canEdit}
										oninput={() => (dirty = true)}
									/>
								</td>
								<td class="py-1.5 text-right font-medium tabular-nums">{fmtBaht(p.total)}</td>
								<td class="py-1.5 text-right">
									{#if data.canEdit}
										<button type="button" class="text-muted-foreground hover:text-destructive p-1" aria-label="ลบแถว" onclick={() => remove(i)}>
											<Trash2 class="size-4" />
										</button>
									{/if}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan={12} class="text-muted-foreground py-10 text-center">
									ยังไม่มีรายชื่อ — พิมพ์ชื่อในช่องด้านบน{data.prev ? ' หรือกด "ดึงรายชื่อ" จากใบงานล่าสุด' : ''}
								</td>
							</tr>
						{/each}
					</tbody>
					{#if rows.length}
						<tfoot>
							<tr class="border-t-2 font-medium">
								<td></td>
								<td class="py-2">รวม {summary.people} คน</td>
								<td class="py-2 tabular-nums">{fmtNum(summary.days)} วัน</td>
								{#each cols as c (c.k)}
									<td class="py-2 pr-1.5 text-right tabular-nums">{fmtNum(rows.reduce((a, r) => a + clean(r[c.k]), 0))}</td>
								{/each}
								<td></td>
								<td class="py-2 text-right text-emerald-700 tabular-nums">{fmtBaht(summary.total)}</td>
								<td></td>
							</tr>
						</tfoot>
					{/if}
				</table>
			</div>
		</Card.Content>
	</Card.Root>
</form>

<Card.Root class="mt-6">
	<Card.Header><Card.Title>ประวัติการแก้ไขใบงานนี้</Card.Title></Card.Header>
	<Card.Content><ActivityList entries={data.history} showEntity={false} /></Card.Content>
</Card.Root>

<Dialog.Root bind:open={newOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header><Dialog.Title>เพิ่มลูกจ้างใหม่เข้าระบบ</Dialog.Title></Dialog.Header>
		<form
			method="POST"
			action="/workers?/create"
			class="space-y-4"
			use:enhance={() => {
				newError = '';
				return async ({ result }) => {
					if (result.type === 'success' && result.data?.created) {
						const w = result.data.created as (typeof data.workers)[number];
						workerList.push({ id: w.id, name: w.name, bank: w.bank, accountNo: w.accountNo, department: w.department });
						rows.push(blank(w.id));
						dirty = true;
						newOpen = false;
					} else if (result.type === 'failure') {
						newError = String(result.data?.message ?? 'บันทึกไม่สำเร็จ');
					}
				};
			}}
		>
			<WorkerForm idPrefix="nw" departments={data.departments} worker={{ name: '', bank: '', accountNo: '', department: data.sheet.department, active: true }} />
			{#if newError}<p class="text-destructive text-sm">{newError}</p>{/if}
			<Dialog.Footer><Button type="submit">เพิ่มและใส่ในใบงาน</Button></Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
