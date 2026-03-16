import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import { mapCategory } from '@/app/api/_server/queries';
import { parseNonEmptyString, parseUuid, readJsonObject } from '@/app/api/_server/validation';

type CategoryRouteParams = {
  id: string;
};

export async function PATCH(
  request: Request,
  context: RouteContext<CategoryRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const categoryId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const name = parseNonEmptyString(body.name, 'name');
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', categoryId)
      .select('id, name, sort_order, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to update category.');
    }

    if (!data) {
      throw notFound('Category not found.');
    }

    return apiSuccess(mapCategory(data));
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<CategoryRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const categoryId = parseUuid(params.id, 'id');
    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .select('id')
      .maybeSingle();

    if (error) {
      if ('code' in error && error.code === '23503') {
        throw conflict('Category cannot be deleted while its menu items are referenced by order history.');
      }

      throw serverError('Failed to delete category.');
    }

    if (!data) {
      throw notFound('Category not found.');
    }

    return apiSuccess({ id: data.id });
  });
}
