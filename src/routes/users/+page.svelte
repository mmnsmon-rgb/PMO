<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import UserForm from '$lib/components/user-form.svelte';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	let { data, form } = $props();
	let open = $state(false);
</script>

<svelte:head><title>จัดการพนักงาน · Project Tracker</title></svelte:head>

<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">จัดการพนักงาน</h1>
		<p class="text-muted-foreground text-sm">
			{data.users.filter((u) => u.active).length} คนที่ใช้งานอยู่ · เพิ่ม / แก้ไข / ระงับ / ลบบัญชี
		</p>
	</div>
	<Dialog.Root bind:open>
		<Dialog.Trigger>
			{#snippet child({ props })}<Button {...props} size="sm"><UserPlus /> เพิ่มพนักงาน</Button>{/snippet}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-2xl">
			<Dialog.Header><Dialog.Title>เพิ่มพนักงาน</Dialog.Title></Dialog.Header>
			<form method="POST" action="?/create" use:enhance class="space-y-4">
				<UserForm isNew user={{ name: '', email: '', role: 'member', position: null, duty: null, level: null, startDate: null, active: true }} />
				{#if form?.message}<p class="text-destructive text-sm">{form.message}</p>{/if}
				<Dialog.Footer><Button type="submit">เพิ่ม</Button></Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
</div>

<Card.Root>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>ชื่อ</Table.Head>
					<Table.Head>อีเมล</Table.Head>
					<Table.Head>ตำแหน่ง</Table.Head>
					<Table.Head>สิทธิ์</Table.Head>
					<Table.Head class="text-right">งานค้าง</Table.Head>
					<Table.Head>สถานะ</Table.Head>
					<Table.Head></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as u (u.id)}
					<Table.Row class={u.active ? '' : 'opacity-55'}>
						<Table.Cell class="font-medium">{u.name}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
						<Table.Cell>
							{u.position ?? '—'}
							{#if u.level}<span class="text-muted-foreground text-xs">· {u.level}</span>{/if}
						</Table.Cell>
						<Table.Cell>
							<span
								class="rounded-md border px-1.5 py-0.5 text-xs {u.role === 'admin'
									? 'border-violet-200 bg-violet-50 text-violet-700'
									: 'border-slate-200 bg-slate-50 text-slate-600'}">{u.role === 'admin' ? 'Admin' : 'พนักงาน'}</span
							>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{u.openTasks}</Table.Cell>
						<Table.Cell class="text-xs">{u.active ? 'ใช้งาน' : 'ระงับ'}</Table.Cell>
						<Table.Cell class="text-right"><Button href="/users/{u.id}" variant="ghost" size="sm">แก้ไข</Button></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>
