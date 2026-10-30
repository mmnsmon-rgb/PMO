<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { fmtDate } from '$lib/labels';
	import { fmtBaht, fmtNum, isSCB } from '$lib/payroll';
	import Download from '@lucide/svelte/icons/download';
	import Printer from '@lucide/svelte/icons/printer';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { data } = $props();
	const t = $derived(data.total);
	const maxDay = $derived(Math.max(1, ...data.daily.map((d) => d.total)));
	const selectClass = 'border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs outline-none';
	const exportHref = $derived(`/payroll/export?from=${data.from}&to=${data.to}&scope=${data.scope}`);
	const monthLabel = (m: string) => new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m + '-01T00:00:00'));
	const monthEnd = (m: string) => {
		const [y, mo] = m.split('-').map(Number);
		return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
	};
	const thWeekday =new Intl.DateTimeFormat('th-TH', { weekday: 'short' });

	let payTab = $state<'scb' | 'other'>('scb');
	const payShown = $derived(data.payments.filter((p) => isSCB(p.bank) === (payTab === 'scb')));

	const kpis = $derived([
		{ l: 'ยอดทำจ่ายรวม (฿)', v: fmtBaht(t.total), s: `SCB ${fmtBaht(t.scb)} · อื่น ${fmtBaht(t.other)}`, strong: true },
		{ l: 'คน-วัน', v: fmtNum(t.days), s: `${t.workers} คน · ${t.sheets} ใบงาน` },
		{ l: 'OT รวม (ชม.)', v: fmtNum(t.ot), s: t.days ? `เฉลี่ย ${fmtNum(t.ot / t.days)} ชม./คน-วัน` : '—' },
		{
			l: 'รอดำเนินการ',
			v: (data.status.submitted ?? 0) + (data.status.draft ?? 0),
			s: `รอตรวจ ${data.status.submitted ?? 0} · ร่าง ${data.status.draft ?? 0}`,
			alert: (data.status.submitted ?? 0) > 0
		}
	]);
</script>

<svelte:head><title>สรุปทำจ่าย · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">สรุปค่าแรง & ทำจ่าย</h1>
		<p class="text-muted-foreground text-sm">
			รวมทุกใบงาน {fmtDate(data.from)} – {fmtDate(data.to)} · {data.scope === 'approved' ? 'เฉพาะที่อนุมัติแล้ว' : 'รวมที่รอตรวจ'}
		</p>
	</div>
	<div class="flex gap-2 print:hidden">
		<Button variant="outline" size="sm" onclick={() => window.print()}><Printer /> พิมพ์</Button>
		<Button href={exportHref} size="sm" data-sveltekit-reload><Download /> ไฟล์ทำจ่าย (.xlsx)</Button>
	</div>
</div>

<form method="GET" class="mb-4 flex flex-wrap items-end gap-2 print:hidden">
	<Input type="date" name="from" value={data.from} class="w-auto" aria-label="ตั้งแต่วันที่" />
	<Input type="date" name="to" value={data.to} class="w-auto" aria-label="ถึงวันที่" />
	<select name="scope" class={selectClass} value={data.scope}>
		<option value="approved">เฉพาะอนุมัติแล้ว</option>
		<option value="all">รวมที่รอตรวจ</option>
	</select>
	<Button type="submit" variant="outline" size="sm">แสดง</Button>
	<Button href="/payroll" variant="ghost" size="sm">เดือนนี้</Button>
</form>

<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
	{#each kpis as k (k.l)}
		<Card.Root class="gap-1 border-t-[3px] py-4 {k.alert ? 'border-t-amber-500' : k.strong ? 'border-t-emerald-500' : 'border-t-blue-500'}">
			<Card.Content class="px-4">
				<div class="text-muted-foreground text-xs">{k.l}</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums {k.strong ? 'text-emerald-700' : 'text-blue-900'}">{k.v}</div>
				<div class="text-muted-foreground mt-1 text-xs">{k.s}</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>

{#if data.duplicates.length || (data.status.submitted ?? 0) > 0}
	<div class="mt-4 space-y-2">
		{#if (data.status.submitted ?? 0) > 0}
			<a href="/timesheets?status=submitted" class="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:underline">
				<TriangleAlert class="size-4" /> มีใบงานรอตรวจ {data.status.submitted} ใบ — ยังไม่รวมในยอด{data.scope === 'approved' ? 'ทำจ่าย' : ''} คลิกเพื่อตรวจ
			</a>
		{/if}
		{#each data.duplicates as d (d.date + d.name)}
			<div class="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
				<TriangleAlert class="size-4" /> {d.name} ถูกคีย์ซ้ำวันที่ {fmtDate(d.date)} ในใบ:
				{#each d.sheets as s (s.id)}<a href="/timesheets/{s.id}" class="underline">{s.department}</a>{/each}
			</div>
		{/each}
	</div>
{/if}

<div class="mt-6 grid gap-6 xl:grid-cols-3">
	<Card.Root class="xl:col-span-2">
		<Card.Header>
			<Card.Title>สรุปรายวัน</Card.Title>
			<Card.Description>
				{#if data.missingDays.length}
					<span class="block text-amber-700">ไม่มีใบงาน {data.missingDays.length} วัน: {data.missingDays.map((d) => fmtDate(d)).join(', ')}</span>
				{/if}
				{#if data.noSheetsSince}
					<span class="block text-amber-700">ยังไม่มีใบงานหลัง {fmtDate(data.noSheetsSince)} (ถึง {fmtDate(data.lastDay)})</span>
				{/if}
				{#if !data.missingDays.length && !data.noSheetsSince}มีใบงานครบทุกวัน{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>วันที่</Table.Head>
						<Table.Head class="text-right">ใบงาน</Table.Head>
						<Table.Head class="text-right">คน</Table.Head>
						<Table.Head class="text-right">OT ชม.</Table.Head>
						<Table.Head class="w-[38%]">ยอดเงิน (฿)</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.daily as d (d.date)}
						<Table.Row class={d.sheets ? '' : 'text-muted-foreground'}>
							<Table.Cell class="whitespace-nowrap">
								<a href="/timesheets?month={d.date.slice(0, 7)}" class="hover:underline">{fmtDate(d.date)}</a>
								<span class="text-muted-foreground text-xs">{thWeekday.format(new Date(d.date + 'T00:00:00'))}</span>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{d.sheets || '—'}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{d.people || ''}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{d.ot ? fmtNum(d.ot) : ''}</Table.Cell>
							<Table.Cell>
								{#if d.sheets}
									<div class="flex items-center gap-2">
										<div class="bg-muted h-2 flex-1 overflow-hidden rounded-full">
											<div class="flex h-full" style="width: {(d.total / maxDay) * 100}%">
												<div class="h-full bg-violet-500" style="flex: {d.scb}"></div>
												<div class="h-full bg-blue-500" style="flex: {d.other}"></div>
											</div>
										</div>
										<span class="w-24 text-right text-sm font-medium tabular-nums">{fmtBaht(d.total)}</span>
									</div>
								{:else}
									<span class="text-xs text-amber-600">ไม่มีใบงาน</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
				<Table.Footer>
					<Table.Row>
						<Table.Cell>รวม</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{t.sheets}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{t.people}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{fmtNum(t.ot)}</Table.Cell>
						<Table.Cell class="text-right font-semibold tabular-nums">{fmtBaht(t.total)}</Table.Cell>
					</Table.Row>
				</Table.Footer>
			</Table.Root>
			<div class="text-muted-foreground mt-2 flex gap-4 text-xs">
				<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-violet-500"></span>SCB</span>
				<span class="flex items-center gap-1"><span class="size-2.5 rounded-sm bg-blue-500"></span>ธนาคารอื่น</span>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="space-y-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>สรุปรายเดือน</Card.Title>
				<Card.Description>{data.scope === 'approved' ? 'ยอดที่อนุมัติแล้ว' : 'รวมที่รอตรวจ'} · 12 เดือนล่าสุด</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>เดือน</Table.Head>
							<Table.Head class="text-right">ใบ</Table.Head>
							<Table.Head class="text-right">คน-วัน</Table.Head>
							<Table.Head class="text-right">ยอด (฿)</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.monthly as m (m.month)}
							<Table.Row>
								<Table.Cell>
									<a href="/payroll?from={m.month}-01&to={monthEnd(m.month)}&scope={data.scope}" class="hover:underline">{monthLabel(m.month)}</a>
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{m.sheets}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{m.people}</Table.Cell>
								<Table.Cell class="text-right font-medium tabular-nums">{fmtBaht(m.total)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row><Table.Cell colspan={4} class="text-muted-foreground text-center">ยังไม่มีข้อมูล</Table.Cell></Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>ตามหน่วยงาน</Card.Title></Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Body>
						{#each data.byDept as d (d.department)}
							<Table.Row>
								<Table.Cell class="font-medium">{d.department}</Table.Cell>
								<Table.Cell class="text-muted-foreground text-right text-xs">{d.sheets} ใบ · {fmtNum(d.days)} คน-วัน</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{fmtBaht(d.total)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>ตามผู้คีย์</Card.Title>
				<Card.Description>ใครส่งใบงานเท่าไร</Card.Description>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Body>
						{#each data.bySubmitter as s (s.name)}
							<Table.Row>
								<Table.Cell class="font-medium">{s.name}</Table.Cell>
								<Table.Cell class="text-muted-foreground text-right text-xs">{s.sheets} ใบ · {s.dates} วัน · {s.people} คน</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{fmtBaht(s.total)}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	</div>
</div>

<Card.Root class="mt-6">
	<Card.Header class="flex flex-row flex-wrap items-center justify-between gap-3">
		<div>
			<Card.Title>รายการโอนเงิน (รวมต่อคนทั้งช่วง)</Card.Title>
			<Card.Description>แทนชีต SCB / Other ที่เคยรวมมือทีละไฟล์ — ดาวน์โหลดเป็นไฟล์เดียวได้จากปุ่มด้านบน</Card.Description>
		</div>
		<div class="bg-muted inline-flex rounded-lg p-1 text-sm print:hidden">
			{#each [{ k: 'scb', l: `SCB (${data.payments.filter((p) => isSCB(p.bank)).length})` }, { k: 'other', l: `ธนาคารอื่น (${data.payments.filter((p) => !isSCB(p.bank)).length})` }] as const as tab (tab.k)}
				<button class="rounded-md px-3 py-1 {payTab === tab.k ? 'bg-white font-medium shadow-sm' : 'text-muted-foreground'}" onclick={() => (payTab = tab.k)}>{tab.l}</button>
			{/each}
		</div>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>ชื่อ-นามสกุล</Table.Head>
					<Table.Head>ธนาคาร</Table.Head>
					<Table.Head>เลขบัญชี</Table.Head>
					<Table.Head>หน่วยงาน</Table.Head>
					<Table.Head class="text-right">วันทำงาน</Table.Head>
					<Table.Head class="text-right">OT ชม.</Table.Head>
					<Table.Head class="text-right">ยอดโอน (฿)</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each payShown as p (p.workerId + p.accountNo)}
					<Table.Row>
						<Table.Cell class="font-medium">{p.name}</Table.Cell>
						<Table.Cell class="text-sm">{p.bank}</Table.Cell>
						<Table.Cell class="font-mono text-xs">{p.accountNo}</Table.Cell>
						<Table.Cell class="text-sm">{p.departments}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{fmtNum(p.days)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{fmtNum(p.ot)}</Table.Cell>
						<Table.Cell class="text-right font-medium tabular-nums">{fmtBaht(p.total)}</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row><Table.Cell colspan={7} class="text-muted-foreground py-6 text-center">ไม่มีรายการ</Table.Cell></Table.Row>
				{/each}
			</Table.Body>
			{#if payShown.length}
				<Table.Footer>
					<Table.Row>
						<Table.Cell colspan={4}>รวม {payShown.length} บัญชี</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{fmtNum(payShown.reduce((a, p) => a + p.days, 0))}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{fmtNum(payShown.reduce((a, p) => a + p.ot, 0))}</Table.Cell>
						<Table.Cell class="text-right font-semibold tabular-nums">{fmtBaht(payShown.reduce((a, p) => a + p.total, 0))}</Table.Cell>
					</Table.Row>
				</Table.Footer>
			{/if}
		</Table.Root>
	</Card.Content>
</Card.Root>
