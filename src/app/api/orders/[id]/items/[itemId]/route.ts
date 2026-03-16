import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';
import {
  applyOrderItemMutation,
  getOrderById,
  getOrderDetail,
} from '@/app/api/_server/queries';
import {
  parsePositiveInteger,
  parseUuid,
  readJsonObject,
} from '@/app/api/_server/validation';

type OrderItemRouteParams = {
  id: string;
  itemId: string;
};

export async function PATCH(
  request: Request,
  context: RouteContext<OrderItemRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const { supabase } = await requireProfile();
    const orderId = parseUuid(params.id, 'id');
    const itemId = parseUuid(params.itemId, 'itemId');
    const body = await readJsonObject(incomingRequest);
    const quantity = parsePositiveInteger(body.quantity, 'quantity');
    const order = await getOrderById(supabase, orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    if (order.status !== 'open') {
      throw conflict('Cannot update items on a closed order.');
    }

    await applyOrderItemMutation(supabase, {
      orderId,
      action: 'update',
      itemId,
      quantity,
    });

    const orderDetail = await getOrderDetail(supabase, orderId);

    if (!orderDetail) {
      throw serverError('Failed to load updated order.');
    }

    return apiSuccess(orderDetail);
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<OrderItemRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireProfile();
    const orderId = parseUuid(params.id, 'id');
    const itemId = parseUuid(params.itemId, 'itemId');
    const order = await getOrderById(supabase, orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    if (order.status !== 'open') {
      throw conflict('Cannot delete items from a closed order.');
    }

    await applyOrderItemMutation(supabase, {
      orderId,
      action: 'delete',
      itemId,
    });

    const orderDetail = await getOrderDetail(supabase, orderId);

    if (!orderDetail) {
      throw serverError('Failed to load updated order.');
    }

    return apiSuccess(orderDetail);
  });
}
