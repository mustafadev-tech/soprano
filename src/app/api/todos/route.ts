import { apiSuccess, runRoute } from '@/app/api/_server/http';
import { requireProfile, requireRole } from '@/app/api/_server/auth';
import { createTodo, listTodos } from '@/app/api/_server/todos';
import { parseNonEmptyString, parseOptionalString, readJsonObject } from '@/app/api/_server/validation';

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async () => {
    const { supabase } = await requireProfile();
    const todos = await listTodos(supabase);
    return apiSuccess(todos);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: {} }, async (incomingRequest) => {
    const { supabase, profile } = await requireRole(['soprano_admin']);
    const body = await readJsonObject(incomingRequest);
    const todo = await createTodo(supabase, {
      title: parseNonEmptyString(body.title, 'title'),
      description: parseOptionalString(body.description, 'description') ?? null,
    }, profile.id);
    return apiSuccess(todo, 201);
  });
}
