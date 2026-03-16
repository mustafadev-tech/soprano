import {
  apiSuccess,
  forbidden,
  runRoute,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireProfile, requireRole } from '@/app/api/_server/auth';
import { deleteTodo, updateTodo } from '@/app/api/_server/todos';
import {
  ensureAtLeastOneField,
  hasOwn,
  parseBoolean,
  parseNonEmptyString,
  parseOptionalString,
  parseUuid,
  readJsonObject,
} from '@/app/api/_server/validation';

type TodoRouteParams = {
  id: string;
};

export async function PATCH(
  request: Request,
  context: RouteContext<TodoRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const { supabase, profile } = await requireProfile();
    const todoId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const updates: Record<string, unknown> = {};

    if (profile.role === 'soprano_admin') {
      ensureAtLeastOneField(body, ['title', 'description', 'is_completed']);

      if (hasOwn(body, 'title')) {
        updates.title = parseNonEmptyString(body.title, 'title');
      }

      if (hasOwn(body, 'description')) {
        updates.description = parseOptionalString(body.description, 'description') ?? null;
      }

      if (hasOwn(body, 'is_completed')) {
        updates.is_completed = parseBoolean(body.is_completed, 'is_completed');
      }
    } else {
      if (
        !hasOwn(body, 'is_completed') ||
        hasOwn(body, 'title') ||
        hasOwn(body, 'description')
      ) {
        throw forbidden('Forbidden.');
      }

      updates.is_completed = parseBoolean(body.is_completed, 'is_completed');
    }

    const todo = await updateTodo(supabase, todoId, updates, profile.id);
    return apiSuccess(todo);
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<TodoRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (_request, { params }) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const todoId = parseUuid(params.id, 'id');
    const deleted = await deleteTodo(supabase, todoId);
    return apiSuccess(deleted);
  });
}
