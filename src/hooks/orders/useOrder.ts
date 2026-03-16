import { useCallback, useEffect, useState } from 'react';

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import { applyPendingItemsToOrder } from '@/lib/orderSync';
import {
  getOrderDraftByOrderId,
  listOrderDrafts,
  removeOrderDraftByOrderId,
  saveOrderDraft,
} from '@/lib/orderDraftStorage';
import {
  buildRealtimeChannelName,
  subscribeToRealtimeChannel,
} from '@/lib/supabaseRealtime';
import { getMenuStoreState } from '@/hooks/menu/useMenu';
import type { GetOrderByIdResponse } from '@/types/contract';
import { mapOrderDetailToUi, type UiOrder } from '@/types/api';

interface OrderStoreEntry {
  order: UiOrder | null;
  loading: boolean;
  error: string | null;
  syncError: string | null;
  initialized: boolean;
  dirty: boolean;
}

interface OrderRealtimeRow {
  id?: string;
  table_id?: string;
  status?: 'open' | 'closed';
  payment_method?: 'cash' | 'credit_card' | null;
  total_amount?: number | string;
  order_revision?: number | string;
  opened_at?: string;
}

interface OrderItemRealtimeRow {
  id?: string;
  order_id?: string;
  menu_item_id?: string;
  quantity?: number | string;
  unit_price?: number | string;
  note?: string | null;
}

const emptyOrderState: OrderStoreEntry = {
  order: null,
  loading: false,
  error: null,
  syncError: null,
  initialized: false,
  dirty: false,
};

const orderStore = new Map<string, OrderStoreEntry>();
const orderListeners = new Set<() => void>();
let draftsHydrated = false;

function notifyOrderListeners() {
  for (const listener of orderListeners) {
    listener();
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  return 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeOrderItemNote(note?: string | null): string {
  return note?.trim() ?? '';
}

function createOrderItemKey(menuItemId: string, note?: string | null): string {
  return `${menuItemId}::${normalizeOrderItemNote(note)}`;
}

function isTempOrderId(orderId: string): boolean {
  return orderId.startsWith('temp:order:');
}

function shouldApplyIncomingOrder(currentOrder: UiOrder | null, nextOrder: UiOrder | null): boolean {
  if (!nextOrder) {
    return true;
  }

  if (!currentOrder) {
    return true;
  }

  return nextOrder.orderRevision >= currentOrder.orderRevision;
}

function roundOrderTotal(order: UiOrder): UiOrder {
  return {
    ...order,
    total: Number(
      order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2),
    ),
  };
}

function mergeServerOrderWithDraft(orderId: string, serverOrder: UiOrder | null): {
  order: UiOrder | null;
  dirty: boolean;
} {
  const existingDraft = getOrderDraftByOrderId(orderId);

  if (!serverOrder) {
    removeOrderDraftByOrderId(orderId);
    return {
      order: null,
      dirty: false,
    };
  }

  if (serverOrder.status === 'paid') {
    removeOrderDraftByOrderId(orderId);
    return {
      order: serverOrder,
      dirty: false,
    };
  }

  const pendingItems = existingDraft?.pendingItems ?? [];
  const dirty = pendingItems.length > 0;
  const nextOrder =
    dirty
      ? applyPendingItemsToOrder(serverOrder, pendingItems, getMenuStoreState().menuItems) ??
        serverOrder
      : serverOrder;

  if (existingDraft) {
    saveOrderDraft({
      ...existingDraft,
      order: nextOrder,
      updatedAt: Date.now(),
    });
  }

  return {
    order: nextOrder,
    dirty,
  };
}

function ensureDraftsHydrated(): void {
  if (draftsHydrated || typeof window === 'undefined') {
    return;
  }

  for (const draft of listOrderDrafts()) {
    orderStore.set(draft.order.id, {
      order: draft.order,
      loading: false,
      error: null,
      syncError: null,
      initialized: true,
      dirty: draft.pendingItems.length > 0,
    });
  }

  draftsHydrated = true;
}

function buildOrderState(
  orderId: string,
  serverOrder: UiOrder | null,
  currentState: OrderStoreEntry,
  overrides?: Partial<Omit<OrderStoreEntry, 'order' | 'dirty'>>,
): OrderStoreEntry {
  const mergedOrder = mergeServerOrderWithDraft(orderId, serverOrder);

  return {
    ...currentState,
    order: mergedOrder.order,
    loading: overrides?.loading ?? false,
    error: overrides?.error ?? null,
    syncError: overrides?.syncError ?? currentState.syncError,
    initialized: overrides?.initialized ?? true,
    dirty: overrides?.dirty ?? mergedOrder.dirty,
  };
}

function createUiOrderFromRow(currentOrder: UiOrder, row: OrderRealtimeRow): UiOrder | null {
  const id = toNullableString(row.id);
  const tableId = toNullableString(row.table_id);
  const openedAt = toNullableString(row.opened_at);

  if (!id || !tableId || !openedAt) {
    return null;
  }

  return {
    ...currentOrder,
    id,
    tableId,
    status: row.status === 'closed' ? 'paid' : 'open',
    orderRevision: toNumber(row.order_revision),
    createdAt: openedAt,
    total: toNumber(row.total_amount),
    paymentMethod: row.payment_method ?? null,
  };
}

function createUiOrderItemFromRealtimeRow(row: OrderItemRealtimeRow): UiOrder['items'][number] | null {
  const id = toNullableString(row.id);
  const menuItemId = toNullableString(row.menu_item_id);
  const menuItem = menuItemId
    ? getMenuStoreState().menuItems.find((item) => item.id === menuItemId)
    : null;

  if (!id || !menuItemId || !menuItem) {
    return null;
  }

  const unitPrice =
    row.unit_price !== undefined ? toNumber(row.unit_price) : menuItem.price;

  return {
    id,
    menuItemId,
    name: menuItem.name,
    price: unitPrice,
    unitPrice,
    quantity: toNumber(row.quantity),
    note: normalizeOrderItemNote(row.note) || null,
  };
}

function applyRealtimeOrderItemInsert(
  currentOrder: UiOrder,
  row: OrderItemRealtimeRow,
): UiOrder | 'refetch' {
  const nextItem = createUiOrderItemFromRealtimeRow(row);

  if (!nextItem || nextItem.quantity <= 0) {
    return 'refetch';
  }

  const existingIndex = currentOrder.items.findIndex(
    (item) =>
      item.id === nextItem.id ||
      createOrderItemKey(item.menuItemId, item.note) ===
        createOrderItemKey(nextItem.menuItemId, nextItem.note),
  );

  if (existingIndex === -1) {
    return roundOrderTotal({
      ...currentOrder,
      items: [...currentOrder.items, nextItem],
    });
  }

  const nextItems = [...currentOrder.items];
  const existingItem = nextItems[existingIndex];

  nextItems[existingIndex] = {
    ...existingItem,
    quantity:
      existingItem.id === nextItem.id
        ? nextItem.quantity
        : existingItem.quantity + nextItem.quantity,
  };

  return roundOrderTotal({
    ...currentOrder,
    items: nextItems,
  });
}

function applyRealtimeOrderItemUpdate(
  currentOrder: UiOrder,
  payload: RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
): UiOrder | 'refetch' {
  const itemId = toNullableString(payload.new.id);

  if (!itemId) {
    return 'refetch';
  }

  const newKey = payload.new.menu_item_id
    ? createOrderItemKey(payload.new.menu_item_id, payload.new.note)
    : null;
  const oldKey = payload.old.menu_item_id
    ? createOrderItemKey(payload.old.menu_item_id, payload.old.note)
    : null;

  if (newKey && oldKey && newKey !== oldKey) {
    return 'refetch';
  }

  let targetIndex = currentOrder.items.findIndex((item) => item.id === itemId);

  if (targetIndex === -1 && newKey) {
    targetIndex = currentOrder.items.findIndex(
      (item) => createOrderItemKey(item.menuItemId, item.note) === newKey,
    );
  }

  if (targetIndex === -1) {
    return 'refetch';
  }

  const nextQuantity = toNumber(payload.new.quantity);
  const existingItem = currentOrder.items[targetIndex];

  if (payload.new.menu_item_id && payload.new.menu_item_id !== existingItem.menuItemId) {
    return 'refetch';
  }

  const nextItems = [...currentOrder.items];
  nextItems[targetIndex] = {
    ...existingItem,
    quantity: nextQuantity,
    note:
      payload.new.note !== undefined
        ? normalizeOrderItemNote(payload.new.note) || null
        : existingItem.note,
    unitPrice:
      payload.new.unit_price !== undefined
        ? toNumber(payload.new.unit_price)
        : existingItem.unitPrice,
    price:
      payload.new.unit_price !== undefined
        ? toNumber(payload.new.unit_price)
        : existingItem.price,
  };

  return roundOrderTotal({
    ...currentOrder,
    items: nextItems,
  });
}

function applyRealtimeOrderItemDelete(
  currentOrder: UiOrder,
  payload: RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
): UiOrder | 'refetch' {
  const deletedId = toNullableString(payload.old.id);

  if (!deletedId) {
    return 'refetch';
  }

  const targetIndex = currentOrder.items.findIndex((item) => item.id === deletedId);

  if (targetIndex === -1) {
    return currentOrder;
  }

  return roundOrderTotal({
    ...currentOrder,
    items: currentOrder.items.filter((item) => item.id !== deletedId),
  });
}

export function getOrderStoreState(orderId: string | null): OrderStoreEntry {
  ensureDraftsHydrated();

  if (!orderId) {
    return emptyOrderState;
  }

  return orderStore.get(orderId) ?? emptyOrderState;
}

export function setOrderStoreState(
  orderId: string,
  updater: OrderStoreEntry | ((state: OrderStoreEntry) => OrderStoreEntry),
) {
  const currentState = getOrderStoreState(orderId);
  const nextState = typeof updater === 'function' ? updater(currentState) : updater;

  if (currentState.dirty && !nextState.dirty && currentState.order && nextState.order) {
    if (nextState.order.orderRevision <= currentState.order.orderRevision) {
      return;
    }
  }

  if (!shouldApplyIncomingOrder(currentState.order, nextState.order)) {
    return;
  }

  orderStore.set(orderId, nextState);
  notifyOrderListeners();
}

export function commitOrderStoreOrder(
  orderId: string,
  order: UiOrder,
  overrides?: Partial<Omit<OrderStoreEntry, 'order'>>,
) {
  setOrderStoreState(orderId, (state) => ({
    ...state,
    order,
    loading: overrides?.loading ?? false,
    error: overrides?.error ?? null,
    syncError: overrides?.syncError ?? state.syncError,
    initialized: overrides?.initialized ?? true,
    dirty: overrides?.dirty ?? false,
  }));
}

export function clearOrderStoreState(orderId: string) {
  orderStore.delete(orderId);
  notifyOrderListeners();
}

export async function refetchOrderStore(
  orderId: string,
  options?: { fresh?: boolean; background?: boolean },
): Promise<void> {
  if (!options?.background) {
    setOrderStoreState(orderId, (state) => ({
      ...state,
      loading: true,
      error: null,
    }));
  }

  try {
    const data = await unwrapApiResponse(
      apiGet<GetOrderByIdResponse>(`/api/orders/${orderId}`, {
        cacheTTL: options?.fresh ? 0 : 5000,
      }),
    );
    const currentState = getOrderStoreState(orderId);
    const serverOrder = mapOrderDetailToUi(data);

    setOrderStoreState(
      orderId,
      buildOrderState(orderId, serverOrder, currentState, {
        loading: false,
        error: null,
        initialized: true,
      }),
    );
  } catch (fetchError) {
    const currentState = getOrderStoreState(orderId);

    if (options?.background && currentState.initialized) {
      return;
    }

    if (currentState.dirty && currentState.order) {
      setOrderStoreState(orderId, {
        ...currentState,
        loading: false,
        error: getApiErrorMessage(fetchError, 'Veriler yuklenemedi'),
        initialized: true,
        dirty: true,
      });
      return;
    }

    setOrderStoreState(orderId, {
      order: null,
      loading: false,
      error: getApiErrorMessage(fetchError, 'Veriler yuklenemedi'),
      syncError: currentState.syncError,
      initialized: true,
      dirty: false,
    });
  }
}

interface UseOrderResult {
  order: UiOrder | null;
  loading: boolean;
  error: string | null;
  syncError: string | null;
  refetch: () => Promise<void>;
}

export function useOrder(orderId: string | null): UseOrderResult {
  const [snapshot, setSnapshot] = useState<OrderStoreEntry>(getOrderStoreState(orderId));

  useEffect(() => {
    const listener = () => {
      setSnapshot(getOrderStoreState(orderId));
    };

    orderListeners.add(listener);
    listener();

    return () => {
      orderListeners.delete(listener);
    };
  }, [orderId]);

  const refetch = useCallback(async () => {
    if (!orderId) {
      return;
    }

    await refetchOrderStore(orderId, { fresh: true });
  }, [orderId]);

  useEffect(() => {
    if (orderId && !isTempOrderId(orderId) && !getOrderStoreState(orderId).initialized) {
      void refetchOrderStore(orderId);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId || typeof window === 'undefined' || isTempOrderId(orderId)) {
      return;
    }

    let cancelled = false;
    let hasSubscribed = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const setSyncError = (message: string | null) => {
      setOrderStoreState(orderId, (state) => ({
        ...state,
        syncError: message,
      }));
    };

    const healOrderState = () => {
      console.warn('Siparis realtime payloadi tam degil, arka planda yenileniyor', {
        orderId,
      });
      void refetchOrderStore(orderId, { fresh: true, background: true });
    };

    const applyRealtimeOrderUpdate = (
      nextOrder: UiOrder | 'refetch',
      options?: { clearError?: boolean },
    ) => {
      if (nextOrder === 'refetch') {
        healOrderState();
        return;
      }

      setOrderStoreState(orderId, (state) =>
        buildOrderState(orderId, nextOrder, state, {
          loading: false,
          error: options?.clearError === false ? state.error : null,
          initialized: true,
          syncError: null,
        }),
      );
    };

    void (async () => {
      try {
        const subscription = await subscribeToRealtimeChannel({
          channelName: buildRealtimeChannelName('order-sync', orderId),
          bindings: [
            {
              event: '*',
              schema: 'public',
              table: 'orders',
              filter: `id=eq.${orderId}`,
              callback: (payload) => {
                if (cancelled) {
                  return;
                }

                if (payload.eventType === 'DELETE') {
                  const deletedOrderId = toNullableString(payload.old.id);

                  if (deletedOrderId !== orderId) {
                    return;
                  }

                  setOrderStoreState(orderId, (state) =>
                    buildOrderState(orderId, null, state, {
                      loading: false,
                      error: null,
                      initialized: true,
                      syncError: null,
                    }),
                  );
                  return;
                }

                const currentState = getOrderStoreState(orderId);

                if (!currentState.order) {
                  healOrderState();
                  return;
                }

                const nextOrder = createUiOrderFromRow(
                  currentState.order,
                  payload.new as OrderRealtimeRow,
                );

                if (!nextOrder) {
                  healOrderState();
                  return;
                }

                applyRealtimeOrderUpdate(nextOrder);
              },
            },
            {
              event: '*',
              schema: 'public',
              table: 'order_items',
              filter: `order_id=eq.${orderId}`,
              callback: (payload) => {
                if (cancelled) {
                  return;
                }

                const currentState = getOrderStoreState(orderId);

                if (!currentState.order) {
                  healOrderState();
                  return;
                }

                switch (payload.eventType) {
                  case 'INSERT':
                    applyRealtimeOrderUpdate(
                      applyRealtimeOrderItemInsert(
                        currentState.order,
                        payload.new as OrderItemRealtimeRow,
                      ),
                    );
                    break;
                  case 'UPDATE':
                    applyRealtimeOrderUpdate(
                      applyRealtimeOrderItemUpdate(
                        currentState.order,
                        payload as RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
                      ),
                    );
                    break;
                  case 'DELETE':
                    applyRealtimeOrderUpdate(
                      applyRealtimeOrderItemDelete(
                        currentState.order,
                        payload as RealtimePostgresChangesPayload<OrderItemRealtimeRow>,
                      ),
                      {
                        clearError: false,
                      },
                    );
                    break;
                }
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
                  void refetchOrderStore(orderId, { fresh: true, background: true });
                }
                hasSubscribed = true;
                break;
              case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
                console.error('Order realtime channel error', { orderId, error });
                setSyncError('Canli siparis senkronizasyonu kesildi');
                break;
              case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
                console.warn('Order realtime channel timed out', { orderId, error });
                setSyncError('Canli siparis senkronizasyonu zaman asimina ugradi');
                break;
              case REALTIME_SUBSCRIBE_STATES.CLOSED:
                console.warn('Order realtime channel closed', { orderId });
                setSyncError('Canli siparis senkronizasyonu kapandi');
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

        console.error('Siparis realtime aboneligi baslatilamadi', {
          orderId,
          subscriptionError,
        });
        setSyncError('Canli siparis senkronizasyonu baslatilamadi');
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        void unsubscribe();
      }
    };
  }, [orderId]);

  return {
    order: snapshot.order,
    loading: snapshot.loading,
    error: snapshot.error,
    syncError: snapshot.syncError,
    refetch,
  };
}
