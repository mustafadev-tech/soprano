import { apiSuccess, runRoute } from '@/app/api/_server/http';
import { requireProfile } from '@/app/api/_server/auth';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: Promise.resolve({}) }, async () => {
    const { profile } = await requireProfile();
    return apiSuccess(profile);
  });
}
