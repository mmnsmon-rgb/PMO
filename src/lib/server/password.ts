// PBKDF2 via Web Crypto so it runs on both Node and Cloudflare Workers.
const ITERATIONS = 100_000;
const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer | Uint8Array) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16))) as Uint8Array<ArrayBuffer>;

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [, iter, salt, hash] = stored.split('$');
	if (!iter || !salt || !hash) return false;
	const actual = toHex(await derive(password, fromHex(salt), Number(iter)));
	let diff = actual.length ^ hash.length;
	for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
	return diff === 0;
}

export async function sha256Hex(input: string) {
	return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}
