<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import UserForm from '$lib/components/user-form.svelte';
	import ActivityList from '$lib/components/activity-list.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	let { data, form } = $props();
	const isSelf = $derived(page.data.user?.id === data.user.id);
	let saved = $state(false);
</script>

<svelte:head><title>{data.user.name} · จัดการพนักงาน</title></svelte:head>

<a href="/users" class="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
	<ChevronLeft class="size-4" />พนักงานทั้งหมด
</a>
<h1 class="mb-6 text-2xl font-semibold">{data.user.name}</h1>

<div class="grid gap-6 lg:grid-cols-5">
	<Card.Root class="lg:col-span-3">
		<Card.Header><Card.Title>ข้อมูลพนักงาน</Card.Title></Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/update"
				class="space-y-4"
				use:enhance={() => {
					saved = false;
					return async ({ result, update }) => {
						await update({ reset: false });
						saved = result.type === 'success';
					};
				}}
			>
				{#key data.user}<UserForm user={data.user} {isSelf} />{/key}
				{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<Button type="submit">บันทึก</Button>
						{#if saved && !form?.message}<span class="text-sm text-emerald-600">บันทึกแล้ว</span>{/if}
					</div>
					{#if !isSelf}
						<Button
							type="submit"
							formaction="?/delete"
							variant="destructive"
							onclick={(e) => {
								if (!confirm(`ลบบัญชี ${data.user.name}? งานที่รับผิดชอบจะกลายเป็น "ยังไม่มอบหมาย"`)) e.preventDefault();
							}}>ลบพนักงาน</Button
						>
					{/if}
				</div>
			</form>
		</Card.Content>
	</Card.Root>
	<Card.Root class="lg:col-span-2">
		<Card.Header><Card.Title>ประวัติการแก้ไขบัญชี</Card.Title></Card.Header>
		<Card.Content><ActivityList entries={data.history} showEntity={false} /></Card.Content>
	</Card.Root>
</div>
