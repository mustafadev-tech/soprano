import type { QueuedItem } from '@/lib/itemQueue';
import type { UiOrder } from '@/types/api';

const STORAGE_KEY = 'soprano:order-drafts';

export interface PersistedOrderDraft {
  tableId: string;
  tableName: string | null;
  order: UiOrder;
  pendingItems: QueuedItem[];
  updatedAt: number;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readDraftMap(): Record<string, PersistedOrderDraft> {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, PersistedOrderDraft> | null;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeDraftMap(drafts: Record<string, PersistedOrderDraft>): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function listOrderDrafts(): PersistedOrderDraft[] {
  return Object.values(readDraftMap()).sort((left, right) => left.updatedAt - right.updatedAt);
}

export function getOrderDraftByOrderId(orderId: string): PersistedOrderDraft | null {
  return listOrderDrafts().find((draft) => draft.order.id === orderId) ?? null;
}

export function saveOrderDraft(draft: PersistedOrderDraft): void {
  const nextDrafts = readDraftMap();
  nextDrafts[draft.tableId] = draft;
  writeDraftMap(nextDrafts);
}

export function removeOrderDraftByTableId(tableId: string): void {
  const nextDrafts = readDraftMap();
  delete nextDrafts[tableId];
  writeDraftMap(nextDrafts);
}

export function removeOrderDraftByOrderId(orderId: string): void {
  const nextDrafts = readDraftMap();

  for (const [tableId, draft] of Object.entries(nextDrafts)) {
    if (draft.order.id === orderId) {
      delete nextDrafts[tableId];
    }
  }

  writeDraftMap(nextDrafts);
}
