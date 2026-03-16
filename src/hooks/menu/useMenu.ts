import { useCallback, useEffect, useState } from 'react';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import type { Category, GetMenuResponse } from '@/types/contract';
import { flattenMenuCategories, type UiMenuItem } from '@/types/api';

interface MenuStoreState {
  categories: Category[];
  menuItems: UiMenuItem[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

const listeners = new Set<() => void>();

let menuStore: MenuStoreState = {
  categories: [],
  menuItems: [],
  loading: true,
  error: null,
  initialized: false,
};

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function getMenuStoreState(): MenuStoreState {
  return menuStore;
}

export function setMenuStoreState(
  updater: MenuStoreState | ((state: MenuStoreState) => MenuStoreState),
) {
  menuStore = typeof updater === 'function' ? updater(menuStore) : updater;
  notifyListeners();
}

export async function refetchMenuStore(options?: { fresh?: boolean }): Promise<void> {
  setMenuStoreState((state) => ({
    ...state,
    loading: true,
    error: null,
  }));

  try {
    const data = await unwrapApiResponse(
      apiGet<GetMenuResponse>('/api/menu', {
        cacheTTL: options?.fresh ? 0 : 30000,
      }),
    );
    const uiData = flattenMenuCategories(data);

    setMenuStoreState({
      categories: data.map(({ id, name, sort_order, created_at }) => ({ id, name, sort_order, created_at })),
      menuItems: uiData.menuItems,
      loading: false,
      error: null,
      initialized: true,
    });
  } catch (fetchError) {
    setMenuStoreState({
      categories: [],
      menuItems: [],
      loading: false,
      error: getApiErrorMessage(fetchError, 'Veriler yuklenemedi'),
      initialized: true,
    });
  }
}

interface UseMenuResult {
  categories: Category[];
  menuItems: UiMenuItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMenu(): UseMenuResult {
  const [snapshot, setSnapshot] = useState<MenuStoreState>(menuStore);

  useEffect(() => {
    const listener = () => {
      setSnapshot(getMenuStoreState());
    };

    listeners.add(listener);
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refetch = useCallback(async () => {
    await refetchMenuStore({ fresh: true });
  }, []);

  useEffect(() => {
    if (!getMenuStoreState().initialized) {
      void refetchMenuStore();
    }
  }, []);

  return {
    categories: snapshot.categories,
    menuItems: snapshot.menuItems,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
