import { useState } from 'react';
import { toast } from 'sonner';

import { createClientId } from '@/lib/clientId';
import {
  apiDelete,
  apiPatch,
  apiPost,
  clearCache,
  getApiErrorMessage,
  unwrapApiResponse,
} from '@/lib/apiClient';
import type {
  CreateTodoRequest,
  CreateTodoResponse,
  DeleteTodoResponse,
  UpdateTodoRequest,
  UpdateTodoResponse,
} from '@/types/contract';
import { mapTodoToUi, type UiTodo } from '@/types/api';
import { getTodosStoreState, setTodosStoreState } from '@/hooks/todos/useTodos';

interface UseTodoActionsResult {
  addTodo: (values: CreateTodoRequest) => Promise<boolean>;
  updateTodo: (id: string, values: UpdateTodoRequest) => Promise<boolean>;
  deleteTodo: (id: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

export function useTodoActions(): UseTodoActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTodo(values: CreateTodoRequest): Promise<boolean> {
    setLoading(true);
    setError(null);
    const previousState = getTodosStoreState();
    const tempId = createClientId('temp:todo:');
    const optimisticTodo: UiTodo = {
      id: tempId,
      title: values.title,
      description: values.description ?? null,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdById: 'temp',
      completedById: null,
      createdByName: 'Siz',
      completedByName: null,
    };

    setTodosStoreState((state) => ({
      ...state,
      todos: [optimisticTodo, ...state.todos],
    }));

    try {
      const created = await unwrapApiResponse(
        apiPost<CreateTodoResponse, CreateTodoRequest>('/api/todos', values),
      );

      setTodosStoreState((state) => ({
        ...state,
        todos: state.todos.map((todo) => (todo.id === tempId ? mapTodoToUi(created) : todo)),
      }));
      clearCache('/api/todos');
      return true;
    } catch (mutationError) {
      setTodosStoreState(previousState);
      const message = getApiErrorMessage(mutationError, 'Todo eklenemedi');
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function updateTodo(id: string, values: UpdateTodoRequest): Promise<boolean> {
    setLoading(true);
    setError(null);
    const previousState = getTodosStoreState();

    setTodosStoreState((state) => ({
      ...state,
      todos: state.todos.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              title: values.title ?? todo.title,
              description: values.description === undefined ? todo.description : values.description,
              isCompleted: values.is_completed ?? todo.isCompleted,
              updatedAt: new Date().toISOString(),
            }
          : todo,
      ),
    }));

    try {
      const updated = await unwrapApiResponse(
        apiPatch<UpdateTodoResponse, UpdateTodoRequest>(`/api/todos/${id}`, values),
      );

      setTodosStoreState((state) => ({
        ...state,
        todos: state.todos.map((todo) => (todo.id === id ? mapTodoToUi(updated) : todo)),
      }));
      clearCache('/api/todos');
      return true;
    } catch (mutationError) {
      setTodosStoreState(previousState);
      const message = getApiErrorMessage(mutationError, 'Todo güncellenemedi');
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function deleteTodo(id: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    const previousState = getTodosStoreState();

    setTodosStoreState((state) => ({
      ...state,
      todos: state.todos.filter((todo) => todo.id !== id),
    }));

    try {
      await unwrapApiResponse(apiDelete<DeleteTodoResponse>(`/api/todos/${id}`));
      clearCache('/api/todos');
      return true;
    } catch (mutationError) {
      setTodosStoreState(previousState);
      const message = getApiErrorMessage(mutationError, 'Todo silinemedi');
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    addTodo,
    updateTodo,
    deleteTodo,
    loading,
    error,
  };
}
