<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { BANKS } from '$lib/payroll';

	type Values = { name: string; bank: string; accountNo: string; department: string | null; active: boolean };
	let {
		worker,
		departments,
		showActive = false,
		idPrefix = 'w'
	}: { worker: Values; departments: string[]; showActive?: boolean; idPrefix?: string } = $props();
	const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none';
	const id = (k: string) => `${idPrefix}-${k}`;
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<div class="space-y-2 sm:col-span-2">
		<Label for={id('name')}>ชื่อ-นามสกุล</Label>
		<Input id={id('name')} name="name" required value={worker.name} />
	</div>
	<div class="space-y-2">
		<Label for={id('bank')}>ธนาคาร</Label>
		<select id={id('bank')} name="bank" class={selectClass} required value={worker.bank}>
			<option value="" disabled>เลือกธนาคาร</option>
			{#each BANKS as b (b)}<option value={b}>{b}</option>{/each}
			{#if worker.bank && !BANKS.includes(worker.bank)}<option value={worker.bank}>{worker.bank}</option>{/if}
		</select>
	</div>
	<div class="space-y-2">
		<Label for={id('accountNo')}>เลขบัญชี</Label>
		<Input id={id('accountNo')} name="accountNo" required inputmode="numeric" placeholder="ตัวเลข 10 หลัก" value={worker.accountNo} />
	</div>
	<div class="space-y-2">
		<Label for={id('department')}>หน่วยงานประจำ</Label>
		<Input id={id('department')} name="department" list={id('departments')} placeholder="เช่น DSV กม.39" value={worker.department ?? ''} />
		<datalist id={id('departments')}>{#each departments as d (d)}<option value={d}></option>{/each}</datalist>
	</div>
	{#if showActive}
		<label class="flex items-center gap-2 self-end pb-2 text-sm">
			<input type="hidden" name="active" value="off" />
			<input type="checkbox" name="active" checked={worker.active} class="size-4" /> ใช้งานอยู่
		</label>
	{/if}
</div>
