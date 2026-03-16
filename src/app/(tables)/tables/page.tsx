'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TableGrid } from '@/components/tables/TableGrid';
import { OrderPanel } from '@/components/orders/OrderPanel';
import { useMenu } from '@/hooks/menu/useMenu';
import { refetchOrderStore, useOrder } from '@/hooks/orders/useOrder';
import { useOrderActions } from '@/hooks/orders/useOrderActions';
import { useTableActions } from '@/hooks/tables/useTableActions';
import { useTables } from '@/hooks/tables/useTables';

function isTempOrderId(orderId: string | null): boolean {
  return Boolean(orderId?.startsWith('temp:order:'));
}

export default function TablesPage() {
  const {
    tables,
    orders,
    error: tablesError,
    syncError: tablesSyncError,
  } = useTables();
  const { categories, menuItems, error: menuError } = useMenu();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const lastErrorRef = useRef<string | null>(null);
  const selectedTableIdRef = useRef<string | null>(null);
  const {
    order: currentOrder,
    error: orderError,
    syncError: orderSyncError,
  } = useOrder(selectedOrderId);
  const {
    createOptimisticOrder,
    openOrder,
    closeOrder,
    addItem,
    updateItemQuantity,
    removeItem,
    error: orderActionError,
  } = useOrderActions();
  const {
    addTable,
    removeTable,
    reserveTables,
    releaseReservedTable,
    toggleStatus,
    error: tableActionError,
  } = useTableActions();

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedTableOrder = orders.find((order) => order.tableId === selectedTableId) ?? null;
  const totalError =
    tableActionError ??
    orderActionError ??
    orderError ??
    orderSyncError ??
    tablesError ??
    tablesSyncError ??
    menuError;

  useEffect(() => {
    selectedTableIdRef.current = selectedTableId;
  }, [selectedTableId]);

  useEffect(() => {
    if (totalError && totalError !== lastErrorRef.current) {
      toast.error(totalError);
      lastErrorRef.current = totalError;
      return;
    }

    if (!totalError) {
      lastErrorRef.current = null;
    }
  }, [totalError]);

  async function handleSelectTable(tableId: string) {
    const table = tables.find((entry) => entry.id === tableId);

    if (!table) {
      return;
    }

    setSelectedTableId(tableId);
    setPanelOpen(true);

    if (table.currentOrderId) {
      void refetchOrderStore(table.currentOrderId, { fresh: true, background: true });
      setSelectedOrderId(table.currentOrderId);

      if (isTempOrderId(table.currentOrderId)) {
        void openOrder(tableId).then((createdOrder) => {
          if (createdOrder && selectedTableIdRef.current === tableId) {
            setSelectedOrderId(createdOrder.id);
          }
        });
      }

      return;
    }

    const optimisticOrder = createOptimisticOrder(tableId);
    setSelectedOrderId(optimisticOrder.id);

    void openOrder(tableId).then((createdOrder) => {
      if (createdOrder && selectedTableIdRef.current === tableId) {
        setSelectedOrderId(createdOrder.id);
      }
    });
  }

  async function handleAddItem(item: { id: string }) {
    let orderId = selectedOrderId ?? selectedTableOrder?.id ?? null;

    if (!orderId && selectedTableId) {
      const optimisticOrder = createOptimisticOrder(selectedTableId);
      orderId = optimisticOrder.id;
      setSelectedOrderId(optimisticOrder.id);

      void openOrder(selectedTableId).then((createdOrder) => {
        if (createdOrder && selectedTableIdRef.current === selectedTableId) {
          setSelectedOrderId(createdOrder.id);
        }
      });
    }

    if (!orderId) {
      toast.error('Siparis hazir degil, tekrar deneyin');
      return;
    }

    await addItem(orderId, item.id);
  }

  async function handleIncrementItem(itemId: string) {
    const item = currentOrder?.items.find((entry) => entry.id === itemId);

    if (!selectedOrderId || !item) {
      return;
    }

    await updateItemQuantity(selectedOrderId, itemId, item.quantity + 1);
  }

  async function handleDecrementItem(itemId: string) {
    const item = currentOrder?.items.find((entry) => entry.id === itemId);

    if (!selectedOrderId || !item) {
      return;
    }

    if (item.quantity <= 1) {
      await removeItem(selectedOrderId, itemId);
    } else {
      await updateItemQuantity(selectedOrderId, itemId, item.quantity - 1);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedOrderId) {
      return;
    }

    await removeItem(selectedOrderId, itemId);
  }

  async function handlePanelOpenChange(isOpen: boolean) {
    setPanelOpen(isOpen);

    if (!isOpen) {
      setSelectedOrderId(null);
      setSelectedTableId(null);
    }
  }

  async function handleAddTable(name: string, capacity: number) {
    await addTable(name, capacity);
  }

  async function handleRemoveTable(id: string) {
    await removeTable(id);
  }

  async function handleReserveTables(ids: string[]) {
    await reserveTables(ids);
  }

  async function handleReleaseReservedTable(id: string) {
    await releaseReservedTable(id);
  }

  async function handleCloseOrder(method: 'cash' | 'card') {
    if (!selectedOrderId) {
      return;
    }

    const paymentMethod = method === 'card' ? 'credit_card' : 'cash';
    const result = await closeOrder(selectedOrderId, paymentMethod);

    if (result) {
      setPanelOpen(false);
      setSelectedOrderId(null);
      setSelectedTableId(null);
    }
  }

  return (
    <div className="p-6">
      <TableGrid
        tables={tables}
        orders={orders}
        selectedTableId={selectedTableId}
        onSelectTable={handleSelectTable}
        onAddTable={handleAddTable}
        onRemoveTable={handleRemoveTable}
        onReserveTables={handleReserveTables}
        onStatusToggle={toggleStatus}
        onReservedToggle={handleReleaseReservedTable}
      />
      <OrderPanel
        open={panelOpen}
        onOpenChange={handlePanelOpenChange}
        order={currentOrder}
        tableName={selectedTable?.name ?? null}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          sortOrder: category.sort_order,
        }))}
        menuItems={menuItems}
        onAddItem={handleAddItem}
        onIncrement={handleIncrementItem}
        onDecrement={handleDecrementItem}
        onRemove={handleRemoveItem}
        onCloseOrder={handleCloseOrder}
      />
    </div>
  );
}
