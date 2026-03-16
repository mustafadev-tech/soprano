'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { TodoBoard } from '@/components/todos/TodoBoard';
import { useTodoActions } from '@/hooks/todos/useTodoActions';
import { useTodos } from '@/hooks/todos/useTodos';

export default function TodosPage() {
  const { todos, error: todoError } = useTodos();
  const { addTodo, updateTodo, deleteTodo, error: actionError } = useTodoActions();
  const lastErrorRef = useRef<string | null>(null);
  const pageError = actionError ?? todoError;

  useEffect(() => {
    if (pageError && pageError !== lastErrorRef.current) {
      toast.error(pageError);
      lastErrorRef.current = pageError;
      return;
    }

    if (!pageError) {
      lastErrorRef.current = null;
    }
  }, [pageError]);

  return (
    <div className="px-4 py-6 sm:p-6">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold">Yapılacaklar</h1>
        <p className="text-sm text-muted-foreground">
          Salon içinde takip edilmesi gereken işleri tek listede yönetin.
        </p>
      </div>

      <TodoBoard
        todos={todos}
        onCreate={async ({ title, description }) => {
          await addTodo({ title, description });
        }}
        onUpdate={async (id, values) => {
          await updateTodo(id, {
            title: values.title,
            description: values.description,
            is_completed: values.isCompleted,
          });
        }}
        onDelete={async (id) => {
          await deleteTodo(id);
        }}
      />
    </div>
  );
}
