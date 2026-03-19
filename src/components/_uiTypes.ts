export type TableStatus = 'available' | 'occupied' | 'reserved' | 'dirty';

export interface Table {
  id: string;
  number: number;
  capacity: number;
  status: TableStatus;
  currentOrderId: string | null;
}

export type OrderStatus = 'open' | 'sent' | 'ready' | 'paid' | 'cancelled';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;  // decimal (e.g., 45.00)
  quantity: number;
  note: string | null;
}

export interface Order {
  id: string;
  tableId: string;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: string;  // ISO 8601
  total: number;      // sum of (price * quantity)
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  categoryName: string;
  available: boolean;
  imageUrl: string | null;
}
