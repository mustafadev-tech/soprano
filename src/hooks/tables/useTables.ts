import { useCallback, useEffect, useState } from 'react';

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import { toNumber, toNullableString } from '@/lib/typeConversions';
import {
  listOrderDrafts,
  removeOrderDraftByOrderId,
} from '@/lib/orderDraftStorage';
import {
  buildRealtimeChannelName,
  subscribeToRealtimeChannel,
} from '@/lib/supabaseRealtime';
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
  syncError: string | null;
  initialized: boolean;
}

interface TableRealtimeRow {
  id?: string;
  name?: string;
  capacity?: number | string;
  status?: 'empty' | 'occupied' | 'reserved';
  created_at?: string;
  deleted_at?: string | null;
}

interface OrderRealtimeRow {
  id?: string;
  table_id?: string;
  status?: 'open' | 'closed';
  payment_method?: 'cash' | 'credit_card' | null;
  total_amount?: number | string;
  opened_at?: string;
}

interface OrderItemRealtimeRow {
  id?: string;
  order_id?: string;
  quantity?: number | string;
}

const listeners = new Set<() => void>();

let tablesStore: TablesStoreState = {
  tables: [],
  orders: [],
  loading: true,
  error: null,
  syncError: null,
  initialized: false,
};

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function toUiTableStatus(status: TableRealtimeRow['status']): UiTable['status'] {
  switch (status) {
    case 'empty':
      return 'available';
    case 'occupied':
      return 'occupied';
    case 'reserved':
      return 'reserved';
    default:
      return 'dirty';
  }
}

function getTableNumber(name: string, fallbackNumber: number): number {
  const match = name.match(/(\d+)/);

  if (match) {
    const parsedValue = Number(match[1]);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return fallbackNumber;
}

function shouldReleaseDraftTable(total: number, itemCount: number): boolean {
  return total <= 0 || itemCount <= 0;
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
    const existingOrderIndex = orders.findIndex((order) => order.tableId === draft.tableId);

    if (existingOrderIndex >= 0 && draft.pendingItems.length === 0) {
      continue;
    }

    if (shouldReleaseDraftTable(draft.order.total, itemCount)) {
      if (existingOrderIndex >= 0) {
        orders.splice(existingOrderIndex, 1);
      }
      tables[tableIndex] = {
        ...tables[tableIndex],
        status: 'available',
        currentOrderId: null,
      };
      continue;
    }

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

function setTablesServerState(updater: (state: TablesStoreState) => TablesStoreState) {
  setTablesStoreState((state) => applyDraftsToTablesState(updater(state)));
}

function createUiTableFromRealtimeRow(
  row: TableRealtimeRow,
  currentState: TablesStoreState,
  existingTable?: UiTable,
): UiTable | null {
  const id = toNullableString(row.id);
  const name = toNullableString(row.name);

  if (!id || !name) {
    return null;
  }

  const matchingOrder = currentState.orders.find((order) => order.tableId === id);
  const fallbackNumber =
    currentState.tables.reduce((maxNumber, table) => Math.max(maxNumber, table.number), 0) + 1;

  return {
    id,
    name,
    number: getTableNumber(name, existingTable?.number ?? fallbackNumber),
    capacity: Math.max(0, toNumber(row.capacity)),
    status: toUiTableStatus(row.status),
    currentOrderId: matchingOrder?.id ?? existingTable?.currentOrderId ?? null,
  };
}

function removeOrderFromTablesState(
  state: TablesStoreState,
  orderId: string,
  tableId?: string | null,
): TablesStoreState {
  const existingOrder = state.orders.find((order) => order.id === orderId) ?? null;
  const resolvedTableId = tableId ?? existingOrder?.tableId ?? null;

  return {
    ...state,
    tables: state.tables.map((table) =>
      table.id === resolvedTableId
        ? {
            ...table,
            status: 'available',
            currentOrderId: null,
          }
        : table,
    ),
    orders: state.orders.filter((order) => order.id !== orderId),
  };
}

function upsertOrderInTablesState(
  state: TablesStoreState,
  row: OrderRealtimeRow,
): TablesStoreState | null {
  const orderId = toNullableString(row.id);
  const tableId = toNullableString(row.table_id);

  if (!orderId || !tableId) {
    return null;
  }

  if (row.status === 'closed') {
    removeOrderDraftByOrderId(orderId);
    return removeOrderFromTablesState(state, orderId, tableId);
  }

  const existingOrder =
    state.orders.find((order) => order.id === orderId) ??
    state.orders.find((order) => order.tableId === tableId) ??
    null;

  const nextOrder: UiOpenOrder = {
    id: orderId,
    tableId,
    status: 'open',
    total: toNumber(row.total_amount),
    itemCount: existingOrder?.itemCount ?? 0,
    paymentMethod: row.payment_method ?? null,
    openedAt: toNullableString(row.opened_at) ?? existingOrder?.openedAt ?? new Date().toISOString(),
  };

  return {
    ...state,
    tables: state.tables.map((table) =>
      table.id === tableId
        ? {
            ...table,
            status: 'occupied',
            currentOrderId: orderId,
          }
        : table,
    ),
    orders: [
      ...state.orders.filter((order) => order.id !== orderId && order.tableId !== tableId),
      nextOrder,
    ],
  };
}

function updateOrderItemCount(
  state: TablesStoreState,
  orderId: string,
  quantityDelta: number,
): TablesStoreState | null {
  if (quantityDelta === 0) {
    return state;
  }

  const targetOrderIndex = state.orders.findIndex((order) => order.id === orderId);

  if (targetOrderIndex === -1) {
    return null;
  }

  const nextOrders = [...state.orders];
  const targetOrder = nextOrders[targetOrderIndex];

  nextOrders[targetOrderIndex] = {
    ...targetOrder,
    itemCount: Math.max(0, targetOrder.itemCount + quantityDelta),
  };

  return {
    ...state,
    orders: nextOrders,
  };
}

function getQuantityDeltaFromOrderItemPayload(
  payload: RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
): { orderId: string; quantityDelta: number } | null {
  if (payload.eventType === 'INSERT') {
    const orderId = toNullableString(payload.new.order_id);
    const quantity = toNumber(payload.new.quantity);

    if (!orderId || quantity <= 0) {
      return null;
    }

    return {
      orderId,
      quantityDelta: quantity,
    };
  }

  if (payload.eventType === 'UPDATE') {
    const orderId = toNullableString(payload.new.order_id);
    const nextQuantity = toNumber(payload.new.quantity);
    const previousQuantity = toNumber(payload.old.quantity);

    if (!orderId) {
      return null;
    }

    if (payload.old.quantity === undefined) {
      return null;
    }

    return {
      orderId,
      quantityDelta: nextQuantity - previousQuantity,
    };
  }

  const orderId = toNullableString(payload.old.order_id);

  if (!orderId) {
    return null;
  }

  if (payload.old.quantity === undefined) {
    return { orderId, quantityDelta: 0 };
  }

  const quantity = toNumber(payload.old.quantity);

  return {
    orderId,
    quantityDelta: -quantity,
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

export async function refetchTablesStore(options?: {
  fresh?: boolean;
  background?: boolean;
}): Promise<void> {
  if (!options?.background) {
    setTablesStoreState((state) => ({
      ...state,
      loading: true,
      error: null,
    }));
  }

  try {
    const data = await unwrapApiResponse(
      apiGet<GetTablesResponse>('/api/tables', {
        cacheTTL: options?.fresh ? 0 : 5000,
      }),
    );

    setTablesStoreState(
      applyDraftsToTablesState({
        tables: data.map((table, index) => mapTableDetailToUi(table, index)),
        orders: data
          .filter((table) => table.open_order)
          .map((table) => mapOpenOrderSummaryToUi(table.id, table.open_order!)),
        loading: false,
        error: null,
        syncError: getTablesStoreState().syncError,
        initialized: true,
      }),
    );
  } catch (fetchError) {
    const currentState = getTablesStoreState();

    if (options?.background && currentState.initialized) {
      return;
    }

    setTablesStoreState({
      tables: [],
      orders: [],
      loading: false,
      error: getApiErrorMessage(fetchError, 'Veriler yuklenemedi'),
      syncError: currentState.syncError,
      initialized: true,
    });
  }
}

interface UseTablesResult {
  tables: UiTable[];
  orders: UiOpenOrder[];
  loading: boolean;
  error: string | null;
  syncError: string | null;
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    let hasSubscribed = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const setSyncError = (message: string | null) => {
      setTablesStoreState((state) => ({
        ...state,
        syncError: message,
      }));
    };

    const healTablesState = () => {
      void refetchTablesStore({ fresh: true, background: true });
    };

    void (async () => {
      try {
        const subscription = await subscribeToRealtimeChannel({
          channelName: buildRealtimeChannelName('tables-sync'),
          bindings: [
            {
              event: '*',
              schema: 'public',
              table: 'tables',
              callback: (payload) => {
                if (cancelled) {
                  return;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedTableId = toNullableString(payload.old.id);

                  if (!deletedTableId) {
                    healTablesState();
                    return;
                  }

                  setTablesServerState((state) => ({
                    ...state,
                    tables: state.tables.filter((table) => table.id !== deletedTableId),
                    orders: state.orders.filter((order) => order.tableId !== deletedTableId),
                  }));
                  return;
                }

                const tableRow = payload.new as TableRealtimeRow;
                const deletedAt = tableRow.deleted_at;

                if (deletedAt) {
                  const deletedTableId = toNullableString(tableRow.id);

                  if (!deletedTableId) {
                    healTablesState();
                    return;
                  }

                  setTablesServerState((state) => ({
                    ...state,
                    tables: state.tables.filter((table) => table.id !== deletedTableId),
                    orders: state.orders.filter((order) => order.tableId !== deletedTableId),
                  }));
                  return;
                }

                setTablesServerState((state) => {
                  const existingTable = state.tables.find((table) => table.id === tableRow.id);
                  const nextTable = createUiTableFromRealtimeRow(tableRow, state, existingTable);

                  if (!nextTable) {
                    healTablesState();
                    return state;
                  }

                  const existingIndex = state.tables.findIndex((table) => table.id === nextTable.id);

                  if (existingIndex === -1) {
                    return {
                      ...state,
                      tables: [...state.tables, nextTable],
                    };
                  }

                  const nextTables = [...state.tables];
                  nextTables[existingIndex] = {
                    ...existingTable,
                    ...nextTable,
                  };

                  return {
                    ...state,
                    tables: nextTables,
                  };
                });
              },
            },
            {
              event: '*',
              schema: 'public',
              table: 'orders',
              callback: (payload) => {
                if (cancelled) {
                  return;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedOrderId = toNullableString(payload.old.id);

                  if (!deletedOrderId) {
                    healTablesState();
                    return;
                  }

                  removeOrderDraftByOrderId(deletedOrderId);
                  setTablesServerState((state) =>
                    removeOrderFromTablesState(
                      state,
                      deletedOrderId,
                      toNullableString(payload.old.table_id),
                    ),
                  );
                  return;
                }

                setTablesServerState((state) => {
                  const nextState = upsertOrderInTablesState(
                    state,
                    payload.new as OrderRealtimeRow,
                  );

                  if (!nextState) {
                    healTablesState();
                    return state;
                  }

                  return nextState;
                });
              },
            },
            {
              event: '*',
              schema: 'public',
              table: 'order_items',
              callback: (payload) => {
                if (cancelled) {
                  return;
                }

                const quantityDelta = getQuantityDeltaFromOrderItemPayload(
                  payload as RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
                );

                if (!quantityDelta) {
                  healTablesState();
                  return;
                }

                setTablesServerState((state) => {
                  const nextState = updateOrderItemCount(
                    state,
                    quantityDelta.orderId,
                    quantityDelta.quantityDelta,
                  );

                  if (!nextState) {
                    healTablesState();
                    return state;
                  }

                  return nextState;
                });
              },
            },
          ],
          onStatusChange: (status, error) => {
            if (cancelled) {
              return;
            }

            switch (status) {
              case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
                setSyncError(null);
                if (hasSubscribed) {
                  healTablesState();
                }
                hasSubscribed = true;
                break;
              case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
                console.error('Tables realtime channel error', error);
                setSyncError('Canli masa senkronizasyonu kesildi');
                break;
              case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
                console.warn('Tables realtime channel timed out', error);
                setSyncError('Canli masa senkronizasyonu zaman asimina ugradi');
                break;
              case REALTIME_SUBSCRIBE_STATES.CLOSED:
                console.warn('Tables realtime channel closed');
                setSyncError('Canli masa senkronizasyonu kapandi');
                break;
            }
          },
        });

        if (cancelled) {
          await subscription.unsubscribe();
          return;
        }

        unsubscribe = subscription.unsubscribe;
      } catch (subscriptionError) {
        if (cancelled) {
          return;
        }

        console.error('Tables realtime aboneligi baslatilamadi', subscriptionError);
        setSyncError('Canli masa senkronizasyonu baslatilamadi');
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        void unsubscribe();
      }
    };
  }, []);

  return {
    tables: snapshot.tables,
    orders: snapshot.orders,
    loading: snapshot.loading,
    error: snapshot.error,
    syncError: snapshot.syncError,
    refetch,
  };
}
