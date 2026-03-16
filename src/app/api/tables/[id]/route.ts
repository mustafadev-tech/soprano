import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { getOpenOrderByTableId, getTableById, getTableDetailById, mapTable } from '@/app/api/_server/queries';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';
import { parseTableStatus, parseUuid, readJsonObject } from '@/app/api/_server/validation';

type TableRouteParams = {
  id: string;
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: RouteContext<TableRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const tableId = parseUuid(params.id, 'id');
    const table = await getTableDetailById(tableId);

    if (!table) {
      throw notFound('Table not found.');
    }

    return apiSuccess(table);
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext<TableRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const tableId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const status = parseTableStatus(body.status);
    const openOrder = await getOpenOrderByTableId(tableId);

    if (openOrder && status !== 'occupied') {
      throw conflict('Tables with an open order must remain occupied.');
    }

    const { data, error } = await getSupabaseAdmin()
      .from('tables')
      .update({ status })
      .eq('id', tableId)
      .is('deleted_at', null)
      .select('id, name, capacity, status, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to update table status.');
    }

    if (!data) {
      throw notFound('Table not found.');
    }

    return apiSuccess(mapTable(data));
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<TableRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const tableId = parseUuid(params.id, 'id');
    const table = await getTableById(tableId);

    if (!table) {
      throw notFound('Table not found.');
    }

    if (table.status !== 'empty') {
      throw conflict('Only empty tables can be deleted.');
    }

    const { data, error } = await getSupabaseAdmin()
      .from('tables')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', tableId)
      .eq('status', 'empty')
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to delete table.');
    }

    if (!data) {
      throw conflict('Only empty tables can be deleted.');
    }

    return apiSuccess<null>(null);
  });
}
