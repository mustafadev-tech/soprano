import {
  apiSuccess,
  runRoute,
  serverError,
} from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { getNextCategorySortOrder, mapCategory } from '@/app/api/_server/queries';
import { parseNonEmptyString, readJsonObject } from '@/app/api/_server/validation';

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const body = await readJsonObject(incomingRequest);
    const name = parseNonEmptyString(body.name, 'name');
    const sortOrder = await getNextCategorySortOrder(supabase);
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name,
        sort_order: sortOrder,
      })
      .select('id, name, sort_order, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to create category.');
    }

    if (!data) {
      throw serverError('Failed to create category.');
    }

    return apiSuccess(mapCategory(data), 201);
  });
}
