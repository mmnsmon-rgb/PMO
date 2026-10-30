<script lang="ts">
	import { SHEET_STATUS_LABEL, type SheetStatusKey } from '$lib/payroll';

	let { status }: { status: SheetStatusKey } = $props();
	const cls: Record<SheetStatusKey, string> = {
		draft: 'border-slate-200 bg-slate-50 text-slate-600',
		submitted: 'border-amber-200 bg-amber-50 text-amber-700',
		approved: 'border-emerald-200 bg-emerald-50 text-emerald-700'
	};
</script>

<span class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs whitespace-nowrap {cls[status]}">{SHEET_STATUS_LABEL[status]}</span>
