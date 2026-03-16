import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';
import { getOpenOrderByTableId, getTableById, mapTable } from '@/app/api/_server/queries';
import { parseUuid } from '@/app/api/_server/validation';

type ToggleTableStatusRouteParams = {
  id: string;
};

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: RouteContext<ToggleTableStatusRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireProfile();
    const tableId = parseUuid(params.id, 'id');
    const table = await getTableById(supabase, tableId);

    if (!table) {
      throw notFound('Table not found.');
    }

    if (table.status === 'reserved') {
      throw conflict('Reserved tables cannot be toggled with this action.');
    }

    const openOrder = await getOpenOrderByTableId(supabase, tableId);
    const nextStatus = table.status === 'empty' ? 'occupied' : 'empty';

    if (nextStatus === 'empty' && openOrder) {
      throw conflict('Cannot mark table as empty while it has an open order.');
    }

    const { data, error } = await supabase
      .from('tables')
      .update({ status: nextStatus })
      .eq('id', tableId)
      .is('deleted_at', null)
      .select('id, name, capacity, status, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to toggle table status.');
    }

    if (!data) {
      throw notFound('Table not found.');
    }

    return apiSuccess(mapTable(data));
  });
}
