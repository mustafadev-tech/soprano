import { useCallback, useEffect, useState } from 'react';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import { listOrderDrafts } from '@/lib/orderDraftStorage';
import type { GetOrderByIdResponse } from '@/types/contract';
import { mapOrderDetailToUi, type UiOrder } from '@/types/api';

interface OrderStoreEntry {
  order: UiOrder | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  dirty: boolean;
}

const emptyOrderState: OrderStoreEntry = {
  order: null,
  loading: false,
  error: null,
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

function shouldApplyIncomingOrder(currentOrder: UiOrder | null, nextOrder: UiOrder | null): boolean {
  if (!nextOrder) {
    return true;
  }

  if (!currentOrder) {
    return true;
  }

  return nextOrder.orderRevision >= currentOrder.orderRevision;
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
      initialized: true,
      dirty: draft.pendingItems.length > 0,
    });
  }

  draftsHydrated = true;
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
    initialized: overrides?.initialized ?? true,
    dirty: overrides?.dirty ?? false,
  }));
}

export function clearOrderStoreState(orderId: string) {
  orderStore.delete(orderId);
  notifyOrderListeners();
}

export async function refetchOrderStore(orderId: string, options?: { fresh?: boolean }): Promise<void> {
  setOrderStoreState(orderId, (state) => ({
    ...state,
    loading: true,
    error: null,
  }));

  try {
    const data = await unwrapApiResponse(
      apiGet<GetOrderByIdResponse>(`/api/orders/${orderId}`, {
        cacheTTL: options?.fresh ? 0 : 5000,
      }),
    );
    commitOrderStoreOrder(orderId, mapOrderDetailToUi(data), {
      loading: false,
      error: null,
      initialized: true,
    });
  } catch (fetchError) {
    const currentState = getOrderStoreState(orderId);

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
      initialized: true,
      dirty: false,
    });
  }
}

interface UseOrderResult {
  order: UiOrder | null;
  loading: boolean;
  error: string | null;
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
    if (orderId && !getOrderStoreState(orderId).initialized) {
      void refetchOrderStore(orderId);
    }
  }, [orderId]);

  return {
    order: snapshot.order,
    loading: snapshot.loading,
    error: snapshot.error,
    refetch,
  };
}
