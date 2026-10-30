<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head><title>เข้าสู่ระบบ · Project Tracker</title></svelte:head>

<div
	class="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.19_258),oklch(0.3_0.12_264)_70%)] p-4"
>
	<Card.Root class="w-full max-w-sm shadow-2xl shadow-blue-950/40">
		<Card.Header>
			<div class="bg-primary text-primary-foreground mb-2 grid size-10 place-items-center rounded-lg text-sm font-bold shadow-md shadow-blue-500/30">PM</div>
			<Card.Title class="text-xl">เข้าสู่ระบบ</Card.Title>
			<Card.Description>Project Tracker — ทีมการตลาดดิจิทัล</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-4"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						loading = false;
					};
				}}
			>
				<div class="space-y-2">
					<Label for="email">อีเมล</Label>
					<Input id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
				</div>
				<div class="space-y-2">
					<Label for="password">รหัสผ่าน</Label>
					<Input id="password" name="password" type="password" autocomplete="current-password" required />
				</div>
				{#if form?.message}
					<p class="text-destructive text-sm">{form.message}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
