<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
</script>

<div class="mx-auto max-w-md py-24 text-center">
	<div class="text-muted-foreground text-5xl font-semibold">{page.status}</div>
	<p class="mt-3">{page.error?.message ?? 'เกิดข้อผิดพลาด'}</p>
	<Button href="/" variant="outline" class="mt-6">กลับหน้าแรก</Button>
</div>
