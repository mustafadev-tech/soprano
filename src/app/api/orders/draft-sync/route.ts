import {
  apiSuccess,
  badRequest,
  runRoute,
  type RouteContext,
} from '@/app/api/_server/http';
import { syncOrderToDesiredItems } from '@/app/api/_server/queries';
import { parsePositiveInteger, parseUuid, readJsonObject } from '@/app/api/_server/validation';
import type { OrderDraftSyncEntry, OrderDraftSyncItem } from '@/types/contract';

export const dynamic = 'force-dynamic';

function parseDraftSyncItems(value: unknown): OrderDraftSyncItem[] {
  if (!Array.isArray(value)) {
    throw badRequest('items must be an array.');
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('Each sync item must be an object.');
    }

    const record = entry as Record<string, unknown>;

    return {
      menu_item_id: parseUuid(record.menu_item_id, 'menu_item_id'),
      quantity: parsePositiveInteger(record.quantity, 'quantity'),
      note:
        record.note === undefined || record.note === null || typeof record.note === 'string'
          ? (record.note as string | null | undefined)
          : (() => {
              throw badRequest('note must be a string or null.');
            })(),
    };
  });
}

function parseDraftEntries(value: unknown): OrderDraftSyncEntry[] {
  if (!Array.isArray(value)) {
    throw badRequest('drafts must be an array.');
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('Each draft must be an object.');
    }

    const record = entry as Record<string, unknown>;

    return {
      order_id: parseUuid(record.order_id, 'order_id'),
      order_revision: typeof record.order_revision === 'number' ? record.order_revision : 0,
      items: parseDraftSyncItems(record.items),
    };
  });
}

export async function POST(
  request: Request,
  context: RouteContext<Record<string, never>>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest) => {
    const body = await readJsonObject(incomingRequest);
    const drafts = parseDraftEntries(body.drafts);
    const syncedOrderIds: string[] = [];

    for (const draft of drafts) {
      if (!draft.order_id.startsWith('temp:')) {
        await syncOrderToDesiredItems(draft.order_id, draft.items);
        syncedOrderIds.push(draft.order_id);
      }
    }

    return apiSuccess({ synced_order_ids: syncedOrderIds });
  });
}
