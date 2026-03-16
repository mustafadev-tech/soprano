'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { MenuManager } from '@/components/menu/MenuManager';
import { useUser } from '@/hooks/auth/useUser';
import { useMenu } from '@/hooks/menu/useMenu';
import { useMenuActions } from '@/hooks/menu/useMenuActions';
import {
  toCreateMenuItemRequest,
  toUpdateMenuItemRequest,
  type UiCategoryOption,
  type UiMenuItem,
} from '@/types/api';

export default function MenuPage() {
  return <MenuContentPage />;
}

function MenuContentPage() {
  const { role } = useUser();
  const canManage = role === 'soprano_admin';
  const { categories, menuItems, error: menuError, refetch } = useMenu();
  const { addItem, editItem, deleteItem, addCategory, editCategory, deleteCategory, error: actionError } = useMenuActions(refetch);
  const pageError = (canManage ? actionError : null) ?? menuError;
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
    sortOrder: cat.sort_order,
  }));

  async function handleAdd(item: Pick<UiMenuItem, 'name' | 'description' | 'price' | 'available' | 'categoryId'>) {
    if (!item.categoryId) {
      return;
    }

    const createdItem = await addItem(
      toCreateMenuItemRequest(item.categoryId, {
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
    <div className="overflow-x-hidden px-4 py-6 sm:p-6">
      <h1 className="mb-2 text-2xl font-semibold">Menü</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {canManage ? 'Ürün ve kategori yönetimi' : 'Menü görüntüleme'}
      </p>
      <MenuManager
        menuItems={menuItems}
        categories={uiCategories}
        canManage={canManage}
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
