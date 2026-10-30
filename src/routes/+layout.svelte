<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import History from '@lucide/svelte/icons/history';
	import Users from '@lucide/svelte/icons/users';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Menu from '@lucide/svelte/icons/menu';
	import { cn } from '$lib/utils';

	let { data, children } = $props();
	let open = $state(false);

	const nav = $derived([
		...(data.user?.role === 'admin' ? [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
		{ href: '/my', label: 'งานของฉัน', icon: ListChecks },
		{ href: '/board', label: 'Kanban Board', icon: Columns3 },
		{ href: '/projects', label: 'โปรเจกต์', icon: FolderKanban },
		{ href: '/activity', label: 'ประวัติการแก้ไข', icon: History },
		...(data.user?.role === 'admin' ? [{ href: '/users', label: 'จัดการพนักงาน', icon: Users }] : [])
	]);

	const active = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

{#if data.user}
	<div class="flex min-h-screen">
		<aside
			class={cn(
				'bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-gradient-to-b from-[oklch(0.33_0.13_262)] to-[oklch(0.25_0.09_266)] transition-transform md:translate-x-0',
				open ? 'translate-x-0' : '-translate-x-full'
			)}
		>
			<div class="border-sidebar-border flex h-16 items-center gap-2.5 border-b px-5">
				<div class="grid size-8 place-items-center rounded-lg bg-white text-xs font-bold text-blue-700 shadow-sm">PM</div>
				<div class="leading-tight">
					<div class="font-semibold text-white">Project Tracker</div>
					<div class="text-[11px] text-blue-200/80">ทีมการตลาดดิจิทัล</div>
				</div>
			</div>
			<nav class="flex-1 space-y-1 p-3">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						onclick={() => (open = false)}
						class={cn(
							'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
							active(item.href)
								? 'bg-sidebar-active font-medium text-white shadow-sm ring-1 ring-white/10'
								: 'hover:bg-white/8 hover:text-white'
						)}
					>
						<item.icon class="size-4" />
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="border-sidebar-border border-t p-3">
				<div class="flex items-center gap-2.5 px-3 pb-2">
					<div class="grid size-8 shrink-0 place-items-center rounded-full bg-blue-400/25 text-sm font-medium text-white">
						{data.user.name.slice(0, 1)}
					</div>
					<div class="min-w-0">
						<div class="truncate text-sm font-medium text-white">{data.user.name}</div>
						<div class="truncate text-xs text-blue-200/80">
							{data.user.role === 'admin' ? 'Admin' : 'พนักงาน'} · {data.user.position ?? ''}
						</div>
					</div>
				</div>
				<form method="POST" action="/logout" use:enhance>
					<button class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/8 hover:text-white">
						<LogOut class="size-4" /> ออกจากระบบ
					</button>
				</form>
			</div>
		</aside>
		{#if open}
			<button class="fixed inset-0 z-30 bg-black/30 md:hidden" aria-label="ปิดเมนู" onclick={() => (open = false)}></button>
		{/if}
		<div class="flex min-w-0 flex-1 flex-col md:pl-60">
			<header class="bg-sidebar sticky top-0 z-20 flex h-14 items-center px-4 text-white md:hidden">
				<button class="p-2" aria-label="เมนู" onclick={() => (open = true)}><Menu class="size-5" /></button>
				<span class="ml-2 font-semibold">Project Tracker</span>
			</header>
			<main class="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
				{@render children()}
			</main>
		</div>
	</div>
{:else}
	{@render children()}
{/if}
