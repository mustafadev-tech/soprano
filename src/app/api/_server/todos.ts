import type { SupabaseClient } from '@supabase/supabase-js';

import type { DeletedRecord, TodoListItem } from '@/types/contract';
import { notFound, serverError } from '@/app/api/_server/http';

type DatabaseClient = SupabaseClient;

interface TodoProfileRow {
  full_name: string | null;
}

interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  created_by_profile: TodoProfileRow | TodoProfileRow[] | null;
  completed_by_profile: TodoProfileRow | TodoProfileRow[] | null;
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const TODO_SELECT = `
  id,
  title,
  description,
  is_completed,
  completed_by,
  created_by,
  created_at,
  updated_at,
  created_by_profile:profiles!todos_created_by_fkey(full_name),
  completed_by_profile:profiles!todos_completed_by_fkey(full_name)
`;

function isMissingTodosSetupError(error: SupabaseLikeError | null | undefined): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();

  return (
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    (message.includes('todos') &&
      (message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('could not find the table')))
  );
}

function pickTodoProfile(
  profile: TodoProfileRow | TodoProfileRow[] | null,
): TodoProfileRow | null {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile;
}

function mapTodo(row: TodoRow): TodoListItem {
  const createdByProfile = pickTodoProfile(row.created_by_profile);
  const completedByProfile = pickTodoProfile(row.completed_by_profile);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    is_completed: row.is_completed,
    completed_by: row.completed_by,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    createdByName: createdByProfile?.full_name ?? null,
    completedByName: completedByProfile?.full_name ?? null,
  };
}

export async function listTodos(supabase: DatabaseClient): Promise<TodoListItem[]> {
  const { data, error } = await supabase
    .from('todos')
    .select(TODO_SELECT)
    .order('is_completed', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTodosSetupError(error)) {
      return [];
    }

    throw serverError('Failed to load todos.');
  }

  return (data ?? []).map((row) => mapTodo(row as TodoRow));
}

export async function createTodo(
  supabase: DatabaseClient,
  values: {
    title: string;
    description: string | null;
  },
  actorId: string,
): Promise<TodoListItem> {
  const { data, error } = await supabase
    .from('todos')
    .insert({
      ...values,
      created_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .select(TODO_SELECT)
    .maybeSingle();

  if (error || !data) {
    throw serverError('Failed to create todo.');
  }

  return mapTodo(data as TodoRow);
}

export async function updateTodo(
  supabase: DatabaseClient,
  id: string,
  values: Record<string, unknown>,
  actorId: string,
): Promise<TodoListItem> {
  const nextValues: Record<string, unknown> = {
    ...values,
    updated_at: new Date().toISOString(),
  };

  if (typeof values.is_completed === 'boolean') {
    nextValues.completed_by = values.is_completed ? actorId : null;
  }

  const { data, error } = await supabase
    .from('todos')
    .update(nextValues)
    .eq('id', id)
    .select(TODO_SELECT)
    .maybeSingle();

  if (error) {
    throw serverError('Failed to update todo.');
  }

  if (!data) {
    throw notFound('Todo not found.');
  }

  return mapTodo(data as TodoRow);
}

export async function deleteTodo(
  supabase: DatabaseClient,
  id: string,
): Promise<DeletedRecord> {
  const { data, error } = await supabase
    .from('todos')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    throw serverError('Failed to delete todo.');
  }

  if (!data) {
    throw notFound('Todo not found.');
  }

  return { id: data.id };
}
