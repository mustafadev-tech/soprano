import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ItemSyncQueue, type QueuedItem } from '@/lib/itemQueue';
import { createClientId } from '@/lib/clientId';
import { applyPendingItemsToOrder } from '@/lib/orderSync';
import {
  apiGet,
  apiDelete,
  apiPatch,
  apiPost,
  clearCache,
  getApiErrorMessage,
  unwrapApiResponse,
} from '@/lib/apiClient';
import {
  listOrderDrafts,
  removeOrderDraftByTableId,
  saveOrderDraft,
} from '@/lib/orderDraftStorage';
import type {
  AddOrderItemRequest,
  AddOrderItemResponse,
  CloseOrderResponse,
  CloseOrderRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  DeleteOrderResponse,
  GetOrderByIdResponse,
  DeleteOrderItemResponse,
  UpdateOrderItemRequest,
  UpdateOrderItemResponse,
} from '@/types/contract';
import { mapOrderDetailToUi, type UiOrder, type UiTableStatus } from '@/types/api';
import { getMenuStoreState } from '@/hooks/menu/useMenu';
import {
  clearOrderStoreState,
  commitOrderStoreOrder,
  getOrderStoreState,
  refetchOrderStore,
  setOrderStoreState,
} from '@/hooks/orders/useOrder';
import { getTablesStoreState, setTablesStoreState } from '@/hooks/tables/useTables';

interface UseOrderActionsResult {
  createOptimisticOrder: (tableId: string) => UiOrder;
  openOrder: (tableId: string) => Promise<UiOrder | null>;
  closeOrder: (
    orderId: string,
    paymentMethod: 'cash' | 'credit_card',
    options?: { silent?: boolean },
  ) => Promise<UiOrder | null>;
  addItem: (
    orderId: string,
    menuItemId: string,
    quantity?: number,
    note?: string,
  ) => Promise<UiOrder | null>;
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) => Promise<UiOrder | null>;
  removeItem: (orderId: string, itemId: string) => Promise<UiOrder | null>;
  flushPendingItems: (orderId: string) => Promise<boolean>;
  hasPendingItems: (orderId: string | null) => boolean;
  loading: boolean;
  error: string | null;
}

interface OpeningOrderSession {
  promise: Promise<UiOrder | null>;
  canceled: boolean;
}

const orderQueues = new Map<string, ItemSyncQueue>();
const openingOrderRequests = new Map<string, OpeningOrderSession>();
const closingOrderRequests = new Map<string, Promise<UiOrder | null>>();
const optimisticOrderIdsByTable = new Map<string, string>();
let draftsBootstrapped = false;
const ORDER_SYNC_INTERVAL_MS = 300;
const ORDER_FLUSH_SAFETY_INTERVAL_MS = 5000;

function getPreferredOrderSyncDelayMs(): number {
  return ORDER_SYNC_INTERVAL_MS;
}

function getOrderQueueDelayMs(orderId: string): number | null {
  if (isTempOrderId(orderId)) {
    return null;
  }

  return getPreferredOrderSyncDelayMs();
}

function isTempOrderId(orderId: string): boolean {
  return orderId.startsWith('temp:order:');
}

function normalizeOrderItemNote(note?: string | null): string {
  return note?.trim() ?? '';
}

function getQueuedItemKey(menuItemId: string, note?: string | null): string {
  return `${menuItemId}::${normalizeOrderItemNote(note)}`;
}

function isMatchingOrderItem(
  item: UiOrder['items'][number],
  menuItemId: string,
  note?: string | null,
): boolean {
  return (
    item.menuItemId === menuItemId && normalizeOrderItemNote(item.note) === normalizeOrderItemNote(note)
  );
}

function getUiOrderItemCount(order: UiOrder): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function shouldReleaseTableForOrder(order: UiOrder): boolean {
  return order.status === 'paid' || order.total <= 0 || getUiOrderItemCount(order) <= 0;
}

function ensureOrderQueue(orderId: string): ItemSyncQueue {
  const existingQueue = orderQueues.get(orderId);

  if (existingQueue) {
    return existingQueue;
  }

  const queue = new ItemSyncQueue(getOrderQueueDelayMs(orderId));
  orderQueues.set(orderId, queue);
  return queue;
}

function recalculateTotal(order: UiOrder | null): UiOrder | null {
  if (!order) {
    return null;
  }

  return {
    ...order,
    total: order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  };
}

function clearOrderQueue(orderId: string) {
  orderQueues.get(orderId)?.clear();
  orderQueues.delete(orderId);
}

function createEmptyUiOrder(orderId: string, tableId: string): UiOrder {
  return {
    id: orderId,
    tableId,
    status: 'open',
    orderRevision: 0,
    items: [],
    createdAt: new Date().toISOString(),
    total: 0,
    paymentMethod: null,
  };
}

function createOptimisticOrderState(tableId: string): UiOrder {
  const existingOptimisticOrderId = optimisticOrderIdsByTable.get(tableId);

  if (existingOptimisticOrderId) {
    return getOrderStoreState(existingOptimisticOrderId).order ?? createEmptyUiOrder(existingOptimisticOrderId, tableId);
  }

  const orderId = createClientId('temp:order:');
  const optimisticOrder = createEmptyUiOrder(orderId, tableId);
  optimisticOrderIdsByTable.set(tableId, orderId);

  setOrderStoreState(orderId, {
    order: optimisticOrder,
    loading: false,
    error: null,
    syncError: null,
    initialized: true,
    dirty: false,
  });
  syncTablesForOrder(optimisticOrder);
  persistOrderDraft(optimisticOrder);
  return optimisticOrder;
}

function adoptOptimisticOrder(
  tableId: string,
  realOrder: UiOrder,
  onFlush: (items: QueuedItem[]) => Promise<void>,
): UiOrder {
  const optimisticOrderId = optimisticOrderIdsByTable.get(tableId);

  if (!optimisticOrderId) {
    return realOrder;
  }

  const optimisticQueuedItems = orderQueues.get(optimisticOrderId)?.entries() ?? [];

  clearOrderQueue(optimisticOrderId);
  clearOrderStoreState(optimisticOrderId);
  optimisticOrderIdsByTable.delete(tableId);

  const adoptedOrder =
    applyPendingItemsToOrder(realOrder, optimisticQueuedItems, getMenuStoreState().menuItems) ??
    realOrder;

  setOrderStoreState(realOrder.id, {
    order: adoptedOrder,
    loading: false,
    error: null,
    syncError: null,
    initialized: true,
    dirty: optimisticQueuedItems.length > 0,
  });
  syncTablesForOrder(adoptedOrder);

  if (optimisticQueuedItems.length > 0) {
    const realQueue = ensureOrderQueue(realOrder.id);

    for (const queuedItem of optimisticQueuedItems) {
      realQueue.add(queuedItem, onFlush);
    }
  }

  persistOrderDraft(adoptedOrder, optimisticQueuedItems);

  return adoptedOrder;
}

function persistOrderDraft(order: UiOrder | null, pendingItems: QueuedItem[] = []) {
  if (!order || order.status === 'paid') {
    if (order) {
      removeOrderDraftByTableId(order.tableId);
    }
    return;
  }

  const table = getTablesStoreState().tables.find((entry) => entry.id === order.tableId);
  saveOrderDraft({
    tableId: order.tableId,
    tableName: table?.name ?? null,
    order,
    pendingItems,
    updatedAt: Date.now(),
  });
}

function persistOrderDraftById(orderId: string) {
  const order = getOrderStoreState(orderId).order;
  const pendingItems = orderQueues.get(orderId)?.entries() ?? [];
  persistOrderDraft(order, pendingItems);
}

function flushDraftsWithKeepalive(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const drafts = listOrderDrafts()
    .filter((draft) => draft.pendingItems.length > 0 && !isTempOrderId(draft.order.id))
    .map((draft) => ({
      order_id: draft.order.id,
      order_revision: draft.order.orderRevision,
      items: draft.pendingItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
    }));

  if (!drafts.length) {
    return;
  }

  const payload = JSON.stringify({ drafts });

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' });

    if (navigator.sendBeacon('/api/orders/draft-sync', blob)) {
      return;
    }
  }

  void fetch('/api/orders/draft-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Best-effort unload sync; failures are tolerated because drafts remain in localStorage.
  });
}

function syncTablesForOrder(order: UiOrder | null) {
  if (!order) {
    return;
  }

  const shouldRelease = shouldReleaseTableForOrder(order);

  setTablesStoreState((state) => {
    const nextTables = state.tables.map((table) => {
      if (table.id !== order.tableId) {
        return table;
      }

      if (shouldRelease && table.currentOrderId && table.currentOrderId !== order.id) {
        return table;
      }

      const nextStatus: UiTableStatus = shouldRelease ? 'available' : 'occupied';

      return {
        ...table,
        status: nextStatus,
        currentOrderId: shouldRelease ? null : order.id,
      };
    });

    const filteredOrders = state.orders.filter((entry) => entry.tableId !== order.tableId);
    const nextOrders =
      shouldRelease
        ? filteredOrders
        : [
            ...filteredOrders,
            {
              id: order.id,
              tableId: order.tableId,
              status: order.status,
              total: order.total,
              itemCount: getUiOrderItemCount(order),
              paymentMethod: order.paymentMethod,
              openedAt: order.createdAt,
            },
          ];

    return {
      ...state,
      tables: nextTables,
      orders: nextOrders,
    };
  });
}

function restoreTablesState(previousState: ReturnType<typeof getTablesStoreState>) {
  setTablesStoreState(previousState);
}

function syncTableAvailable(tableId: string) {
  setTablesStoreState((state) => ({
    ...state,
    tables: state.tables.map((table) =>
      table.id === tableId
        ? {
            ...table,
            status: 'available',
            currentOrderId: null,
            isOptimistic: false,
          }
        : table,
    ),
    orders: state.orders.filter((order) => order.tableId !== tableId),
  }));
}

async function processQueuedItems(orderId: string, items: QueuedItem[]): Promise<void> {
  if (isTempOrderId(orderId)) {
    throw new Error('Optimistic orders cannot be flushed before the server order exists');
  }

  let latestOrder = getOrderStoreState(orderId).order;

  try {
    const freshOrder = await unwrapApiResponse(
      apiGet<GetOrderByIdResponse>(`/api/orders/${orderId}`, {
        cacheTTL: 0,
      }),
    );
    latestOrder = mapOrderDetailToUi(freshOrder);
  } catch {
    latestOrder = getOrderStoreState(orderId).order;
  }

  if (!latestOrder) {
    throw new Error('Order sync state missing');
  }

  for (const item of items.sort((left, right) => left.addedAt - right.addedAt)) {
    const matchingItem = latestOrder.items.find((entry) =>
      isMatchingOrderItem(entry, item.menu_item_id, item.note),
    );

    if (item.quantity <= 0) {
      if (!matchingItem) {
        continue;
      }

      const response = await unwrapApiResponse(
        apiDelete<DeleteOrderItemResponse>(`/api/orders/${orderId}/items/${matchingItem.id}`),
      );
      latestOrder = mapOrderDetailToUi(response);
      continue;
    }

    if (matchingItem) {
      if (matchingItem.quantity === item.quantity) {
        continue;
      }

      const response = await unwrapApiResponse(
        apiPatch<UpdateOrderItemResponse, UpdateOrderItemRequest>(
          `/api/orders/${orderId}/items/${matchingItem.id}`,
          { quantity: item.quantity },
        ),
      );
      latestOrder = mapOrderDetailToUi(response);
      continue;
    }

    const response = await unwrapApiResponse(
      apiPost<AddOrderItemResponse, AddOrderItemRequest>(`/api/orders/${orderId}/items`, {
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        note: item.note ?? null,
      }),
    );
    latestOrder = mapOrderDetailToUi(response);
  }

  clearCache(`/api/orders/${orderId}`);
  clearCache('/api/tables');
  const remainingPendingItems = orderQueues.get(orderId)?.entries() ?? [];
  const nextOrder =
    applyPendingItemsToOrder(latestOrder, remainingPendingItems, getMenuStoreState().menuItems) ??
    latestOrder;

  commitOrderStoreOrder(orderId, nextOrder, {
    loading: false,
    error: null,
    initialized: true,
    dirty: remainingPendingItems.length > 0,
  });
  syncTablesForOrder(nextOrder);
  persistOrderDraft(nextOrder, remainingPendingItems);
}

export function useOrderActions(): UseOrderActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draftsBootstrapped) {
      return;
    }

    draftsBootstrapped = true;

    for (const draft of listOrderDrafts()) {
      setOrderStoreState(draft.order.id, {
        order: draft.order,
        loading: false,
        error: null,
        syncError: null,
        initialized: true,
        dirty: draft.pendingItems.length > 0,
      });
      syncTablesForOrder(draft.order);

      if (draft.pendingItems.length > 0) {
        const queue = ensureOrderQueue(draft.order.id);

        for (const pendingItem of draft.pendingItems) {
          queue.add(pendingItem, async (items) => {
            await processQueuedItems(draft.order.id, items);
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      flushDraftsWithKeepalive();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraftsWithKeepalive();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const flushPendingItems = useCallback(async (
    orderId: string,
    options?: { background?: boolean },
  ): Promise<boolean> {
    const queue = orderQueues.get(orderId);

    if (!queue || !queue.hasPending()) {
      return true;
    }

    const isBackground = options?.background ?? false;

    try {
      if (!isBackground) {
        setLoading(true);
        setError(null);
      }

      while (queue.hasPending()) {
        await queue.flush((items) => processQueuedItems(orderId, items));
      }

      return true;
    } catch (flushError) {
      const message = getApiErrorMessage(flushError, 'Urunler senkronize edilemedi, tekrar deneyin');

      if (!isBackground) {
        setOrderStoreState(orderId, {
          ...getOrderStoreState(orderId),
          loading: false,
          error: message,
          initialized: true,
          dirty: true,
        });
      }
      persistOrderDraftById(orderId);

      if (!isBackground) {
        setError(message);
      }
      return false;
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const flushAllPendingQueues = () => {
      for (const [orderId, queue] of orderQueues.entries()) {
        if (isTempOrderId(orderId) || !queue.hasPending()) {
          continue;
        }

        void flushPendingItems(orderId, { background: true });
      }
    };

    const intervalId = window.setInterval(flushAllPendingQueues, ORDER_FLUSH_SAFETY_INTERVAL_MS);

    window.addEventListener('focus', flushAllPendingQueues);
    document.addEventListener('visibilitychange', flushAllPendingQueues);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', flushAllPendingQueues);
      document.removeEventListener('visibilitychange', flushAllPendingQueues);
    };
  }, [flushPendingItems]);

  async function openOrder(tableId: string): Promise<UiOrder | null> {
    const existingRequest = openingOrderRequests.get(tableId);

    if (existingRequest) {
      existingRequest.canceled = false;
      return existingRequest.promise;
    }

    const request = (async () => {
    setLoading(true);
    setError(null);
    const previousTablesState = getTablesStoreState();
    const optimisticOrderId = optimisticOrderIdsByTable.get(tableId) ?? null;

    try {
      const data = await unwrapApiResponse(
        apiPost<CreateOrderResponse, CreateOrderRequest>('/api/orders', { table_id: tableId }),
      );
      const session = openingOrderRequests.get(tableId);

      if (session?.canceled) {
        try {
          await unwrapApiResponse(apiDelete<DeleteOrderResponse>(`/api/orders/${data.id}`));
        } catch {
          // If cleanup fails, the next open request will reconcile against the existing open order.
        }

        clearCache(`/api/orders/${data.id}`);
        clearCache('/api/tables');
        clearOrderStoreState(data.id);
        syncTableAvailable(tableId);
        return null;
      }

      const mappedOrder = adoptOptimisticOrder(
        tableId,
        mapOrderDetailToUi(data),
        async (items) => {
          await processQueuedItems(data.id, items);
        },
      );

      commitOrderStoreOrder(mappedOrder.id, mappedOrder, {
        loading: false,
        error: null,
        initialized: true,
        dirty: getOrderStoreState(mappedOrder.id).dirty,
      });
      clearCache('/api/tables');
      syncTablesForOrder(mappedOrder);
      persistOrderDraftById(mappedOrder.id);
      return mappedOrder;
    } catch (mutationError) {
      if (optimisticOrderId) {
        clearOrderQueue(optimisticOrderId);
        clearOrderStoreState(optimisticOrderId);
        optimisticOrderIdsByTable.delete(tableId);
        removeOrderDraftByTableId(tableId);
      }
      restoreTablesState(previousTablesState);
      setError(getApiErrorMessage(mutationError, 'Islem gerceklestirilemedi, tekrar deneyin'));
      return null;
    } finally {
      setLoading(false);
    }
    })();

    openingOrderRequests.set(tableId, {
      promise: request,
      canceled: false,
    });

    try {
      return await request;
    } finally {
      openingOrderRequests.delete(tableId);
    }
  }

  async function closeOrder(
    orderId: string,
    paymentMethod: 'cash' | 'credit_card',
    options?: { silent?: boolean },
  ): Promise<UiOrder | null> {
    if (isTempOrderId(orderId)) {
      const currentOrder = getOrderStoreState(orderId).order;

      if (!currentOrder) {
        return null;
      }

      clearOrderQueue(orderId);
      clearOrderStoreState(orderId);
      removeOrderDraftByTableId(currentOrder.tableId);
      const openingSession = openingOrderRequests.get(currentOrder.tableId);
      if (openingSession) {
        openingSession.canceled = true;
      }
      optimisticOrderIdsByTable.delete(currentOrder.tableId);
      syncTableAvailable(currentOrder.tableId);

      return {
        ...currentOrder,
        status: 'paid',
        paymentMethod,
      };
    }

    const existingRequest = closingOrderRequests.get(orderId);

    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
    setLoading(true);
    setError(null);
    const didFlush = await flushPendingItems(orderId);
    if (!didFlush) {
      setLoading(false);
      return null;
    }

    const previousOrderState = getOrderStoreState(orderId);
    const previousTablesState = getTablesStoreState();
    let currentOrder = previousOrderState.order;

    if (!currentOrder) {
      await refetchOrderStore(orderId, { fresh: true });
      currentOrder = getOrderStoreState(orderId).order;
    }

    if (!currentOrder) {
      setLoading(false);
      return null;
    }

    const optimisticOrder = {
      ...currentOrder,
      status: 'paid' as const,
      paymentMethod,
    };

    setOrderStoreState(orderId, {
      ...previousOrderState,
      order: optimisticOrder,
    });
    syncTablesForOrder(optimisticOrder);

    try {
      const data = await unwrapApiResponse(
        apiPost<CloseOrderResponse, CloseOrderRequest>(`/api/orders/${orderId}/close`, {
          payment_method: paymentMethod,
        }),
      );
      const mappedOrder = mapOrderDetailToUi(data);

      commitOrderStoreOrder(orderId, mappedOrder, {
        loading: false,
        error: null,
        initialized: true,
        dirty: false,
      });
      clearCache(`/api/orders/${orderId}`);
      clearCache('/api/tables');
      syncTablesForOrder(mappedOrder);
      removeOrderDraftByTableId(mappedOrder.tableId);
      clearOrderStoreState(orderId);
      if (!options?.silent) {
        toast.success(
          paymentMethod === 'cash'
            ? 'Hesap nakit ile kapatıldı'
            : 'Hesap kredi kartı ile kapatıldı',
        );
      }
      return mappedOrder;
    } catch (mutationError) {
      const message = getApiErrorMessage(mutationError, 'Hesap kapatılamadı, tekrar deneyin');

      if (message === 'Siparis zaten kapatildi') {
        clearCache(`/api/orders/${orderId}`);
        clearCache('/api/tables');
        clearOrderStoreState(orderId);
        removeOrderDraftByTableId(currentOrder.tableId);
        syncTableAvailable(currentOrder.tableId);
        return {
          ...currentOrder,
          status: 'paid' as const,
          paymentMethod,
        };
      }

      setOrderStoreState(orderId, previousOrderState);
      restoreTablesState(previousTablesState);
      setError(message);
      if (!options?.silent) {
        toast.error(message);
      }
      return null;
    } finally {
      setLoading(false);
    }
    })();

    closingOrderRequests.set(orderId, request);

    try {
      return await request;
    } finally {
      closingOrderRequests.delete(orderId);
    }
  }

  async function addItem(
    orderId: string,
    menuItemId: string,
    quantity = 1,
    note?: string,
  ): Promise<UiOrder | null> {
    setLoading(true);
    setError(null);
    let orderState = getOrderStoreState(orderId);
    let currentOrder = orderState.order;
    const queue = ensureOrderQueue(orderId);
    const menuItem = getMenuStoreState().menuItems.find((item) => item.id === menuItemId);

    if (!currentOrder && !isTempOrderId(orderId)) {
      await refetchOrderStore(orderId, { fresh: true });
      orderState = getOrderStoreState(orderId);
      currentOrder = orderState.order;
    }

    if (!currentOrder || !menuItem) {
      setLoading(false);
      return null;
    }

    const queueKey = getQueuedItemKey(menuItemId, note);
    const existingQueuedItem = queue.get(queueKey);
    const existingOrderItem = currentOrder.items.find((item) => isMatchingOrderItem(item, menuItemId, note));
    const trackingId = existingQueuedItem?.tempId ?? existingOrderItem?.id ?? createClientId('temp:');
    const nextQuantity = (existingOrderItem?.quantity ?? 0) + quantity;

    const optimisticOrder = recalculateTotal({
      ...currentOrder,
      items: existingOrderItem
        ? currentOrder.items.map((item) =>
            item.id === existingOrderItem.id
              ? {
                  ...item,
                  quantity: nextQuantity,
                  note: note ?? item.note,
                  isOptimistic: true,
                }
              : item,
          )
        : [
            ...currentOrder.items,
            {
              id: trackingId,
              menuItemId,
              name: menuItem.name,
              price: menuItem.price,
              unitPrice: menuItem.price,
              quantity,
              note: note ?? null,
              isOptimistic: true,
            },
          ],
    });

    setOrderStoreState(orderId, {
      ...orderState,
      order: optimisticOrder,
      dirty: true,
    });
    syncTablesForOrder(optimisticOrder);

    const queuedItem: QueuedItem = {
      key: queueKey,
      tempId: trackingId,
      menu_item_id: menuItemId,
      quantity: nextQuantity,
      note,
      addedAt: Date.now(),
    };

    queue.add(queuedItem, async (items) => {
      await processQueuedItems(orderId, items);
    });
    persistOrderDraft(optimisticOrder, queue.entries());

    setLoading(false);
    return optimisticOrder;
  }

  async function updateItemQuantity(
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<UiOrder | null> {
    setLoading(true);
    setError(null);
    const previousOrderState = getOrderStoreState(orderId);
    const previousOrder = previousOrderState.order;

    if (!previousOrder) {
      setLoading(false);
      return null;
    }

    const currentItem = previousOrder.items.find((item) => item.id === itemId) ?? null;

    if (!currentItem) {
      setLoading(false);
      return null;
    }

    const optimisticOrder = recalculateTotal({
      ...previousOrder,
      items: previousOrder.items.map((item) =>
        item.id === itemId ? { ...item, quantity } : item,
      ),
    });

    setOrderStoreState(orderId, {
      ...previousOrderState,
      order: optimisticOrder,
      dirty: true,
    });
    syncTablesForOrder(optimisticOrder);
    const queueKey = getQueuedItemKey(currentItem.menuItemId, currentItem.note);
    ensureOrderQueue(orderId).add(
      {
        key: queueKey,
        tempId: itemId,
        menu_item_id: currentItem.menuItemId,
        quantity,
        note: currentItem.note ?? undefined,
        addedAt: Date.now(),
      },
      async (items) => {
        await processQueuedItems(orderId, items);
      },
    );
    persistOrderDraft(optimisticOrder, ensureOrderQueue(orderId).entries());
    setLoading(false);
    return optimisticOrder;
  }

  async function removeItem(orderId: string, itemId: string): Promise<UiOrder | null> {
    setLoading(true);
    setError(null);
    const previousOrderState = getOrderStoreState(orderId);
    const previousOrder = previousOrderState.order;

    if (!previousOrder) {
      setLoading(false);
      return null;
    }

    const removedItem = previousOrder.items.find((item) => item.id === itemId) ?? null;
    const queueKey = removedItem
      ? getQueuedItemKey(removedItem.menuItemId, removedItem.note)
      : null;

    const optimisticOrder = recalculateTotal({
      ...previousOrder,
      items: previousOrder.items.filter((item) => item.id !== itemId),
    });

    setOrderStoreState(orderId, {
      ...previousOrderState,
      order: optimisticOrder,
      dirty: true,
    });
    syncTablesForOrder(optimisticOrder);
    if (queueKey && removedItem) {
      ensureOrderQueue(orderId).add(
        {
          key: queueKey,
          tempId: removedItem.id,
          menu_item_id: removedItem.menuItemId,
          quantity: 0,
          note: removedItem.note ?? undefined,
          addedAt: Date.now(),
        },
        async (items) => {
          await processQueuedItems(orderId, items);
        },
      );
      void flushPendingItems(orderId, { background: true });
    }
    persistOrderDraft(optimisticOrder, ensureOrderQueue(orderId).entries());
    setLoading(false);
    return optimisticOrder;
  }

  return {
    createOptimisticOrder: createOptimisticOrderState,
    openOrder,
    closeOrder,
    addItem,
    updateItemQuantity,
    removeItem,
    flushPendingItems,
    hasPendingItems: (orderId) => (orderId ? ensureOrderQueue(orderId).hasPending() : false),
    loading,
    error,
  };
}
