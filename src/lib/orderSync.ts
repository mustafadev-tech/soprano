import type { QueuedItem } from '@/lib/itemQueue';
import type { UiMenuItem, UiOrder } from '@/types/api';

function normalizeOrderItemNote(note?: string | null): string {
  return note?.trim() ?? '';
}

function isMatchingQueuedOrderItem(
  item: Pick<UiOrder['items'][number], 'menuItemId' | 'note'>,
  menuItemId: string,
  note?: string | null,
): boolean {
  return (
    item.menuItemId === menuItemId &&
    normalizeOrderItemNote(item.note) === normalizeOrderItemNote(note)
  );
}

export function applyPendingItemsToOrder(
  order: UiOrder | null,
  pendingItems: QueuedItem[],
  menuItems: UiMenuItem[],
): UiOrder | null {
  if (!order || pendingItems.length === 0) {
    return order;
  }

  let nextItems = [...order.items];

  for (const pendingItem of pendingItems) {
    const menuItem = menuItems.find((item) => item.id === pendingItem.menu_item_id);
    const existingIndex = nextItems.findIndex(
      (item) =>
        item.id === pendingItem.tempId ||
        isMatchingQueuedOrderItem(item, pendingItem.menu_item_id, pendingItem.note),
    );

    if (existingIndex >= 0) {
      if (pendingItem.quantity <= 0) {
        nextItems.splice(existingIndex, 1);
        continue;
      }

      nextItems[existingIndex] = {
        ...nextItems[existingIndex],
        quantity: pendingItem.quantity,
        note: pendingItem.note ?? nextItems[existingIndex].note,
        isOptimistic: true,
      };
      continue;
    }

    if (!menuItem || pendingItem.quantity <= 0) {
      continue;
    }

    nextItems.push({
      id: pendingItem.tempId,
      menuItemId: pendingItem.menu_item_id,
      name: menuItem.name,
      price: menuItem.price,
      unitPrice: menuItem.price,
      quantity: pendingItem.quantity,
      note: pendingItem.note ?? null,
      isOptimistic: true,
    });
  }

  return {
    ...order,
    items: nextItems,
    total: nextItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  };
}
