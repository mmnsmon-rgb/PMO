<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import ProgressBar from '$lib/components/progress-bar.svelte';
	import Plus from '@lucide/svelte/icons/plus';

	let { data, form } = $props();
	let open = $state(false);
	const isAdmin = $derived(page.data.user?.role === 'admin');
</script>

<svelte:head><title>โปรเจกต์ · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">โปรเจกต์</h1>
		<p class="text-muted-foreground text-sm">{data.projects.length} โปรเจกต์ (ลูกค้า / โครงการ)</p>
	</div>
	{#if isAdmin}
		<Dialog.Root bind:open>
			<Dialog.Trigger>
				{#snippet child({ props })}<Button {...props} size="sm"><Plus /> เพิ่มโปรเจกต์</Button>{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header><Dialog.Title>เพิ่มโปรเจกต์</Dialog.Title></Dialog.Header>
				<form method="POST" action="?/create" use:enhance class="space-y-4">
					<div class="space-y-2">
						<Label for="name">ชื่อโปรเจกต์ / ลูกค้า</Label>
						<Input id="name" name="name" required />
					</div>
					<div class="space-y-2">
						<Label for="description">รายละเอียด</Label>
						<Textarea id="description" name="description" rows={3} />
					</div>
					{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
					<Dialog.Footer><Button type="submit">สร้าง</Button></Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</div>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
	{#each data.projects as p (p.id)}
		<a href="/projects/{p.id}" class="group">
			<Card.Root class="h-full transition-shadow group-hover:shadow-md">
				<Card.Header>
					<Card.Title class="group-hover:underline">{p.name}</Card.Title>
					<Card.Description class="line-clamp-2">{p.description ?? `${p.members.length} คนในทีม: ${p.members.join(', ')}`}</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3">
					<ProgressBar value={Math.round(p.completion * 100)} />
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
						<span>ทั้งหมด <b class="tabular-nums">{p.total}</b></span>
						<span class="text-slate-600">To do <b>{p.todo}</b></span>
						<span class="text-blue-700">Doing <b>{p.doing}</b></span>
						<span class="text-emerald-700">Done <b>{p.done}</b></span>
						{#if p.overdue}<span class="font-medium text-rose-600">เกินกำหนด {p.overdue}</span>{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</a>
	{/each}
</div>
