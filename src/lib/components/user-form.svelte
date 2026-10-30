<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	type Values = {
		name: string;
		email: string;
		role: 'admin' | 'member';
		position: string | null;
		duty: string | null;
		level: string | null;
		startDate: string | null;
		active: boolean;
	};
	let { user, isNew = false, isSelf = false }: { user: Values; isNew?: boolean; isSelf?: boolean } = $props();
	const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none';
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<div class="space-y-2">
		<Label for="name">ชื่อ</Label>
		<Input id="name" name="name" required value={user.name} />
	</div>
	<div class="space-y-2">
		<Label for="email">อีเมล (ใช้ Login)</Label>
		<Input id="email" name="email" type="email" required value={user.email} />
	</div>
	<div class="space-y-2">
		<Label for="password">{isNew ? 'รหัสผ่าน' : 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'}</Label>
		<Input id="password" name="password" type="password" autocomplete="new-password" minlength={6} required={isNew} />
	</div>
	<div class="space-y-2">
		<Label for="role">สิทธิ์</Label>
		{#if isSelf}
			<!-- admins cannot demote themselves -->
			<input type="hidden" name="role" value={user.role} />
			<select id="role" class={selectClass} disabled value={user.role}><option value="admin">Admin</option></select>
		{:else}
			<select id="role" name="role" class={selectClass} value={user.role}>
				<option value="member">พนักงาน</option>
				<option value="admin">Admin</option>
			</select>
		{/if}
	</div>
	<div class="space-y-2">
		<Label for="position">ตำแหน่ง</Label>
		<Input id="position" name="position" value={user.position ?? ''} />
	</div>
	<div class="space-y-2">
		<Label for="level">ระดับ</Label>
		<Input id="level" name="level" value={user.level ?? ''} />
	</div>
	<div class="space-y-2 sm:col-span-2">
		<Label for="duty">หน้าที่หลัก</Label>
		<Input id="duty" name="duty" value={user.duty ?? ''} />
	</div>
	<div class="space-y-2">
		<Label for="startDate">วันเริ่มงาน</Label>
		<Input id="startDate" name="startDate" type="date" value={user.startDate ?? ''} />
	</div>
	{#if !isNew && !isSelf}
		<label class="flex items-center gap-2 self-end pb-2 text-sm">
			<input type="hidden" name="active" value="off" />
			<input type="checkbox" name="active" checked={user.active} class="size-4" />
			เปิดใช้งานบัญชี (ปิดเพื่อระงับการเข้าระบบ)
		</label>
	{/if}
</div>
