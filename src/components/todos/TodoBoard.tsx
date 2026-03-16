'use client';

import { useMemo, useState } from 'react';
import { CheckSquare, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

import { RoleGate } from '@/components/auth/RoleGate';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { UiTodo } from '@/types/api';

interface TodoBoardProps {
  todos: UiTodo[];
  onCreate: (values: { title: string; description: string | null }) => Promise<void>;
  onUpdate: (id: string, values: { title?: string; description?: string | null; isCompleted?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface TodoFormState {
  title: string;
  description: string;
}

const emptyForm: TodoFormState = {
  title: '',
  description: '',
};

export function TodoBoard({
  todos,
  onCreate,
  onUpdate,
  onDelete,
}: TodoBoardProps) {
  const [form, setForm] = useState<TodoFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<TodoFormState>(emptyForm);

  const [pendingTodoIds, completedTodoIds] = useMemo(() => {
    const pending = todos.filter((todo) => !todo.isCompleted);
    const completed = todos.filter((todo) => todo.isCompleted);
    return [pending, completed];
  }, [todos]);

  async function handleCreate(): Promise<void> {
    if (!form.title.trim()) {
      return;
    }

    await onCreate({
      title: form.title.trim(),
      description: form.description.trim() || null,
    });
    setForm(emptyForm);
  }

  function startEditing(todo: UiTodo): void {
    setEditingId(todo.id);
    setEditingForm({
      title: todo.title,
      description: todo.description ?? '',
    });
  }

  async function handleSaveEdit(todoId: string): Promise<void> {
    if (!editingForm.title.trim()) {
      return;
    }

    await onUpdate(todoId, {
      title: editingForm.title.trim(),
      description: editingForm.description.trim() || null,
    });
    setEditingId(null);
    setEditingForm(emptyForm);
  }

  function renderTodo(todo: UiTodo): React.ReactNode {
    const isEditing = editingId === todo.id;

    return (
      <div
        key={todo.id}
        className={cn(
          'rounded-3xl border border-border bg-card/60 p-4 shadow-sm transition-colors',
          todo.isCompleted && 'border-emerald-500/20 bg-emerald-500/5',
        )}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            checked={todo.isCompleted}
            onCheckedChange={(checked) => {
              void onUpdate(todo.id, { isCompleted: Boolean(checked) });
            }}
            className="mt-1"
          />

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="space-y-3">
                <Input
                  value={editingForm.title}
                  onChange={(event) =>
                    setEditingForm((state) => ({ ...state, title: event.target.value }))
                  }
                  placeholder="Todo başlığı"
                />
                <textarea
                  value={editingForm.description}
                  onChange={(event) =>
                    setEditingForm((state) => ({ ...state, description: event.target.value }))
                  }
                  placeholder="Açıklama"
                  className="min-h-[92px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3
                    className={cn(
                      'text-base font-medium text-foreground',
                      todo.isCompleted && 'text-muted-foreground line-through',
                    )}
                  >
                    {todo.title}
                  </h3>
                </div>
                {todo.description ? (
                  <p
                    className={cn(
                      'text-sm leading-6 text-muted-foreground',
                      todo.isCompleted && 'line-through',
                    )}
                  >
                    {todo.description}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Ekleyen: {todo.createdByName ?? 'Bilinmiyor'}</span>
                  {todo.isCompleted && todo.completedByName ? (
                    <span>Tamamlayan: {todo.completedByName}</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <RoleGate allowed={['soprano_admin']}>
            <div className="flex items-center gap-1">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleSaveEdit(todo.id)}
                    aria-label="Kaydet"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingId(null);
                      setEditingForm(emptyForm);
                    }}
                    aria-label="İptal"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEditing(todo)}
                    aria-label="Düzenle"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void onDelete(todo.id)}
                    aria-label="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </RoleGate>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RoleGate allowed={['soprano_admin']}>
        <section className="rounded-[2rem] border border-border bg-card/60 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Yeni Todo</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-start">
            <Input
              value={form.title}
              onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
              placeholder="Başlık"
            />
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((state) => ({ ...state, description: event.target.value }))
              }
              placeholder="Açıklama"
              className="min-h-[92px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <Button
              onClick={() => void handleCreate()}
              className="h-11 rounded-2xl md:self-end"
            >
              Ekle
            </Button>
          </div>
        </section>
      </RoleGate>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Açık İşler</h2>
        </div>
        <div className="grid gap-3">
          {pendingTodoIds.length > 0 ? (
            pendingTodoIds.map((todo) => renderTodo(todo))
          ) : (
            <p className="rounded-3xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
              Açık todo bulunmuyor.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-emerald-500" />
          <h2 className="text-lg font-semibold">Tamamlananlar</h2>
        </div>
        <div className="grid gap-3">
          {completedTodoIds.length > 0 ? (
            completedTodoIds.map((todo) => renderTodo(todo))
          ) : (
            <p className="rounded-3xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
              Tamamlanan todo bulunmuyor.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
