import { useState } from 'react';
import { toast } from 'sonner';

import { createClientId } from '@/lib/clientId';
import { createOptimisticUpdate } from '@/lib/optimisticState';
import {
  apiDelete,
  apiPatch,
  apiPost,
  clearCache,
  getApiErrorMessage,
  unwrapApiResponse,
} from '@/lib/apiClient';
import type {
  Category,
  CreateCategoryRequest,
  CreateCategoryResponse,
  CreateMenuItemRequest,
  CreateMenuItemResponse,
  DeleteCategoryResponse,
  DeleteMenuItemResponse,
  MenuItem,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  UpdateMenuItemRequest,
  UpdateMenuItemResponse,
} from '@/types/contract';
import { mapMenuItemToUi, type UiMenuItem } from '@/types/api';
import { getMenuStoreState, setMenuStoreState } from '@/hooks/menu/useMenu';

interface UseMenuActionsResult {
  addItem: (data: CreateMenuItemRequest) => Promise<MenuItem | null>;
  editItem: (id: string, data: UpdateMenuItemRequest) => Promise<MenuItem | null>;
  deleteItem: (id: string) => Promise<boolean>;
  addCategory: (name: string) => Promise<Category | null>;
  editCategory: (id: string, name: string) => Promise<Category | null>;
  deleteCategory: (id: string) => Promise<boolean>;
  toggleAvailable: (id: string) => Promise<MenuItem | null>;
  loading: boolean;
  error: string | null;
}

export function useMenuActions(_refetch?: () => Promise<void>): UseMenuActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addItem(data: CreateMenuItemRequest): Promise<MenuItem | null> {
    setLoading(true);
    setError(null);

    const previousState = getMenuStoreState();
    const optimisticCategory = previousState.categories.find((category) => category.id === data.category_id);
    const tempId = createClientId('temp:');
    const optimisticItem: UiMenuItem = {
      id: tempId,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      available: true,
      imageUrl: null,
      categoryId: data.category_id,
      categoryName: optimisticCategory?.name ?? 'Bilinmeyen Kategori',
      isOptimistic: true,
    };

    setMenuStoreState((state) => ({
      ...state,
      menuItems: [...state.menuItems, optimisticItem],
    }));

    try {
      const createdItem = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () =>
          unwrapApiResponse(apiPost<CreateMenuItemResponse, CreateMenuItemRequest>('/api/menu/items', data)),
        onSuccess: (result) => {
          const categoriesById = new Map(getMenuStoreState().categories.map((category) => [category.id, category] as const));
          const mappedItem = mapMenuItemToUi(result, categoriesById);

          setMenuStoreState((state) => ({
            ...state,
            menuItems: state.menuItems.map((item) => (item.id === tempId ? mappedItem : item)),
          }));
          clearCache('/api/menu');
          toast.success('Ürün menüye eklendi');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return createdItem;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function editItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem | null> {
    setLoading(true);
    setError(null);

    const previousState = getMenuStoreState();
    const nextCategory = data.category_id
      ? previousState.categories.find((category) => category.id === data.category_id)
      : null;

    setMenuStoreState((state) => ({
      ...state,
      menuItems: state.menuItems.map((item) =>
        item.id === id
          ? {
              ...item,
              categoryId: data.category_id ?? item.categoryId,
              categoryName: nextCategory?.name ?? item.categoryName,
              name: data.name ?? item.name,
              price: data.price ?? item.price,
              description: data.description === undefined ? item.description : data.description,
              available: data.is_available ?? item.available,
            }
          : item,
      ),
    }));

    try {
      const updatedItem = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () =>
          unwrapApiResponse(apiPatch<UpdateMenuItemResponse, UpdateMenuItemRequest>(`/api/menu/items/${id}`, data)),
        onSuccess: (result) => {
          const categoriesById = new Map(
            getMenuStoreState().categories.map((category) => [category.id, category] as const),
          );
          const mappedItem = mapMenuItemToUi(result, categoriesById);

          setMenuStoreState((state) => ({
            ...state,
            menuItems: state.menuItems.map((item) => (item.id === id ? mappedItem : item)),
          }));
          clearCache('/api/menu');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return updatedItem;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    const previousState = getMenuStoreState();

    setMenuStoreState((state) => ({
      ...state,
      menuItems: state.menuItems.filter((item) => item.id !== id),
    }));

    try {
      await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () => {
          await unwrapApiResponse(apiDelete<DeleteMenuItemResponse>(`/api/menu/items/${id}`));
          return true;
        },
        onSuccess: () => {
          clearCache('/api/menu');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function addCategory(name: string): Promise<Category | null> {
    setLoading(true);
    setError(null);
    const previousState = getMenuStoreState();
    const tempId = createClientId('temp:');

    setMenuStoreState((state) => ({
      ...state,
      categories: [
        ...state.categories,
        {
          id: tempId,
          name,
          sort_order: state.categories.length,
          created_at: new Date().toISOString(),
        },
      ],
    }));

    try {
      const createdCategory = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () =>
          unwrapApiResponse(apiPost<CreateCategoryResponse, CreateCategoryRequest>('/api/menu/categories', { name })),
        onSuccess: (result) => {
          setMenuStoreState((state) => ({
            ...state,
            categories: state.categories.map((category) =>
              category.id === tempId ? result : category,
            ),
          }));
          clearCache('/api/menu');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return createdCategory;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function editCategory(id: string, name: string): Promise<Category | null> {
    setLoading(true);
    setError(null);
    const previousState = getMenuStoreState();

    setMenuStoreState((state) => ({
      ...state,
      categories: state.categories.map((category) =>
        category.id === id ? { ...category, name } : category,
      ),
    }));

    try {
      const updatedCategory = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () =>
          unwrapApiResponse(
            apiPatch<UpdateCategoryResponse, UpdateCategoryRequest>(`/api/menu/categories/${id}`, { name }),
          ),
        onSuccess: () => {
          clearCache('/api/menu');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return updatedCategory;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function deleteCategory(id: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    const previousState = getMenuStoreState();

    setMenuStoreState((state) => ({
      ...state,
      categories: state.categories.filter((category) => category.id !== id),
      menuItems: state.menuItems.filter((item) => item.categoryId !== id),
    }));

    try {
      await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getMenuStoreState(),
        apiCall: async () => {
          await unwrapApiResponse(apiDelete<DeleteCategoryResponse>(`/api/menu/categories/${id}`));
          return true;
        },
        onSuccess: () => {
          clearCache('/api/menu');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Menü güncellenemedi'));
          toast.error('Menü güncellenemedi');
        },
        onRollback: (state) => {
          setMenuStoreState(state);
        },
      });

      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function toggleAvailable(id: string): Promise<MenuItem | null> {
    const currentItem = getMenuStoreState().menuItems.find((item) => item.id === id);

    if (!currentItem) {
      return null;
    }

    return editItem(id, { is_available: !currentItem.available });
  }

  return {
    addItem,
    editItem,
    deleteItem,
    addCategory,
    editCategory,
    deleteCategory,
    toggleAvailable,
    loading,
    error,
  };
}
