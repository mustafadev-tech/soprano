import {
  apiSuccess,
  notFound,
  runRoute,
  serverError,
} from '@/app/api/_server/http';
import {
  getOpenOrderByTableId,
  getOrderDetail,
  getTableById,
} from '@/app/api/_server/queries';
import { getIstanbulDateString, refreshDailyReportSnapshot } from '@/app/api/_server/reports';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';
import { parseUuid, readJsonObject } from '@/app/api/_server/validation';

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const body = await readJsonObject(incomingRequest);
    const tableId = parseUuid(body.table_id, 'table_id');
    const table = await getTableById(tableId);

    if (!table) {
      throw notFound('Table not found.');
    }

    const openOrder = await getOpenOrderByTableId(tableId);

    if (openOrder) {
      const orderDetail = await getOrderDetail(openOrder.id);

      if (!orderDetail) {
        throw serverError('Failed to load existing order.');
      }

      if (table.status !== 'occupied') {
        const { error: tableError } = await getSupabaseAdmin()
          .from('tables')
          .update({ status: 'occupied' })
          .eq('id', tableId);

        if (tableError) {
          throw serverError('Failed to update table status.');
        }
      }

      return apiSuccess(orderDetail);
    }

    const supabase = getSupabaseAdmin();
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
        const existingOrder = await getOpenOrderByTableId(tableId);

        if (!existingOrder) {
          throw serverError('Failed to load existing order.');
        }

        const orderDetail = await getOrderDetail(existingOrder.id);

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

    const { error: tableError } = await supabase
      .from('tables')
      .update({ status: 'occupied' })
      .eq('id', tableId);

    if (tableError) {
      throw serverError('Failed to update table status.');
    }

    const orderDetail = await getOrderDetail(data.id);

    if (!orderDetail) {
      throw serverError('Failed to load created order.');
    }

    await refreshDailyReportSnapshot(getIstanbulDateString(orderDetail.opened_at));

    return apiSuccess(orderDetail, 201);
  });
}
