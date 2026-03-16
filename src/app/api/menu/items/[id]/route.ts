import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { mapMenuItem } from '@/app/api/_server/queries';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';
import {
  ensureAtLeastOneField,
  hasOwn,
  parseBoolean,
  parseNonEmptyString,
  parseOptionalString,
  parsePrice,
  parseUuid,
  readJsonObject,
} from '@/app/api/_server/validation';

type MenuItemRouteParams = {
  id: string;
};

export async function PATCH(
  request: Request,
  context: RouteContext<MenuItemRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const menuItemId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    ensureAtLeastOneField(body, ['name', 'price', 'is_available', 'description']);

    const updates: Record<string, unknown> = {};

    if (hasOwn(body, 'name')) {
      updates.name = parseNonEmptyString(body.name, 'name');
    }

    if (hasOwn(body, 'price')) {
      updates.price = parsePrice(body.price, 'price');
    }

    if (hasOwn(body, 'is_available')) {
      updates.is_available = parseBoolean(body.is_available, 'is_available');
    }

    if (hasOwn(body, 'description')) {
      updates.description = parseOptionalString(body.description, 'description') ?? null;
    }

    const { data, error } = await getSupabaseAdmin()
      .from('menu_items')
      .update(updates)
      .eq('id', menuItemId)
      .select('id, category_id, name, price, description, is_available, created_at')
      .maybeSingle();

    if (error) {
      throw serverError('Failed to update menu item.');
    }

    if (!data) {
      throw notFound('Menu item not found.');
    }

    return apiSuccess(mapMenuItem(data));
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<MenuItemRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const menuItemId = parseUuid(params.id, 'id');
    const { data, error } = await getSupabaseAdmin()
      .from('menu_items')
      .delete()
      .eq('id', menuItemId)
      .select('id')
      .maybeSingle();

    if (error) {
      if ('code' in error && error.code === '23503') {
        throw conflict('Menu item cannot be deleted while it is referenced by order history.');
      }

      throw serverError('Failed to delete menu item.');
    }

    if (!data) {
      throw notFound('Menu item not found.');
    }

    return apiSuccess({ id: data.id });
  });
}
