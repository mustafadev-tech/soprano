import {
  apiSuccess,
  conflict,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import {
  applyOrderItemMutation,
  getOrderDetail,
} from '@/app/api/_server/queries';
import {
  parseOptionalString,
  parsePositiveInteger,
  parseUuid,
  readJsonObject,
} from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export async function POST(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const orderId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const menuItemId = parseUuid(body.menu_item_id, 'menu_item_id');
    const quantity = parsePositiveInteger(body.quantity, 'quantity');
    const note = parseOptionalString(body.note, 'note') ?? null;
    await applyOrderItemMutation({
      orderId,
      action: 'add',
      menuItemId,
      quantity,
      note,
    });

    const orderDetail = await getOrderDetail(orderId);

    if (!orderDetail) {
      throw serverError('Failed to load updated order.');
    }

    return apiSuccess(orderDetail, 201);
  });
}
