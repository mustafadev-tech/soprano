import {
  apiSuccess,
  runRoute,
  serverError,
} from '@/app/api/_server/http';
import { listTablesWithOpenOrders, mapTable } from '@/app/api/_server/queries';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';
import {
  parseNonEmptyString,
  parsePositiveInteger,
  readJsonObject,
} from '@/app/api/_server/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async () => {
    const tables = await listTablesWithOpenOrders();
    return apiSuccess(tables);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const body = await readJsonObject(incomingRequest);
    const name = parseNonEmptyString(body.name, 'name');
    const capacity = parsePositiveInteger(body.capacity, 'capacity');
    const { data, error } = await getSupabaseAdmin()
      .from('tables')
      .insert({ name, capacity })
      .select('id, name, capacity, status, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to create table.');
    }

    if (!data) {
      throw serverError('Failed to create table.');
    }

    return apiSuccess(mapTable(data), 201);
  });
}
