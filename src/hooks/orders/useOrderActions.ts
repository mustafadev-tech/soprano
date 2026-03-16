import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ItemSyncQueue, type QueuedItem } from '@/lib/itemQueue';
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

function getPreferredOrderSyncDelayMs(): number {
  if (typeof window === 'undefined') {
    return 10000;
  }

  const userAgent = window.navigator.userAgent;
  const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

  return isMobileUserAgent || isCoarsePointer ? 2000 : 10000;
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

function applyQueuedItemsToOrder(order: UiOrder | null, items: QueuedItem[]): UiOrder | null {
  if (!order || items.length === 0) {
    return order;
  }

  let nextItems = [...order.items];

  for (const queuedItem of items) {
    const menuItem = getMenuStoreState().menuItems.find((item) => item.id === queuedItem.menu_item_id);
    const existingIndex = nextItems.findIndex(
      (item) =>
        item.id === queuedItem.tempId || isMatchingOrderItem(item, queuedItem.menu_item_id, queuedItem.note),
    );

    if (existingIndex >= 0) {
      if (queuedItem.quantity <= 0) {
        nextItems.splice(existingIndex, 1);
        continue;
      }

      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        quantity: queuedItem.quantity,
        note: queuedItem.note ?? nextItems[existingIndex].note,
        isOptimistic: true,
      };
      continue;
    }

    if (!menuItem) {
      continue;
    }

    if (queuedItem.quantity <= 0) {
      continue;
    }

    nextItems.push({
      id: queuedItem.tempId,
      menuItemId: queuedItem.menu_item_id,
      name: menuItem.name,
      price: menuItem.price,
      unitPrice: menuItem.price,
      quantity: queuedItem.quantity,
      note: queuedItem.note ?? null,
      isOptimistic: true,
    });
  }

  return recalculateTotal({
    ...order,
    items: nextItems,
  });
}

function ensureOrderQueue(orderId: string): ItemSyncQueue {
  const existingQueue = orderQueues.get(orderId);

  if (existingQueue) {
    return existingQueue;
  }

  const queue = new ItemSyncQueue(getPreferredOrderSyncDelayMs());
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

  const orderId = `temp:order:${crypto.randomUUID()}`;
  const optimisticOrder = createEmptyUiOrder(orderId, tableId);
  optimisticOrderIdsByTable.set(tableId, orderId);

  setOrderStoreState(orderId, {
    order: optimisticOrder,
    loading: false,
    error: null,
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

  const optimisticOrderState = getOrderStoreState(optimisticOrderId).order;
  const optimisticQueuedItems = orderQueues.get(optimisticOrderId)?.entries() ?? [];

  clearOrderQueue(optimisticOrderId);
  clearOrderStoreState(optimisticOrderId);
  optimisticOrderIdsByTable.delete(tableId);

  const adoptedOrder = optimisticOrderState
    ? recalculateTotal({
        ...realOrder,
        items: optimisticOrderState.items.map((item) => ({ ...item })),
      }) ?? realOrder
    : realOrder;

  setOrderStoreState(realOrder.id, {
    order: adoptedOrder,
    loading: false,
    error: null,
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
      items: draft.order.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        note: item.note,
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

  setTablesStoreState((state) => {
    const nextTables = state.tables.map((table) => {
      if (table.id !== order.tableId) {
        return table;
      }

      if (order.status === 'paid' && table.currentOrderId && table.currentOrderId !== order.id) {
        return table;
      }

      const nextStatus: UiTableStatus = order.status === 'paid' ? 'available' : 'occupied';

      return {
        ...table,
        status: nextStatus,
        currentOrderId: order.status === 'paid' ? null : order.id,
      };
    });

    const filteredOrders = state.orders.filter((entry) => entry.tableId !== order.tableId);
    const nextOrders =
      order.status === 'paid'
        ? filteredOrders
        : [
            ...filteredOrders,
            {
              id: order.id,
              tableId: order.tableId,
              status: order.status,
              total: order.total,
              itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
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

function setTableOccupied(tableId: string, optimistic = true) {
  setTablesStoreState((state) => ({
    ...state,
    tables: state.tables.map((table) =>
      table.id === tableId
        ? {
            ...table,
            status: 'occupied' as const,
            isOptimistic: optimistic,
          }
        : table,
    ),
  }));
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

  async function processQueuedItems(orderId: string, items: QueuedItem[]): Promise<void> {
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
    commitOrderStoreOrder(orderId, latestOrder, {
      loading: false,
      error: null,
      initialized: true,
      dirty: false,
    });
    syncTablesForOrder(latestOrder);
    persistOrderDraftById(orderId);
  }

  async function flushPendingItems(orderId: string): Promise<boolean> {
    const queue = orderQueues.get(orderId);

    if (!queue || !queue.hasPending()) {
      return true;
    }

    try {
      setLoading(true);
      setError(null);

      while (queue.hasPending()) {
        await queue.flush((items) => processQueuedItems(orderId, items));
      }

      return true;
    } catch (flushError) {
      const message = getApiErrorMessage(flushError, 'Urunler senkronize edilemedi, tekrar deneyin');

      setOrderStoreState(orderId, {
        ...getOrderStoreState(orderId),
        loading: false,
        error: message,
        initialized: true,
        dirty: true,
      });
      persistOrderDraftById(orderId);

      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }

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

    if (!optimisticOrderId) {
      setTableOccupied(tableId);
    }

    try {
      const data = await unwrapApiResponse(
        apiPost<CreateOrderResponse, CreateOrderRequest>('/api/orders', { table_id: tableId }),
      );
      const session = openingOrderRequests.get(tableId);

      if (session?.canceled) {
        try {
          await unwrapApiResponse(
            apiPost<CloseOrderResponse, CloseOrderRequest>(`/api/orders/${data.id}/close`, {
              payment_method: 'cash',
            }),
          );
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
    const trackingId = existingQueuedItem?.tempId ?? existingOrderItem?.id ?? `temp:${crypto.randomUUID()}`;
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
