'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { MenuManager } from '@/components/menu/MenuManager';
import { useMenu } from '@/hooks/menu/useMenu';
import { useMenuActions } from '@/hooks/menu/useMenuActions';
import {
  findCategoryIdByKind,
  getCategoryKind,
  toCreateMenuItemRequest,
  toUpdateMenuItemRequest,
  type UiCategoryOption,
  type UiMenuItem,
} from '@/types/api';

export default function MenuPage() {
  const { categories, menuItems, error: menuError, refetch } = useMenu();
  const { addItem, editItem, deleteItem, addCategory, editCategory, deleteCategory, error: actionError } = useMenuActions(refetch);
  const pageError = actionError ?? menuError;
  const lastErrorRef = useRef<string | null>(null);

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

  const uiCategories: UiCategoryOption[] = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    kind: getCategoryKind(cat),
    sortOrder: cat.sort_order,
  }));

  async function handleAdd(item: Omit<UiMenuItem, 'id' | 'categoryId'>) {
    const categoryId = findCategoryIdByKind(categories, item.category);

    if (!categoryId) {
      return;
    }

    const createdItem = await addItem(
      toCreateMenuItemRequest(categoryId, {
        name: item.name,
        price: item.price,
        description: item.description,
      }),
    );

    if (createdItem && item.available === false) {
      await editItem(createdItem.id, { is_available: false });
    }
  }

  async function handleUpdate(id: string, updates: Partial<UiMenuItem>) {
    await editItem(id, toUpdateMenuItemRequest(updates));
  }

  async function handleDelete(id: string) {
    await deleteItem(id);
  }

  async function handleAddCategory(name: string) {
    await addCategory(name);
  }

  async function handleUpdateCategory(id: string, name: string) {
    await editCategory(id, name);
  }

  async function handleDeleteCategory(id: string) {
    await deleteCategory(id);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Menü Yönetimi</h1>
      <MenuManager
        menuItems={menuItems}
        categories={uiCategories}
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
      />
    </div>
  );
}
