import { apiSuccess, runRoute } from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';
import { listMenuCategoriesWithItems } from '@/app/api/_server/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: Promise.resolve({}) }, async () => {
    const { supabase } = await requireProfile();
    const categories = await listMenuCategoriesWithItems(supabase);
    return apiSuccess(categories);
  });
}
