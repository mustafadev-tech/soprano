import { apiSuccess, runRoute } from '@/app/api/_server/http';
import { listMenuCategoriesWithItems } from '@/app/api/_server/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async () => {
    const categories = await listMenuCategoriesWithItems();
    return apiSuccess(categories);
  });
}
