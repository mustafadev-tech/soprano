import { apiSuccess, runRoute } from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { getDailyReport } from '@/app/api/_server/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: Promise.resolve({}) }, async (incomingRequest) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const searchParams = new URL(incomingRequest.url).searchParams;
    const report = await getDailyReport(supabase, searchParams.get('date'));

    return apiSuccess(report);
  });
}
