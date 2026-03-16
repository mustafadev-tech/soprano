import { useCallback, useEffect, useState } from 'react';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import { listOrderDrafts } from '@/lib/orderDraftStorage';
import type { GetTablesResponse } from '@/types/contract';
import {
  mapOpenOrderSummaryToUi,
  mapTableDetailToUi,
  type UiOpenOrder,
  type UiTable,
} from '@/types/api';

interface TablesStoreState {
  tables: UiTable[];
  orders: UiOpenOrder[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

const listeners = new Set<() => void>();

let tablesStore: TablesStoreState = {
  tables: [],
  orders: [],
  loading: true,
  error: null,
  initialized: false,
};

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function applyDraftsToTablesState(state: TablesStoreState): TablesStoreState {
  const drafts = listOrderDrafts();

  if (!drafts.length) {
    return state;
  }

  const tables = [...state.tables];
  const orders = [...state.orders];

  for (const draft of drafts) {
    const tableIndex = tables.findIndex((table) => table.id === draft.tableId);

    if (tableIndex === -1 || draft.order.status === 'paid') {
      continue;
    }

    const itemCount = draft.order.items.reduce((sum, item) => sum + item.quantity, 0);
    tables[tableIndex] = {
      ...tables[tableIndex],
      status: 'occupied',
      currentOrderId: draft.order.id,
    };

    const nextOrder = {
      id: draft.order.id,
      tableId: draft.order.tableId,
      status: draft.order.status,
      total: draft.order.total,
      itemCount,
      paymentMethod: draft.order.paymentMethod,
      openedAt: draft.order.createdAt,
    };

    const existingOrderIndex = orders.findIndex((order) => order.tableId === draft.tableId);

    if (existingOrderIndex >= 0) {
      orders[existingOrderIndex] = nextOrder;
    } else {
      orders.push(nextOrder);
    }
  }

  return {
    ...state,
    tables,
    orders,
  };
}

export function getTablesStoreState(): TablesStoreState {
  return tablesStore;
}

export function setTablesStoreState(
  updater: TablesStoreState | ((state: TablesStoreState) => TablesStoreState),
) {
  tablesStore = typeof updater === 'function' ? updater(tablesStore) : updater;
  notifyListeners();
}

export async function refetchTablesStore(options?: { fresh?: boolean }): Promise<void> {
  setTablesStoreState((state) => ({
    ...state,
    loading: true,
    error: null,
  }));

  try {
    const data = await unwrapApiResponse(
      apiGet<GetTablesResponse>('/api/tables', {
        cacheTTL: options?.fresh ? 0 : 5000,
      }),
    );

    setTablesStoreState(applyDraftsToTablesState({
      tables: data.map((table, index) => mapTableDetailToUi(table, index)),
      orders: data
        .filter((table) => table.open_order)
        .map((table) => mapOpenOrderSummaryToUi(table.id, table.open_order!)),
      loading: false,
      error: null,
      initialized: true,
    }));
  } catch (fetchError) {
    setTablesStoreState({
      tables: [],
      orders: [],
      loading: false,
      error: getApiErrorMessage(fetchError, 'Veriler yuklenemedi'),
      initialized: true,
    });
  }
}

interface UseTablesResult {
  tables: UiTable[];
  orders: UiOpenOrder[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTables(): UseTablesResult {
  const [snapshot, setSnapshot] = useState<TablesStoreState>(tablesStore);

  useEffect(() => {
    const listener = () => {
      setSnapshot(getTablesStoreState());
    };

    listeners.add(listener);
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refetch = useCallback(async () => {
    await refetchTablesStore({ fresh: true });
  }, []);

  useEffect(() => {
    if (!getTablesStoreState().initialized) {
      void refetchTablesStore();
    }
  }, []);

  return {
    tables: snapshot.tables,
    orders: snapshot.orders,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
