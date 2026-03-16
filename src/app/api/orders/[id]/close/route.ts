import {
  apiSuccess,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { getOrderById, getOrderDetail, recalculateOrderTotal } from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';
import { parsePaymentMethod, parseUuid, readJsonObject } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export async function POST(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const orderId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const paymentMethod = parsePaymentMethod(body.payment_method);
    const order = await getOrderById(orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    if (order.status !== 'open') {
      const orderDetail = await getOrderDetail(orderId);

      if (!orderDetail) {
        throw serverError('Failed to load closed order.');
      }

      return apiSuccess(orderDetail);
    }

    await recalculateOrderTotal(orderId);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'closed',
        payment_method: paymentMethod,
        closed_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('id')
      .maybeSingle();

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

    const orderDetail = await getOrderDetail(orderId);

    if (!orderDetail) {
      throw serverError('Failed to load closed order.');
    }

    await refreshDailyReportSnapshot(getIstanbulDateString(orderDetail.closed_at ?? orderDetail.opened_at));

    return apiSuccess(orderDetail);
  });
}
