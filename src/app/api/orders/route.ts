import {
  apiSuccess,
  notFound,
  runRoute,
  serverError,
} from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';
import {
  getOpenOrderByTableId,
  getOrderDetail,
  getTableById,
} from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { parseUuid, readJsonObject } from '@/app/api/_server/validation';

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: Promise.resolve({}) }, async (incomingRequest) => {
    const { supabase } = await requireProfile();
    const body = await readJsonObject(incomingRequest);
    const tableId = parseUuid(body.table_id, 'table_id');
    const table = await getTableById(supabase, tableId);

    if (!table) {
      throw notFound('Table not found.');
    }

    const openOrder = await getOpenOrderByTableId(supabase, tableId);

    if (openOrder) {
      const orderDetail = await getOrderDetail(supabase, openOrder.id);

      if (!orderDetail) {
        throw serverError('Failed to load existing order.');
      }

      const nextTableStatus =
        openOrder.total_amount > 0
          ? 'occupied'
          : openOrder.table_status_before_open === 'reserved'
            ? 'reserved'
            : 'empty';

      if (table.status !== nextTableStatus) {
        const { error: tableError } = await supabase
          .from('tables')
          .update({ status: nextTableStatus })
          .eq('id', tableId);

        if (tableError) {
          throw serverError('Failed to update table status.');
        }
      }

      return apiSuccess(orderDetail);
    }

    const { data, error } = await supabase
      .from('orders')
      .insert({
        table_id: tableId,
        status: 'open',
        total_amount: 0,
        table_status_before_open: table.status,
      })
      .select('id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at')
      .maybeSingle();

    if (error) {
      if ('code' in error && error.code === '23505') {
        const existingOrder = await getOpenOrderByTableId(supabase, tableId);

        if (!existingOrder) {
          throw serverError('Failed to load existing order.');
        }

        const orderDetail = await getOrderDetail(supabase, existingOrder.id);

        if (!orderDetail) {
          throw serverError('Failed to load existing order.');
        }

        return apiSuccess(orderDetail);
      }

      throw serverError('Failed to create order.');
    }

    if (!data) {
      throw serverError('Failed to create order.');
    }

    const orderDetail = await getOrderDetail(supabase, data.id);

    if (!orderDetail) {
      throw serverError('Failed to load created order.');
    }

    try {
      await refreshDailyReportSnapshot(supabase, getIstanbulDateString(orderDetail.opened_at));
    } catch (reportError) {
      console.error('Failed to refresh daily report snapshot after opening order.', reportError);
    }

    return apiSuccess(orderDetail, 201);
  });
}
