import {
  apiSuccess,
  badRequest,
  notFound,
  runRoute,
  serverError,
  type RouteContext,
} from '@/app/api/_server/http';
import { requireRole } from '@/app/api/_server/auth';
import {
  getOrderById,
  getOpenOrderByTableId,
  getOrderDetail,
  getTableById,
  listRawOrderItems,
  recalculateOrderTotal,
} from '@/app/api/_server/queries';
import { parseUuid, readJsonObject } from '@/app/api/_server/validation';

type OrderRouteParams = {
  id: string;
};

function normalizeNote(note: string | null | undefined): string {
  return note?.trim() ?? '';
}

function getLogicalKey(menuItemId: string, note: string | null | undefined): string {
  return `${menuItemId}::${normalizeNote(note)}`;
}

function isColumnMissingError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (error.message ?? '').toLowerCase().includes('added_by')
  );
}

export async function POST(
  request: Request,
  context: RouteContext<OrderRouteParams>,
): Promise<Response> {
  return runRoute(request, context, async (incomingRequest, { params }) => {
    const { supabase } = await requireRole(['soprano_admin']);
    const sourceOrderId = parseUuid(params.id, 'id');
    const body = await readJsonObject(incomingRequest);
    const targetTableId = parseUuid(body.target_table_id, 'target_table_id');

    const sourceOrder = await getOrderById(supabase, sourceOrderId);

    if (!sourceOrder) {
      throw notFound('Order not found.');
    }

    if (sourceOrder.status !== 'open') {
      throw badRequest('Order is not open.');
    }

    if (targetTableId === sourceOrder.table_id) {
      throw badRequest('Cannot transfer to the same table.');
    }

    const targetTable = await getTableById(supabase, targetTableId);

    if (!targetTable) {
      throw notFound('Target table not found.');
    }

    const sourceItems = await listRawOrderItems(supabase, sourceOrderId);

    if (sourceItems.length === 0) {
      throw badRequest('Source order has no items.');
    }

    // Get or create an open order on the target table
    let targetOrder = await getOpenOrderByTableId(supabase, targetTableId);

    if (!targetOrder) {
      const { data: newOrderData, error: createOrderError } = await supabase
        .from('orders')
        .insert({
          table_id: targetTableId,
          status: 'open',
          total_amount: 0,
          table_status_before_open: targetTable.status,
        })
        .select('id')
        .maybeSingle();

      if (createOrderError) {
        if (createOrderError.code === '23505') {
          targetOrder = await getOpenOrderByTableId(supabase, targetTableId);
        } else {
          throw serverError('Failed to create target order.');
        }
      } else if (newOrderData) {
        targetOrder = await getOrderById(supabase, newOrderData.id);
      }
    }

    if (!targetOrder) {
      throw serverError('Failed to get or create target order.');
    }

    const targetOrderId = targetOrder.id;
    const targetItems = await listRawOrderItems(supabase, targetOrderId);

    // Group source items by logical key, summing quantities
    interface SourceGroup {
      menuItemId: string;
      note: string | null;
      quantity: number;
      unitPrice: number;
      addedBy: string | null;
    }

    const sourceGroups = new Map<string, SourceGroup>();

    for (const item of sourceItems) {
      const key = getLogicalKey(item.menu_item_id, item.note);
      const existing = sourceGroups.get(key);

      if (existing) {
        existing.quantity += item.quantity;
      } else {
        sourceGroups.set(key, {
          menuItemId: item.menu_item_id,
          note: item.note,
          quantity: item.quantity,
          unitPrice: typeof item.unit_price === 'number' ? item.unit_price : Number(item.unit_price),
          addedBy: item.added_by,
        });
      }
    }

    // Merge or insert each source group into the target order
    for (const [key, sourceGroup] of sourceGroups) {
      const matchingTargetItems = targetItems.filter(
        (item) => getLogicalKey(item.menu_item_id, item.note) === key,
      );

      if (matchingTargetItems.length > 0) {
        const existingQty = matchingTargetItems.reduce((sum, item) => sum + item.quantity, 0);
        const newQty = existingQty + sourceGroup.quantity;

        // Use the latest row as representative
        const representative = matchingTargetItems.reduce((latest, item) =>
          item.created_at > latest.created_at ? item : latest,
        );

        const { error: updateError } = await supabase
          .from('order_items')
          .update({ quantity: newQty })
          .eq('id', representative.id);

        if (updateError) {
          throw serverError('Failed to merge order items.');
        }

        const duplicateIds = matchingTargetItems
          .filter((item) => item.id !== representative.id)
          .map((item) => item.id);

        if (duplicateIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('order_items')
            .delete()
            .in('id', duplicateIds);

          if (deleteError) {
            throw serverError('Failed to clean up duplicate order items.');
          }
        }
      } else {
        const insertPayload = {
          order_id: targetOrderId,
          menu_item_id: sourceGroup.menuItemId,
          quantity: sourceGroup.quantity,
          unit_price: sourceGroup.unitPrice,
          note: normalizeNote(sourceGroup.note) || null,
          added_by: sourceGroup.addedBy,
        };

        const { error: insertError } = await supabase
          .from('order_items')
          .insert(insertPayload);

        if (insertError) {
          if (isColumnMissingError(insertError)) {
            const { added_by: _ab, ...legacyPayload } = insertPayload;
            const { error: legacyError } = await supabase
              .from('order_items')
              .insert(legacyPayload);

            if (legacyError) {
              throw serverError('Failed to add order item to target order.');
            }
          } else {
            throw serverError('Failed to add order item to target order.');
          }
        }
      }
    }

    // Remove source order items and order
    const { error: deleteItemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', sourceOrderId);

    if (deleteItemsError) {
      throw serverError('Failed to remove source order items.');
    }

    const { error: deleteOrderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', sourceOrderId);

    if (deleteOrderError) {
      throw serverError('Failed to remove source order.');
    }

    // Restore source table status
    const restoredSourceStatus =
      sourceOrder.table_status_before_open === 'reserved' ? 'reserved' : 'empty';
    const { error: sourceTableError } = await supabase
      .from('tables')
      .update({ status: restoredSourceStatus })
      .eq('id', sourceOrder.table_id);

    if (sourceTableError) {
      throw serverError('Failed to update source table status.');
    }

    // Recalculate target order total (also sets target table to 'occupied')
    await recalculateOrderTotal(supabase, targetOrderId);

    const updatedOrderDetail = await getOrderDetail(supabase, targetOrderId);

    if (!updatedOrderDetail) {
      throw serverError('Failed to load updated target order.');
    }

    return apiSuccess(updatedOrderDetail);
  });
}
