import { runRoute } from '@/app/api/_server/http';
import { buildDailyReportCsv, getDailyReport } from '@/app/api/_server/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const searchParams = new URL(incomingRequest.url).searchParams;
    const report = await getDailyReport(searchParams.get('date'));
    const csv = buildDailyReportCsv(report);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
      },
    });
  });
}
