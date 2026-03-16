import {
  apiSuccess,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { getOrderById, getOrderDetail, recalculateOrderTotal } from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { parsePaymentMethod, parseUuid, readJsonObject } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export async function POST(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const { supabase, profile } = await requireRole(['soprano_admin']);
    const orderId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const paymentMethod = parsePaymentMethod(body.payment_method);
    const order = await getOrderById(supabase, orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    if (order.status !== 'open') {
      const orderDetail = await getOrderDetail(supabase, orderId);

      if (!orderDetail) {
        throw serverError('Failed to load closed order.');
      }

      return apiSuccess(orderDetail);
    }

    await recalculateOrderTotal(supabase, orderId);
    const closedAt = new Date().toISOString();
    let data: { id: string } | null = null;
    let error: { message?: string; details?: string; hint?: string; code?: string } | null = null;
    const payloadVariants = [
      {
        status: 'closed',
        payment_method: paymentMethod,
        closed_by: profile.id,
        closed_at: closedAt,
      },
      {
        status: 'closed',
        payment_method: paymentMethod,
        closed_at: closedAt,
      },
      {
        status: 'closed',
        payment_method: paymentMethod,
      },
    ];

    for (const payload of payloadVariants) {
      const response = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId)
        .select('id')
        .maybeSingle();

      data = response.data;
      error = response.error;

      if (!error) {
        break;
      }
    }

    if (error) {
      throw serverError('Failed to close order.');
    }

    if (!data) {
      throw notFound('Order not found.');
    }

    const restoredTableStatus = order.table_status_before_open === 'reserved' ? 'reserved' : 'empty';
    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: restoredTableStatus })
      .eq('id', order.table_id);

    if (tableError) {
      throw serverError('Failed to update table status.');
    }

    const orderDetail = await getOrderDetail(supabase, orderId);

    if (!orderDetail) {
      throw serverError('Failed to load closed order.');
    }

    try {
      await refreshDailyReportSnapshot(
        supabase,
        getIstanbulDateString(orderDetail.closed_at ?? orderDetail.opened_at),
      );
    } catch (reportError) {
      console.error('Failed to refresh daily report snapshot after closing order.', reportError);
    }

    return apiSuccess(orderDetail);
  });
}
