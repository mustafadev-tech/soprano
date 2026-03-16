import {
  apiSuccess,
  notFound,
  runRoute,
  type RouteContext,
} from '@/app/api/_server/http';
import { getOrderDetail } from '@/app/api/_server/queries';
import { parseUuid } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const orderId = parseUuid(params.id, 'id');
    const order = await getOrderDetail(orderId);

    if (!order) {
      throw notFound('Order not found.');
    }

    return apiSuccess(order);
  });
}
