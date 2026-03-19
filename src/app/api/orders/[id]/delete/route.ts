import { apiSuccess, runRoute, type RouteContext } from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { archiveAndDeleteOrder } from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { parseUuid } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export async function POST(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_incomingRequest, { params }) => {
    const { supabase, profile } = await requireRole(['soprano_admin']);
    const orderId = parseUuid(params.id, 'id');

    await archiveAndDeleteOrder(supabase, orderId, profile.id);

    try {
      await refreshDailyReportSnapshot(supabase, getIstanbulDateString());
    } catch (reportError) {
      console.error('Failed to refresh daily report snapshot after deleting order.', reportError);
    }

    return apiSuccess({ success: true });
  });
}
