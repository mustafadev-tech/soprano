import type {
  CafeTable,
  Category,
  MenuCategoryWithItems,
  MenuItem,
  OpenOrderSummary,
  Order,
  OrderDetail,
  OrderItem,
  OrderItemDetail,
  OrderStatus,
  PaymentMethod,
  TableDetail,
  TableStatus,
  OrderDraftSyncItem,
} from '@/types/contract';

import { badRequest, conflict, notFound, serverError } from '@/app/api/_server/http';
import { getSupabaseAdmin } from '@/app/api/_server/supabase';

type NumericValue = number | string;

interface TableRow {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  created_at: string;
  deleted_at?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

interface MenuItemRow {
  id: string;
  category_id: string;
  name: string;
  price: NumericValue;
  description: string | null;
  is_available: boolean;
  created_at: string;
}

interface OrderRow {
  id: string;
  table_id: string;
  status: OrderStatus;
  payment_method: Exclude<PaymentMethod, null> | null;
  total_amount: NumericValue;
  order_revision: NumericValue;
  note: string | null;
  table_status_before_open: TableStatus | null;
  opened_at: string;
  closed_at: string | null;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: NumericValue;
  note: string | null;
  created_at: string;
}

interface OrderItemTotalRow {
  id?: string;
  menu_item_id?: string;
  quantity: number;
  unit_price: NumericValue;
  note?: string | null;
  created_at?: string;
}

interface OrderItemDetailsViewRow {
  id: string;
  order_id: string;
  quantity: number;
  unit_price: NumericValue;
  note: string | null;
  created_at: string;
  item_name: string;
  category_id: string;
  category_name: string;
}

interface LogicalOrderItemAccumulator {
  detail: OrderItemDetail;
  sort_key: string;
}

async function readManyRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  message: string,
): Promise<T[]> {
  const { data, error } = await query;

  if (error) {
    throw serverError(message);
  }

  return data ?? [];
}

async function readMaybeRow<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  message: string,
): Promise<T | null> {
  const { data, error } = await query;

  if (error) {
    throw serverError(message);
  }

  return data ?? null;
}

function toNumber(value: NumericValue): number {
  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw serverError('Database returned an invalid numeric value.');
  }

  return Number(parsedValue.toFixed(2));
}

function sumOrderQuantities(orderItems: Array<Pick<OrderItem, 'quantity'>>): number {
  return orderItems.reduce((total, item) => total + item.quantity, 0);
}

export function mapTable(row: TableRow): CafeTable {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    created_at: row.created_at,
  };
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

export function mapMenuItem(row: MenuItemRow): MenuItem {
  return {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    price: toNumber(row.price),
    description: row.description,
    is_available: row.is_available,
    created_at: row.created_at,
  };
}

export function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    table_id: row.table_id,
    status: row.status,
    payment_method: row.payment_method,
    total_amount: toNumber(row.total_amount),
    order_revision: Number(row.order_revision),
    note: row.note,
    table_status_before_open: row.table_status_before_open,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
  };
}

export function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    order_id: row.order_id,
    menu_item_id: row.menu_item_id,
    quantity: row.quantity,
    unit_price: toNumber(row.unit_price),
    note: row.note,
    created_at: row.created_at,
  };
}

function normalizeOrderItemNote(note: string | null | undefined): string {
  return note?.trim() ?? '';
}

function getOrderItemGroupKey(row: Pick<OrderItemRow, 'menu_item_id' | 'unit_price' | 'note'>): string {
  return `${row.menu_item_id}::${normalizeOrderItemNote(row.note)}::${toNumber(row.unit_price)}`;
}

function getOrderItemSortKey(row: Pick<OrderItemRow, 'created_at' | 'id'>): string {
  return `${row.created_at}::${row.id}`;
}

function mapOpenOrderSummary(order: Order, itemCount: number): OpenOrderSummary {
  return {
    id: order.id,
    status: order.status,
    payment_method: order.payment_method,
    total_amount: order.total_amount,
    opened_at: order.opened_at,
    item_count: itemCount,
  };
}

async function buildTableDetails(tableRows: TableRow[]): Promise<TableDetail[]> {
  if (!tableRows.length) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const tableIds = tableRows.map((table) => table.id);
  const openOrderRows = await readManyRows<OrderRow>(
    supabase
      .from('orders')
      .select('id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at')
      .in('table_id', tableIds)
      .eq('status', 'open'),
    'Failed to load open orders.',
  );

  const orderIds = openOrderRows.map((order) => order.id);
  const openOrders = openOrderRows.map(mapOrder);
  const itemCountByOrderId = new Map<string, number>();

  if (orderIds.length) {
    const orderItemRows = await readManyRows<Pick<OrderItemRow, 'order_id' | 'quantity'>>(
      supabase.from('order_items').select('order_id, quantity').in('order_id', orderIds),
      'Failed to load order item counts.',
    );

    for (const orderItem of orderItemRows) {
      const currentCount = itemCountByOrderId.get(orderItem.order_id) ?? 0;
      itemCountByOrderId.set(orderItem.order_id, currentCount + orderItem.quantity);
    }
  }

  const openOrderByTableId = new Map<string, OpenOrderSummary>();

  for (const order of openOrders) {
    openOrderByTableId.set(
      order.table_id,
      mapOpenOrderSummary(order, itemCountByOrderId.get(order.id) ?? 0),
    );
  }

  return tableRows.map((tableRow) => ({
    ...mapTable(tableRow),
    open_order: openOrderByTableId.get(tableRow.id) ?? null,
  }));
}

export async function listTablesWithOpenOrders(): Promise<TableDetail[]> {
  const tableRows = await readManyRows<TableRow>(
    getSupabaseAdmin()
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    'Failed to load tables.',
  );

  return buildTableDetails(tableRows);
}

export async function getTableDetailById(tableId: string): Promise<TableDetail | null> {
  const tableRows = await readManyRows<TableRow>(
    getSupabaseAdmin()
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .eq('id', tableId)
      .is('deleted_at', null),
    'Failed to load table.',
  );

  if (!tableRows.length) {
    return null;
  }

  const [tableDetail] = await buildTableDetails(tableRows);
  return tableDetail ?? null;
}

export async function getTableById(tableId: string): Promise<CafeTable | null> {
  const tableRow = await readMaybeRow<TableRow>(
    getSupabaseAdmin()
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .eq('id', tableId)
      .is('deleted_at', null)
      .maybeSingle(),
    'Failed to load table.',
  );

  return tableRow ? mapTable(tableRow) : null;
}

export async function getCategoryById(categoryId: string): Promise<Category | null> {
  const categoryRow = await readMaybeRow<CategoryRow>(
    getSupabaseAdmin()
      .from('categories')
      .select('id, name, sort_order, created_at')
      .eq('id', categoryId)
      .maybeSingle(),
    'Failed to load category.',
  );

  return categoryRow ? mapCategory(categoryRow) : null;
}

export async function getMenuItemById(menuItemId: string): Promise<MenuItem | null> {
  const menuItemRow = await readMaybeRow<MenuItemRow>(
    getSupabaseAdmin()
      .from('menu_items')
      .select('id, category_id, name, price, description, is_available, created_at')
      .eq('id', menuItemId)
      .maybeSingle(),
    'Failed to load menu item.',
  );

  return menuItemRow ? mapMenuItem(menuItemRow) : null;
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const orderRow = await readMaybeRow<OrderRow>(
    getSupabaseAdmin()
      .from('orders')
      .select('id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at')
      .eq('id', orderId)
      .maybeSingle(),
    'Failed to load order.',
  );

  return orderRow ? mapOrder(orderRow) : null;
}

export async function getOpenOrderByTableId(tableId: string): Promise<Order | null> {
  const orderRow = await readMaybeRow<OrderRow>(
    getSupabaseAdmin()
      .from('orders')
      .select('id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at')
      .eq('table_id', tableId)
      .eq('status', 'open')
      .maybeSingle(),
    'Failed to load open order.',
  );

  return orderRow ? mapOrder(orderRow) : null;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const order = await getOrderById(orderId);

  if (!order) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const [tableRow, orderItemRows, orderItemDetailRows] = await Promise.all([
    readMaybeRow<TableRow>(
      supabase
        .from('tables')
        .select('id, name, capacity, status, created_at')
        .eq('id', order.table_id)
        .maybeSingle(),
      'Failed to load order table.',
    ),
    readManyRows<OrderItemRow>(
      supabase
        .from('order_items')
        .select('id, order_id, menu_item_id, quantity, unit_price, note, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      'Failed to load order items.',
    ),
    readManyRows<OrderItemDetailsViewRow>(
      supabase
        .from('order_item_details')
        .select('id, order_id, quantity, unit_price, note, created_at, item_name, category_id, category_name')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      'Failed to load order item details.',
    ),
  ]);

  if (!tableRow) {
    throw serverError('Order references a missing table.');
  }

  const orderItems = orderItemRows.map(mapOrderItem);
  const orderItemDetailsById = new Map(orderItemDetailRows.map((item) => [item.id, item]));
  const logicalItemsByKey = new Map<string, LogicalOrderItemAccumulator>();

  for (const item of orderItems) {
    const detailRow = orderItemDetailsById.get(item.id);
    const groupKey = getOrderItemGroupKey(item);
    const sortKey = getOrderItemSortKey(item);
    const existing = logicalItemsByKey.get(groupKey);

    if (!existing) {
      logicalItemsByKey.set(groupKey, {
        detail: {
          ...item,
          item_name: detailRow?.item_name ?? 'Unknown item',
          category_name: detailRow?.category_name ?? 'Unknown category',
          menu_item_name: detailRow?.item_name ?? 'Unknown item',
        },
        sort_key: sortKey,
      });
      continue;
    }

    existing.detail.quantity += item.quantity;

    if (sortKey >= existing.sort_key) {
      existing.detail.id = item.id;
      existing.detail.menu_item_id = item.menu_item_id;
      existing.detail.unit_price = item.unit_price;
      existing.detail.note = item.note;
      existing.detail.created_at = item.created_at;
      existing.detail.item_name = detailRow?.item_name ?? existing.detail.item_name;
      existing.detail.category_name = detailRow?.category_name ?? existing.detail.category_name;
      existing.detail.menu_item_name = detailRow?.item_name ?? existing.detail.menu_item_name;
      existing.sort_key = sortKey;
    }
  }

  const orderItemDetails = Array.from(logicalItemsByKey.values())
    .sort((left, right) => left.sort_key.localeCompare(right.sort_key))
    .map((entry) => entry.detail);

  return {
    ...order,
    table: mapTable(tableRow),
    order_items: orderItemDetails,
    item_count: sumOrderQuantities(orderItemDetails),
  };
}

export async function listMenuCategoriesWithItems(): Promise<MenuCategoryWithItems[]> {
  const supabase = getSupabaseAdmin();
  const [categoryRows, menuItemRows] = await Promise.all([
    readManyRows<CategoryRow>(
      supabase
        .from('categories')
        .select('id, name, sort_order, created_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      'Failed to load categories.',
    ),
    readManyRows<MenuItemRow>(
      supabase
        .from('menu_items')
        .select('id, category_id, name, price, description, is_available, created_at')
        .order('created_at', { ascending: true }),
      'Failed to load menu items.',
    ),
  ]);

  const menuItemsByCategoryId = new Map<string, MenuItem[]>();

  for (const menuItem of menuItemRows.map(mapMenuItem)) {
    const categoryItems = menuItemsByCategoryId.get(menuItem.category_id) ?? [];
    categoryItems.push(menuItem);
    menuItemsByCategoryId.set(menuItem.category_id, categoryItems);
  }

  return categoryRows.map((categoryRow) => ({
    ...mapCategory(categoryRow),
    menu_items: menuItemsByCategoryId.get(categoryRow.id) ?? [],
  }));
}

export async function getNextCategorySortOrder(): Promise<number> {
  const categoryRows = await readManyRows<Pick<CategoryRow, 'sort_order'>>(
    getSupabaseAdmin()
      .from('categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1),
    'Failed to load category sort order.',
  );

  return categoryRows[0] ? categoryRows[0].sort_order + 1 : 0;
}

export async function recalculateOrderTotal(orderId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const orderItemRows = await readManyRows<OrderItemTotalRow>(
    supabase.from('order_items').select('quantity, unit_price').eq('order_id', orderId),
    'Failed to load order totals.',
  );

  const totalAmount = Number(
    orderItemRows.reduce((sum, item) => sum + item.quantity * toNumber(item.unit_price), 0).toFixed(2),
  );

  const { error } = await supabase.from('orders').update({ total_amount: totalAmount }).eq('id', orderId);

  if (error) {
    throw serverError('Failed to update order total.');
  }

  return totalAmount;
}

export async function applyOrderItemMutation(params: {
  orderId: string;
  action: 'add' | 'update' | 'delete';
  itemId?: string;
  menuItemId?: string;
  quantity?: number;
  note?: string | null;
}): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc('apply_order_item_mutation', {
    p_order_id: params.orderId,
    p_action: params.action,
    p_item_id: params.itemId ?? null,
    p_menu_item_id: params.menuItemId ?? null,
    p_quantity: params.quantity ?? null,
    p_note: params.note ?? null,
  });

  if (error) {
    switch (error.message) {
      case 'Order not found.':
        throw notFound('Order not found.');
      case 'Order item not found.':
        throw notFound('Order item not found.');
      case 'Menu item not found.':
        throw notFound('Menu item not found.');
      case 'Menu item is not currently available.':
        throw conflict('Menu item is not currently available.');
      case 'Cannot add items to a closed order.':
        throw conflict('Cannot add items to a closed order.');
      case 'Cannot update items on a closed order.':
        throw conflict('Cannot update items on a closed order.');
      case 'Cannot delete items from a closed order.':
        throw conflict('Cannot delete items from a closed order.');
      case 'quantity must be a positive integer.':
      case 'itemId is required.':
      case 'menu_item_id is required.':
      case 'Invalid order item mutation action.':
        throw badRequest(error.message);
      default:
        throw serverError('Failed to mutate order item.');
    }
  }

  return Number(data ?? 0);
}

export async function syncOrderToDesiredItems(
  orderId: string,
  desiredItems: OrderDraftSyncItem[],
): Promise<OrderDetail | null> {
  const currentOrder = await getOrderDetail(orderId);

  if (!currentOrder) {
    throw notFound('Order not found.');
  }

  if (currentOrder.status !== 'open') {
    throw conflict('Cannot sync items for a closed order.');
  }

  const desiredItemsByKey = new Map(
    desiredItems.map((item) => [
      `${item.menu_item_id}::${normalizeOrderItemNote(item.note)}`,
      item,
    ]),
  );
  const currentItemsByKey = new Map(
    currentOrder.order_items.map((item) => [
      `${item.menu_item_id}::${normalizeOrderItemNote(item.note)}`,
      item,
    ]),
  );

  for (const currentItem of currentOrder.order_items) {
    const key = `${currentItem.menu_item_id}::${normalizeOrderItemNote(currentItem.note)}`;
    const desiredItem = desiredItemsByKey.get(key);

    if (!desiredItem) {
      await applyOrderItemMutation({
        orderId,
        action: 'delete',
        itemId: currentItem.id,
      });
      continue;
    }

    if (desiredItem.quantity !== currentItem.quantity) {
      await applyOrderItemMutation({
        orderId,
        action: 'update',
        itemId: currentItem.id,
        quantity: desiredItem.quantity,
      });
    }
  }

  for (const desiredItem of desiredItems) {
    const key = `${desiredItem.menu_item_id}::${normalizeOrderItemNote(desiredItem.note)}`;

    if (currentItemsByKey.has(key)) {
      continue;
    }

    await applyOrderItemMutation({
      orderId,
      action: 'add',
      menuItemId: desiredItem.menu_item_id,
      quantity: desiredItem.quantity,
      note: desiredItem.note ?? null,
    });
  }

  return getOrderDetail(orderId);
}
