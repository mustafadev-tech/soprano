import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CafeTable,
  Category,
  MenuCategoryWithItems,
  MenuItem,
  OpenOrderSummary,
  Order,
  OrderDetail,
  OrderDraftSyncItem,
  OrderItem,
  OrderItemDetail,
  OrderStatus,
  PaymentMethod,
  TableDetail,
  TableStatus,
} from '@/types/contract';

import { conflict, notFound, serverError } from '@/app/api/_server/http';

type NumericValue = number | string;
type DatabaseClient = SupabaseClient;

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
  closed_by: string | null;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: NumericValue;
  note: string | null;
  created_at: string;
  added_by: string | null;
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
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

interface LegacyOpenOrderRow {
  id: string;
  table_id: string;
  status: OrderStatus;
  payment_method: Exclude<PaymentMethod, null> | null;
  total_amount: NumericValue;
  order_revision: NumericValue;
  note: string | null;
  table_status_before_open: TableStatus | null;
  opened_at: string;
}

interface LogicalOrderItemAccumulator {
  detail: OrderItemDetail;
  sort_key: string;
}

function getRestoredTableStatus(tableStatusBeforeOpen: TableStatus | null): TableStatus {
  return tableStatusBeforeOpen === 'reserved' ? 'reserved' : 'empty';
}

function shouldReleaseTableForAmount(totalAmount: number, itemCount: number): boolean {
  return totalAmount <= 0 || itemCount <= 0;
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

function isMissingColumnError(
  error: SupabaseLikeError | null | undefined,
  columnName: string,
): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase();
  const normalizedColumnName = columnName.toLowerCase();

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (message.includes(normalizedColumnName) &&
      (message.includes('column') ||
        message.includes('schema cache') ||
        message.includes('does not exist')))
  );
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

function normalizeOrderItemNote(note: string | null | undefined): string {
  return note?.trim() ?? '';
}

function getOrderItemGroupKey(row: Pick<OrderItemRow, 'menu_item_id' | 'unit_price' | 'note'>): string {
  return `${row.menu_item_id}::${normalizeOrderItemNote(row.note)}::${toNumber(row.unit_price)}`;
}

function getLogicalOrderItemKey(
  row: Pick<OrderItemRow, 'menu_item_id' | 'note'> | Pick<OrderDraftSyncItem, 'menu_item_id' | 'note'>,
): string {
  return `${row.menu_item_id}::${normalizeOrderItemNote(row.note)}`;
}

function getOrderItemSortKey(row: Pick<OrderItemRow, 'created_at' | 'id'>): string {
  return `${row.created_at}::${row.id}`;
}

function pickRepresentativeOrderItem(
  rows: OrderItemRow[],
  preferredId?: string,
): OrderItemRow {
  const preferredRow = preferredId ? rows.find((row) => row.id === preferredId) : null;

  if (preferredRow) {
    return preferredRow;
  }

  return rows.reduce((latest, row) =>
    getOrderItemSortKey(row) > getOrderItemSortKey(latest) ? row : latest,
  );
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
    closed_at: row.closed_at ?? null,
    closed_by: row.closed_by ?? null,
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
    added_by: row.added_by ?? null,
  };
}

async function readOrderMaybeRow(
  supabase: DatabaseClient,
  configureQuery: (
    selectClause: string,
  ) => PromiseLike<{ data: OrderRow | null; error: SupabaseLikeError | null }>,
  message: string,
): Promise<OrderRow | null> {
  const fullSelect =
    'id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at, closed_by';
  const withoutClosedBy =
    'id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at, closed_at';
  const minimalSelect =
    'id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at';

  const attempts = [fullSelect, withoutClosedBy, minimalSelect];

  for (const selectClause of attempts) {
    const { data, error } = await configureQuery(selectClause);

    if (!error) {
      if (!data) {
        return null;
      }

      return {
        ...(data as Omit<OrderRow, 'closed_at' | 'closed_by'> & Partial<Pick<OrderRow, 'closed_at' | 'closed_by'>>),
        closed_at: data.closed_at ?? null,
        closed_by: data.closed_by ?? null,
      };
    }

    const missingClosedBy = isMissingColumnError(error, 'closed_by');
    const missingClosedAt = isMissingColumnError(error, 'closed_at');

    if (!missingClosedBy && !missingClosedAt) {
      throw serverError(message);
    }
  }

  throw serverError(message);
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

async function listRawOrderItems(
  supabase: DatabaseClient,
  orderId: string,
): Promise<OrderItemRow[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, order_id, menu_item_id, quantity, unit_price, note, created_at, added_by')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (!error) {
    return (data ?? []).map((row) => ({
      ...(row as Omit<OrderItemRow, 'added_by'> & Partial<Pick<OrderItemRow, 'added_by'>>),
      added_by: row.added_by ?? null,
    }));
  }

  if (!isMissingColumnError(error, 'added_by')) {
    throw serverError('Failed to load order items.');
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('order_items')
    .select('id, order_id, menu_item_id, quantity, unit_price, note, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (legacyError) {
    throw serverError('Failed to load order items.');
  }

  return (legacyData ?? []).map((row) => ({
    ...(row as Omit<OrderItemRow, 'added_by'>),
    added_by: null,
  }));
}

async function buildTableDetails(
  supabase: DatabaseClient,
  tableRows: TableRow[],
): Promise<TableDetail[]> {
  if (!tableRows.length) {
    return [];
  }

  const tableIds = tableRows.map((table) => table.id);
  const openOrderRows = await readManyRows<LegacyOpenOrderRow>(
    supabase
      .from('orders')
      .select(
        'id, table_id, status, payment_method, total_amount, order_revision, note, table_status_before_open, opened_at',
      )
      .in('table_id', tableIds)
      .eq('status', 'open'),
    'Failed to load open orders.',
  ).then((rows) =>
    rows.map((row) => ({
      ...row,
      closed_at: null,
      closed_by: null,
    })),
  );

  const orderIds = openOrderRows.map((order) => order.id);
  const openOrders = openOrderRows.map(mapOrder);
  const itemCountByOrderId = new Map<string, number>();

  if (orderIds.length > 0) {
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
    const itemCount = itemCountByOrderId.get(order.id) ?? 0;

    if (shouldReleaseTableForAmount(order.total_amount, itemCount)) {
      continue;
    }

    openOrderByTableId.set(
      order.table_id,
      mapOpenOrderSummary(order, itemCount),
    );
  }

  return tableRows.map((tableRow) => ({
    ...mapTable(tableRow),
    open_order: openOrderByTableId.get(tableRow.id) ?? null,
  }));
}

export async function listTablesWithOpenOrders(supabase: DatabaseClient): Promise<TableDetail[]> {
  const tableRows = await readManyRows<TableRow>(
    supabase
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    'Failed to load tables.',
  );

  return buildTableDetails(supabase, tableRows);
}

export async function getTableDetailById(
  supabase: DatabaseClient,
  tableId: string,
): Promise<TableDetail | null> {
  const tableRows = await readManyRows<TableRow>(
    supabase
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .eq('id', tableId)
      .is('deleted_at', null),
    'Failed to load table.',
  );

  if (tableRows.length === 0) {
    return null;
  }

  const [tableDetail] = await buildTableDetails(supabase, tableRows);
  return tableDetail ?? null;
}

export async function getTableById(
  supabase: DatabaseClient,
  tableId: string,
): Promise<CafeTable | null> {
  const tableRow = await readMaybeRow<TableRow>(
    supabase
      .from('tables')
      .select('id, name, capacity, status, created_at')
      .eq('id', tableId)
      .is('deleted_at', null)
      .maybeSingle(),
    'Failed to load table.',
  );

  return tableRow ? mapTable(tableRow) : null;
}

export async function getCategoryById(
  supabase: DatabaseClient,
  categoryId: string,
): Promise<Category | null> {
  const categoryRow = await readMaybeRow<CategoryRow>(
    supabase
      .from('categories')
      .select('id, name, sort_order, created_at')
      .eq('id', categoryId)
      .maybeSingle(),
    'Failed to load category.',
  );

  return categoryRow ? mapCategory(categoryRow) : null;
}

export async function getMenuItemById(
  supabase: DatabaseClient,
  menuItemId: string,
): Promise<MenuItem | null> {
  const menuItemRow = await readMaybeRow<MenuItemRow>(
    supabase
      .from('menu_items')
      .select('id, category_id, name, price, description, is_available, created_at')
      .eq('id', menuItemId)
      .maybeSingle(),
    'Failed to load menu item.',
  );

  return menuItemRow ? mapMenuItem(menuItemRow) : null;
}

export async function getOrderById(
  supabase: DatabaseClient,
  orderId: string,
): Promise<Order | null> {
  const orderRow = await readOrderMaybeRow(
    supabase,
    (selectClause) =>
      supabase
        .from('orders')
        .select(selectClause)
        .eq('id', orderId)
        .maybeSingle(),
    'Failed to load order.',
  );

  return orderRow ? mapOrder(orderRow) : null;
}

export async function getOpenOrderByTableId(
  supabase: DatabaseClient,
  tableId: string,
): Promise<Order | null> {
  const orderRow = await readOrderMaybeRow(
    supabase,
    (selectClause) =>
      supabase
        .from('orders')
        .select(selectClause)
        .eq('table_id', tableId)
        .eq('status', 'open')
        .maybeSingle(),
    'Failed to load open order.',
  );

  return orderRow ? mapOrder(orderRow) : null;
}

export async function getOrderDetail(
  supabase: DatabaseClient,
  orderId: string,
): Promise<OrderDetail | null> {
  const order = await getOrderById(supabase, orderId);

  if (!order) {
    return null;
  }

  const [tableRow, orderItemRows, orderItemDetailRows] = await Promise.all([
    readMaybeRow<TableRow>(
      supabase
        .from('tables')
        .select('id, name, capacity, status, created_at')
        .eq('id', order.table_id)
        .maybeSingle(),
      'Failed to load order table.',
    ),
    listRawOrderItems(supabase, orderId),
    readManyRows<OrderItemDetailsViewRow>(
      supabase
        .from('order_item_details')
        .select(
          'id, order_id, quantity, unit_price, note, created_at, item_name, category_id, category_name',
        )
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
      existing.detail.added_by = item.added_by;
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

export async function listMenuCategoriesWithItems(
  supabase: DatabaseClient,
): Promise<MenuCategoryWithItems[]> {
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

export async function getNextCategorySortOrder(supabase: DatabaseClient): Promise<number> {
  const categoryRows = await readManyRows<Pick<CategoryRow, 'sort_order'>>(
    supabase
      .from('categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1),
    'Failed to load category sort order.',
  );

  return categoryRows[0] ? categoryRows[0].sort_order + 1 : 0;
}

export async function recalculateOrderTotal(
  supabase: DatabaseClient,
  orderId: string,
): Promise<number> {
  const orderItemRows = await readManyRows<Pick<OrderItemRow, 'quantity' | 'unit_price'>>(
    supabase.from('order_items').select('quantity, unit_price').eq('order_id', orderId),
    'Failed to load order totals.',
  );

  const totalAmount = Number(
    orderItemRows.reduce((sum, item) => sum + item.quantity * toNumber(item.unit_price), 0).toFixed(2),
  );
  const itemCount = orderItemRows.reduce((sum, item) => sum + item.quantity, 0);

  const order = await getOrderById(supabase, orderId);

  if (!order) {
    throw notFound('Order not found.');
  }

  const { error } = await supabase
    .from('orders')
    .update({
      total_amount: totalAmount,
      order_revision: order.order_revision + 1,
    })
    .eq('id', orderId);

  if (error) {
    throw serverError('Failed to update order total.');
  }

  const nextTableStatus = shouldReleaseTableForAmount(totalAmount, itemCount)
    ? getRestoredTableStatus(order.table_status_before_open)
    : 'occupied';

  const { error: tableError } = await supabase
    .from('tables')
    .update({ status: nextTableStatus })
    .eq('id', order.table_id);

  if (tableError) {
    throw serverError('Failed to update table status.');
  }

  return totalAmount;
}

async function ensureOpenOrder(
  supabase: DatabaseClient,
  orderId: string,
): Promise<Order> {
  const order = await getOrderById(supabase, orderId);

  if (!order) {
    throw notFound('Order not found.');
  }

  if (order.status !== 'open') {
    throw conflict('Cannot add items to a closed order.');
  }

  return order;
}

async function ensureAvailableMenuItem(
  supabase: DatabaseClient,
  menuItemId: string,
): Promise<MenuItem> {
  const menuItem = await getMenuItemById(supabase, menuItemId);

  if (!menuItem) {
    throw notFound('Menu item not found.');
  }

  if (!menuItem.is_available) {
    throw conflict('Menu item is not currently available.');
  }

  return menuItem;
}

async function setOrderItemGroupQuantity(
  supabase: DatabaseClient,
  rows: OrderItemRow[],
  quantity: number,
  preferredId?: string,
): Promise<void> {
  const representative = pickRepresentativeOrderItem(rows, preferredId);
  const duplicateIds = rows
    .filter((row) => row.id !== representative.id)
    .map((row) => row.id);

  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      quantity,
      note: normalizeOrderItemNote(representative.note) || null,
    })
    .eq('id', representative.id);

  if (updateError) {
    throw serverError('Failed to mutate order item.');
  }

  if (duplicateIds.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase.from('order_items').delete().in('id', duplicateIds);

  if (deleteError) {
    throw serverError('Failed to mutate order item.');
  }
}

export async function applyOrderItemMutation(
  supabase: DatabaseClient,
  params: {
    orderId: string;
    action: 'add' | 'update' | 'delete';
    itemId?: string;
    menuItemId?: string;
    quantity?: number;
    note?: string | null;
    actorId?: string;
  },
): Promise<number> {
  const order = await ensureOpenOrder(supabase, params.orderId);
  const rawOrderItems = await listRawOrderItems(supabase, order.id);

  if (params.action === 'add') {
    if (!params.menuItemId || !params.quantity) {
      throw serverError('Failed to mutate order item.');
    }

    const menuItem = await ensureAvailableMenuItem(supabase, params.menuItemId);
    const groupRows = rawOrderItems.filter(
      (row) => getLogicalOrderItemKey(row) === getLogicalOrderItemKey({
        menu_item_id: params.menuItemId!,
        note: params.note ?? null,
      }),
    );

    if (groupRows.length > 0) {
      const nextQuantity = groupRows.reduce((sum, row) => sum + row.quantity, 0) + params.quantity;
      await setOrderItemGroupQuantity(supabase, groupRows, nextQuantity);
      await recalculateOrderTotal(supabase, order.id);
      return nextQuantity;
    }

    const { error } = await supabase.from('order_items').insert({
      order_id: order.id,
      menu_item_id: menuItem.id,
      quantity: params.quantity,
      unit_price: menuItem.price,
      note: normalizeOrderItemNote(params.note) || null,
      added_by: params.actorId ?? null,
    });

    if (error && !isMissingColumnError(error, 'added_by')) {
      throw serverError('Failed to mutate order item.');
    }

    if (error) {
      const { error: legacyInsertError } = await supabase.from('order_items').insert({
        order_id: order.id,
        menu_item_id: menuItem.id,
        quantity: params.quantity,
        unit_price: menuItem.price,
        note: normalizeOrderItemNote(params.note) || null,
      });

      if (legacyInsertError) {
        throw serverError('Failed to mutate order item.');
      }
    }

    await recalculateOrderTotal(supabase, order.id);
    return params.quantity;
  }

  if (!params.itemId) {
    throw serverError('Failed to mutate order item.');
  }

  const targetRow = rawOrderItems.find((row) => row.id === params.itemId);

  if (!targetRow) {
    throw notFound('Order item not found.');
  }

  const groupRows = rawOrderItems.filter(
    (row) => getLogicalOrderItemKey(row) === getLogicalOrderItemKey(targetRow),
  );

  if (params.action === 'update') {
    if (!params.quantity) {
      throw serverError('Failed to mutate order item.');
    }

    await setOrderItemGroupQuantity(supabase, groupRows, params.quantity, targetRow.id);
    await recalculateOrderTotal(supabase, order.id);
    return params.quantity;
  }

  const groupIds = groupRows.map((row) => row.id);
  const { error } = await supabase.from('order_items').delete().in('id', groupIds);

  if (error) {
    throw serverError('Failed to mutate order item.');
  }

  await recalculateOrderTotal(supabase, order.id);
  return 0;
}

export async function syncOrderToDesiredItems(
  supabase: DatabaseClient,
  orderId: string,
  desiredItems: OrderDraftSyncItem[],
  actorId?: string,
): Promise<OrderDetail | null> {
  const currentOrder = await getOrderDetail(supabase, orderId);

  if (!currentOrder) {
    throw notFound('Order not found.');
  }

  if (currentOrder.status !== 'open') {
    throw conflict('Cannot sync items for a closed order.');
  }

  let latestOrder = currentOrder;

  for (const desiredItem of desiredItems) {
    const matchingItem = latestOrder.order_items.find((item) =>
      getLogicalOrderItemKey(item) === getLogicalOrderItemKey(desiredItem),
    );

    if (desiredItem.quantity <= 0) {
      if (!matchingItem) {
        continue;
      }

      await applyOrderItemMutation(supabase, {
        orderId,
        action: 'delete',
        itemId: matchingItem.id,
      });
      latestOrder = (await getOrderDetail(supabase, orderId)) ?? latestOrder;
      continue;
    }

    if (matchingItem) {
      if (matchingItem.quantity === desiredItem.quantity) {
        continue;
      }

      await applyOrderItemMutation(supabase, {
        orderId,
        action: 'update',
        itemId: matchingItem.id,
        quantity: desiredItem.quantity,
      });
      latestOrder = (await getOrderDetail(supabase, orderId)) ?? latestOrder;
      continue;
    }

    await applyOrderItemMutation(supabase, {
      orderId,
      action: 'add',
      menuItemId: desiredItem.menu_item_id,
      quantity: desiredItem.quantity,
      note: desiredItem.note ?? null,
      actorId,
    });
    latestOrder = (await getOrderDetail(supabase, orderId)) ?? latestOrder;
  }

  return latestOrder;
}
