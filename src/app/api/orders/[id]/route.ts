import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';
import { getOrderById, getOrderDetail } from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { parseUuid } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireProfile();
    const orderId = parseUuid(params.id, 'id');
    const order = await getOrderDetail(supabase, orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    return apiSuccess(order);
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireProfile();
    const orderId = parseUuid(params.id, 'id');
    const order = await getOrderById(supabase, orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    if (order.status !== 'open') {
      throw conflict('Only open empty orders can be deleted.');
    }

    const orderDetail = await getOrderDetail(supabase, orderId);

    if (!orderDetail) {
      throw notFound('Order not found.');
    }

    if (orderDetail.order_items.length > 0) {
      throw conflict('Only open empty orders can be deleted.');
    }

    const { error } = await supabase.from('orders').delete().eq('id', orderId);

    if (error) {
      throw conflict('Only open empty orders can be deleted.');
    }

    const restoredTableStatus = order.table_status_before_open === 'reserved' ? 'reserved' : 'empty';
    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: restoredTableStatus })
      .eq('id', order.table_id);

    if (tableError) {
      throw conflict('Only open empty orders can be deleted.');
    }

    try {
      await refreshDailyReportSnapshot(supabase, getIstanbulDateString(order.opened_at));
    } catch (reportError) {
      console.error('Failed to refresh daily report snapshot after deleting empty order.', reportError);
    }

    return apiSuccess({ id: orderId });
  });
}
