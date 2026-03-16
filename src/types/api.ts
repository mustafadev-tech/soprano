import type {
  Category,
  CreateMenuItemRequest,
  CreateTodoRequest,
  DailyReportSummary,
  DailyReportHistoryDay,
  CategoryReport,
  HourlyReport,
  ItemReport,
  MenuCategoryWithItems,
  MenuItem,
  OrderReport,
  OrderReportItem,
  OpenOrderSummary,
  OrderDetail,
  PaymentMethod,
  PaymentBreakdown,
  Profile,
  TableReport,
  TableDetail,
  TodoListItem,
  UpdateMenuItemRequest,
  UpdateTodoRequest,
  UserRole,
} from '@/types/contract';

export type ApiIdentifier = string;

export interface ApiErrorShape {
  message: string;
  code?: string;
}

export type UiTableStatus = 'available' | 'occupied' | 'reserved' | 'dirty';

export interface UiTable {
  id: string;
  name: string;
  number: number;
  capacity: number;
  status: UiTableStatus;
  currentOrderId: string | null;
  isOptimistic?: boolean;
}

export interface UiOrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  unitPrice: number;
  quantity: number;
  note: string | null;
  isOptimistic?: boolean;
}

export interface UiOrder {
  id: string;
  tableId: string;
  status: 'open' | 'paid';
  orderRevision: number;
  items: UiOrderItem[];
  createdAt: string;
  total: number;
  paymentMethod: Exclude<PaymentMethod, null> | null;
}

export interface UiOpenOrder {
  id: string;
  tableId: string;
  status: 'open' | 'paid';
  total: number;
  itemCount: number;
  paymentMethod: Exclude<PaymentMethod, null> | null;
  openedAt: string;
}

export interface UiMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  isOptimistic?: boolean;
}

export interface UiCategoryOption {
  id: string;
  name: string;
  sortOrder: number;
}

export interface UiMenuData {
  categories: UiCategoryOption[];
  menuItems: UiMenuItem[];
}

export interface UiProfile extends Profile {}

export interface UiTodo {
  id: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  completedById: string | null;
  createdByName: string | null;
  completedByName: string | null;
}

export interface UiReportSummary {
  totalRevenue: number;
  totalOrders: number;
  cashRevenue: number;
  cardRevenue: number;
  openOrdersCount: number;
}

export interface UiReportItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface UiReportOrderItem {
  itemName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
}

export interface UiReportOrder {
  orderId: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  paymentMethod: string | null;
  amount: number;
  items: UiReportOrderItem[];
}

export interface UiReportTableEntry {
  tableId: string;
  tableName: string;
  orderCount: number;
  total: number;
  orders: UiReportOrder[];
}

export interface UiReportCategoryEntry {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface UiReportPaymentEntry {
  id: string;
  method: string;
  orderCount: number;
  total: number;
}

export interface UiReportHourlyEntry {
  id: string;
  hour: string;
  orderCount: number;
  total: number;
}

export interface UiReportHistoryEntry {
  id: string;
  date: string;
  totalRevenue: number;
  totalOrders: number;
  cashRevenue: number;
  cardRevenue: number;
  openOrdersCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  snapshotUpdatedAt: string | null;
}

export interface UiDailyReport {
  date: string;
  generatedAt: string;
  snapshotUpdatedAt: string | null;
  source: 'live' | 'snapshot';
  summary: UiReportSummary;
  byTable: UiReportTableEntry[];
  byItem: UiReportItem[];
  byCategory: UiReportCategoryEntry[];
  paymentBreakdown: UiReportPaymentEntry[];
  hourlyBreakdown: UiReportHourlyEntry[];
  recentDays: UiReportHistoryEntry[];
}

function toUiTableStatus(status: TableDetail['status']): UiTableStatus {
  switch (status) {
    case 'empty':
      return 'available';
    case 'occupied':
      return 'occupied';
    case 'reserved':
      return 'reserved';
    default:
      return 'dirty';
  }
}

function getTableNumber(name: string, index: number): number {
  const match = name.match(/(\d+)/);

  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return index + 1;
}

export function mapTableDetailToUi(table: TableDetail, index: number): UiTable {
  return {
    id: table.id,
    name: table.name,
    number: getTableNumber(table.name, index),
    capacity: table.capacity,
    status: toUiTableStatus(table.status),
    currentOrderId: table.open_order?.id ?? null,
  };
}

export function mapOpenOrderSummaryToUi(
  tableId: string,
  order: OpenOrderSummary,
): UiOpenOrder {
  return {
    id: order.id,
    tableId,
    status: order.status === 'closed' ? 'paid' : 'open',
    total: order.total_amount,
    itemCount: order.item_count,
    paymentMethod: order.payment_method,
    openedAt: order.opened_at,
  };
}

export function mapOrderDetailToUi(order: OrderDetail): UiOrder {
  const items = order.order_items.map((item) => ({
    id: item.id,
    menuItemId: item.menu_item_id,
    name: item.menu_item_name,
    price: item.unit_price,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    note: item.note,
  }));

  return {
    id: order.id,
    tableId: order.table_id,
    status: order.status === 'closed' ? 'paid' : 'open',
    orderRevision: order.order_revision,
    items,
    createdAt: order.opened_at,
    total: order.total_amount,
    paymentMethod: order.payment_method,
  };
}

export function mapMenuItemToUi(
  item: MenuItem,
  categoriesById: ReadonlyMap<string, Pick<Category, 'id' | 'name'>>,
): UiMenuItem {
  const category = categoriesById.get(item.category_id);

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    available: item.is_available,
    imageUrl: null,
    categoryId: item.category_id,
    categoryName: category?.name ?? 'Bilinmeyen Kategori',
  };
}

export function flattenMenuCategories(categories: MenuCategoryWithItems[]): UiMenuData {
  const categoriesById = new Map<string, Pick<Category, 'id' | 'name'>>();

  for (const category of categories) {
    categoriesById.set(category.id, category);
  }

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sort_order,
    })),
    menuItems: categories.flatMap((category) =>
      category.menu_items.map((item) => mapMenuItemToUi(item, categoriesById)),
    ),
  };
}

export function toCreateMenuItemRequest(
  categoryId: string,
  item: Pick<UiMenuItem, 'name' | 'price' | 'description'>,
): CreateMenuItemRequest {
  return {
    category_id: categoryId,
    name: item.name,
    price: item.price,
    description: item.description,
  };
}

export function toUpdateMenuItemRequest(
  item: Partial<Pick<UiMenuItem, 'name' | 'price' | 'description' | 'available' | 'categoryId'>>,
): UpdateMenuItemRequest {
  return {
    category_id: item.categoryId,
    name: item.name,
    price: item.price,
    description: item.description,
    is_available: item.available,
  };
}

export function mapItemReportToUi(item: ItemReport, index: number): UiReportItem {
  const unitPrice = item.total_quantity > 0 ? item.total_revenue / item.total_quantity : 0;

  return {
    id: `${item.category_name}-${item.item_name}-${index}`,
    name: item.item_name,
    category: item.category_name,
    quantity: item.total_quantity,
    unitPrice,
    total: item.total_revenue,
  };
}

export function mapOrderReportItemToUi(item: OrderReportItem): UiReportOrderItem {
  return {
    itemName: item.item_name,
    categoryName: item.category_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
  };
}

export function mapOrderReportToUi(order: OrderReport): UiReportOrder {
  return {
    orderId: order.order_id,
    openedAt: order.opened_at,
    closedAt: order.closed_at,
    status: order.status,
    paymentMethod: order.payment_method,
    amount: order.total_amount,
    items: order.items.map(mapOrderReportItemToUi),
  };
}

export function mapTableReportToUi(table: TableReport, index: number): UiReportTableEntry {
  return {
    tableId: `${table.table_name}-${index}`,
    tableName: table.table_name,
    orderCount: table.orders.length,
    total: table.table_total,
    orders: table.orders.map(mapOrderReportToUi),
  };
}

export function mapCategoryReportToUi(
  category: CategoryReport,
  index: number,
): UiReportCategoryEntry {
  return {
    id: `${category.category_name}-${index}`,
    name: category.category_name,
    quantity: category.total_quantity,
    total: category.total_revenue,
  };
}

export function mapPaymentBreakdownToUi(
  breakdown: PaymentBreakdown,
  index: number,
): UiReportPaymentEntry {
  return {
    id: `${breakdown.payment_method}-${index}`,
    method: breakdown.payment_method,
    orderCount: breakdown.order_count,
    total: breakdown.total_revenue,
  };
}

export function mapHourlyReportToUi(hourly: HourlyReport, index: number): UiReportHourlyEntry {
  return {
    id: `${hourly.hour}-${index}`,
    hour: hourly.hour,
    orderCount: hourly.order_count,
    total: hourly.total_revenue,
  };
}

export function mapDailyHistoryToUi(
  day: DailyReportHistoryDay,
  index: number,
): UiReportHistoryEntry {
  return {
    id: `${day.date}-${index}`,
    date: day.date,
    totalRevenue: day.total_revenue,
    totalOrders: day.total_orders,
    cashRevenue: day.cash_total,
    cardRevenue: day.card_total,
    openOrdersCount: day.open_orders_count,
    firstOrderAt: day.first_order_at,
    lastOrderAt: day.last_order_at,
    snapshotUpdatedAt: day.snapshot_updated_at,
  };
}

export function mapDailyReportToUi(report: DailyReportSummary): UiDailyReport {
  return {
    date: report.date,
    generatedAt: report.generated_at,
    snapshotUpdatedAt: report.snapshot_updated_at,
    source: report.source,
    summary: {
      totalRevenue: report.summary.total_revenue,
      totalOrders: report.summary.total_orders,
      cashRevenue: report.summary.cash_total,
      cardRevenue: report.summary.card_total,
      openOrdersCount: report.summary.open_orders_count,
    },
    byTable: report.by_table.map(mapTableReportToUi),
    byItem: report.by_item.map(mapItemReportToUi),
    byCategory: report.by_category.map(mapCategoryReportToUi),
    paymentBreakdown: report.payment_breakdown.map(mapPaymentBreakdownToUi),
    hourlyBreakdown: report.hourly_breakdown.map(mapHourlyReportToUi),
    recentDays: report.recent_days.map(mapDailyHistoryToUi),
  };
}

export function mapProfileToUi(profile: Profile): UiProfile {
  return profile;
}

export function mapTodoToUi(todo: TodoListItem): UiTodo {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    isCompleted: todo.is_completed,
    createdAt: todo.created_at,
    updatedAt: todo.updated_at,
    createdById: todo.created_by,
    completedById: todo.completed_by,
    createdByName: todo.createdByName,
    completedByName: todo.completedByName,
  };
}

export function toCreateTodoRequest(todo: Pick<UiTodo, 'title' | 'description'>): CreateTodoRequest {
  return {
    title: todo.title,
    description: todo.description,
  };
}

export function toUpdateTodoRequest(
  todo: Partial<Pick<UiTodo, 'title' | 'description' | 'isCompleted'>>,
): UpdateTodoRequest {
  return {
    title: todo.title,
    description: todo.description,
    is_completed: todo.isCompleted,
  };
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'soprano_admin';
}
