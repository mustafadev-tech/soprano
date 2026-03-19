// Maintained by AGENT-2. Read only for AGENT-1 and AGENT-3.

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export type TableStatus = 'empty' | 'occupied' | 'reserved';
export type OrderStatus = 'open' | 'closed';
export type PaymentMethod = 'cash' | 'credit_card' | null;
export type UserRole = 'soprano_garson' | 'soprano_admin';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface CafeTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  price: number;
  description: string | null;
  is_available: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  table_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  total_amount: number;
  order_revision: number;
  note: string | null;
  table_status_before_open: TableStatus | null;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  note: string | null;
  created_at: string;
  added_by: string | null;
}

export interface OpenOrderSummary {
  id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  total_amount: number;
  opened_at: string;
  item_count: number;
}

export interface TableDetail extends CafeTable {
  open_order: OpenOrderSummary | null;
}

export interface OrderItemDetail extends OrderItem {
  item_name: string;
  category_name: string;
  menu_item_name: string;
}

export interface OrderDetail extends Order {
  table: CafeTable;
  order_items: OrderItemDetail[];
  item_count: number;
}

export interface MenuCategoryWithItems extends Category {
  menu_items: MenuItem[];
}

export interface DeletedRecord {
  id: string;
}

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TodoListItem extends Todo {
  createdByName: string | null;
  completedByName: string | null;
}

export interface DeletedBillItem {
  menu_item_name: string;
  quantity: number;
  unit_price: number;
}

export interface DeletedBill {
  id: string;
  original_order_id: string;
  table_name: string;
  total_amount: number;
  deleted_by_name: string | null;
  deleted_at: string;
  items: DeletedBillItem[];
}

export interface DailyReportSummary {
  date: string;
  generated_at: string;
  snapshot_updated_at: string | null;
  source: 'live' | 'snapshot';
  summary: {
    total_revenue: number;
    total_orders: number;
    cash_total: number;
    card_total: number;
    open_orders_count: number;
  };
  by_table: TableReport[];
  by_item: ItemReport[];
  by_category: CategoryReport[];
  payment_breakdown: PaymentBreakdown[];
  hourly_breakdown: HourlyReport[];
  recent_days: DailyReportHistoryDay[];
  deleted_bills: DeletedBill[];
}

export interface TableReport {
  table_name: string;
  orders: OrderReport[];
  table_total: number;
}

export interface OrderReport {
  order_id: string;
  opened_at: string;
  closed_at: string | null;
  status: string;
  payment_method: string | null;
  total_amount: number;
  items: OrderReportItem[];
}

export interface OrderReportItem {
  item_name: string;
  category_name: string;
  quantity: number;
  unit_price: number;
}

export interface ItemReport {
  item_name: string;
  category_name: string;
  total_quantity: number;
  total_revenue: number;
}

export interface CategoryReport {
  category_name: string;
  total_quantity: number;
  total_revenue: number;
}

export interface PaymentBreakdown {
  payment_method: string;
  order_count: number;
  total_revenue: number;
}

export interface HourlyReport {
  hour: string;
  order_count: number;
  total_revenue: number;
}

export interface DailyReportHistoryDay {
  date: string;
  total_revenue: number;
  total_orders: number;
  cash_total: number;
  card_total: number;
  open_orders_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  snapshot_updated_at: string | null;
}

export interface UpdateTableStatusRequest {
  status: TableStatus;
}

export interface CreateTableRequest {
  name: string;
  capacity: number;
}

export interface CreateOrderRequest {
  table_id: string;
}

export interface CloseOrderRequest {
  payment_method: Exclude<PaymentMethod, null>;
}

export interface AddOrderItemRequest {
  menu_item_id: string;
  quantity: number;
  note?: string | null;
}

export interface UpdateOrderItemRequest {
  quantity: number;
}

export interface OrderDraftSyncItem {
  menu_item_id: string;
  quantity: number;
  note?: string | null;
}

export interface OrderDraftSyncEntry {
  order_id: string;
  order_revision: number;
  items: OrderDraftSyncItem[];
}

export interface OrderDraftSyncRequest {
  drafts: OrderDraftSyncEntry[];
}

export interface CreateMenuItemRequest {
  category_id: string;
  name: string;
  price: number;
  description?: string | null;
}

export interface UpdateMenuItemRequest {
  category_id?: string;
  name?: string;
  price?: number;
  is_available?: boolean;
  description?: string | null;
}

export interface CreateCategoryRequest {
  name: string;
}

export interface UpdateCategoryRequest {
  name: string;
}

export interface CreateTodoRequest {
  title: string;
  description?: string | null;
}

export interface UpdateTodoRequest {
  title?: string;
  description?: string | null;
  is_completed?: boolean;
}

export type GetTablesResponse = ApiResponse<TableDetail[]>;
export type CreateTableResponse = ApiResponse<CafeTable>;
export type GetTableByIdResponse = ApiResponse<TableDetail>;
export type UpdateTableStatusResponse = ApiResponse<CafeTable>;
export type ToggleTableStatusResponse = ApiResponse<CafeTable>;
export type DeleteTableResponse = ApiResponse<null>;

export type GetOrderByIdResponse = ApiResponse<OrderDetail>;
export type CreateOrderResponse = ApiResponse<OrderDetail>;
export type CloseOrderResponse = ApiResponse<OrderDetail>;
export type AddOrderItemResponse = ApiResponse<OrderDetail>;
export type UpdateOrderItemResponse = ApiResponse<OrderDetail>;
export type DeleteOrderItemResponse = ApiResponse<OrderDetail>;
export type DeleteOrderResponse = ApiResponse<DeletedRecord>;
export type SyncOrderDraftsResponse = ApiResponse<{ synced_order_ids: string[] }>;

export type GetMenuResponse = ApiResponse<MenuCategoryWithItems[]>;
export type CreateMenuItemResponse = ApiResponse<MenuItem>;
export type UpdateMenuItemResponse = ApiResponse<MenuItem>;
export type DeleteMenuItemResponse = ApiResponse<DeletedRecord>;
export type CreateCategoryResponse = ApiResponse<Category>;
export type UpdateCategoryResponse = ApiResponse<Category>;
export type GetCurrentUserResponse = ApiResponse<Profile>;
export type GetTodosResponse = ApiResponse<TodoListItem[]>;
export type CreateTodoResponse = ApiResponse<TodoListItem>;
export type UpdateTodoResponse = ApiResponse<TodoListItem>;
export type DeleteTodoResponse = ApiResponse<DeletedRecord>;
export type DeleteCategoryResponse = ApiResponse<DeletedRecord>;
export type GetDailyReportResponse = ApiResponse<DailyReportSummary>;
export type GetDailyReportExportResponse = string;
export type DeleteBillResponse = ApiResponse<{ success: boolean }>;
export interface TransferOrderRequest { target_table_id: string; }
export type TransferOrderResponse = ApiResponse<OrderDetail>;

export interface SopranoCafeApiContract {
  'GET /api/tables': {
    response: GetTablesResponse;
  };
  'POST /api/tables': {
    body: CreateTableRequest;
    response: CreateTableResponse;
  };
  'GET /api/tables/[id]': {
    response: GetTableByIdResponse;
  };
  'PATCH /api/tables/[id]': {
    body: UpdateTableStatusRequest;
    response: UpdateTableStatusResponse;
  };
  'POST /api/tables/[id]/toggle-status': {
    response: ToggleTableStatusResponse;
  };
  'DELETE /api/tables/[id]': {
    response: DeleteTableResponse;
  };
  'GET /api/orders/[id]': {
    response: GetOrderByIdResponse;
  };
  'POST /api/orders': {
    body: CreateOrderRequest;
    response: CreateOrderResponse;
  };
  'POST /api/orders/[id]/close': {
    body: CloseOrderRequest;
    response: CloseOrderResponse;
  };
  'POST /api/orders/[id]/items': {
    body: AddOrderItemRequest;
    response: AddOrderItemResponse;
  };
  'PATCH /api/orders/[id]/items/[itemId]': {
    body: UpdateOrderItemRequest;
    response: UpdateOrderItemResponse;
  };
  'DELETE /api/orders/[id]/items/[itemId]': {
    response: DeleteOrderItemResponse;
  };
  'POST /api/orders/draft-sync': {
    body: OrderDraftSyncRequest;
    response: SyncOrderDraftsResponse;
  };
  'GET /api/menu': {
    response: GetMenuResponse;
  };
  'POST /api/menu/items': {
    body: CreateMenuItemRequest;
    response: CreateMenuItemResponse;
  };
  'PATCH /api/menu/items/[id]': {
    body: UpdateMenuItemRequest;
    response: UpdateMenuItemResponse;
  };
  'DELETE /api/menu/items/[id]': {
    response: DeleteMenuItemResponse;
  };
  'POST /api/menu/categories': {
    body: CreateCategoryRequest;
    response: CreateCategoryResponse;
  };
  'PATCH /api/menu/categories/[id]': {
    body: UpdateCategoryRequest;
    response: UpdateCategoryResponse;
  };
  'DELETE /api/menu/categories/[id]': {
    response: DeleteCategoryResponse;
  };
  'GET /api/reports/daily': {
    response: GetDailyReportResponse;
  };
  'GET /api/reports/daily/export': {
    response: GetDailyReportExportResponse;
  };
}
