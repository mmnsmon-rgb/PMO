<script lang="ts">
	let { value, class: klass = '' }: { value: number; class?: string } = $props();
	const v = $derived(Math.max(0, Math.min(100, value)));
</script>

<div class="flex items-center gap-2 {klass}">
	<div class="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
		<div class="h-full rounded-full {v === 100 ? 'bg-emerald-500' : 'bg-blue-500'}" style="width: {v}%"></div>
	</div>
	<span class="text-muted-foreground w-9 text-right text-xs tabular-nums">{v}%</span>
</div>
