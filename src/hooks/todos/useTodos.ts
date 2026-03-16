import { useCallback, useEffect, useState } from 'react';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import type { GetTodosResponse } from '@/types/contract';
import { mapTodoToUi, type UiTodo } from '@/types/api';

interface TodosStoreState {
  todos: UiTodo[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

const listeners = new Set<() => void>();

let todosStore: TodosStoreState = {
  todos: [],
  loading: true,
  error: null,
  initialized: false,
};

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getTodosStoreState(): TodosStoreState {
  return todosStore;
}

export function setTodosStoreState(
  updater: TodosStoreState | ((state: TodosStoreState) => TodosStoreState),
): void {
  todosStore = typeof updater === 'function' ? updater(todosStore) : updater;
  notifyListeners();
}

export async function refetchTodosStore(options?: { fresh?: boolean }): Promise<void> {
  setTodosStoreState((state) => ({
    ...state,
    loading: true,
    error: null,
  }));

  try {
    const data = await unwrapApiResponse(
      apiGet<GetTodosResponse>('/api/todos', {
        cacheTTL: options?.fresh ? 0 : 5000,
      }),
    );

    setTodosStoreState({
      todos: data.map(mapTodoToUi),
      loading: false,
      error: null,
      initialized: true,
    });
  } catch (fetchError) {
    setTodosStoreState({
      todos: [],
      loading: false,
      error: getApiErrorMessage(fetchError, 'Todolar yüklenemedi'),
      initialized: true,
    });
  }
}

export function useTodos(): {
  todos: UiTodo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<TodosStoreState>(todosStore);

  useEffect(() => {
    const listener = () => {
      setSnapshot(getTodosStoreState());
    };

    listeners.add(listener);
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refetch = useCallback(async () => {
    await refetchTodosStore({ fresh: true });
  }, []);

  useEffect(() => {
    if (!getTodosStoreState().initialized) {
      void refetchTodosStore();
    }
  }, []);

  return {
    todos: snapshot.todos,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
