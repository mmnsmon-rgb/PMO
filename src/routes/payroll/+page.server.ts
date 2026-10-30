import { requireAdmin } from '$lib/server/auth';
import { buildReport, reportParams } from '$lib/server/payroll-report';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const params = reportParams(event.url);
	const { rows: _, ...report } = await buildReport(params.from, params.to, params.scope);
	return { ...params, ...report };
};
