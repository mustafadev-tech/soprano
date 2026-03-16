import {
  apiSuccess,
  notFound,
  runRoute,
  serverError,
} from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { getCategoryById, mapMenuItem } from '@/app/api/_server/queries';
import {
  parseNonEmptyString,
  parseOptionalString,
  parsePrice,
  parseUuid,
  readJsonObject,
} from '@/app/api/_server/validation';

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const body = await readJsonObject(incomingRequest);
    const categoryId = parseUuid(body.category_id, 'category_id');
    const name = parseNonEmptyString(body.name, 'name');
    const price = parsePrice(body.price, 'price');
    const description = parseOptionalString(body.description, 'description') ?? null;
    const category = await getCategoryById(supabase, categoryId);

    if (!category) {
      throw notFound('Category not found.');
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        category_id: categoryId,
        name,
        price,
        description,
      })
      .select('id, category_id, name, price, description, is_available, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to create menu item.');
    }

    if (!data) {
      throw serverError('Failed to create menu item.');
    }

    return apiSuccess(mapMenuItem(data), 201);
  });
}
