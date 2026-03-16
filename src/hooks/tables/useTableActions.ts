import { useState } from 'react';
import { toast } from 'sonner';

import { createClientId } from '@/lib/clientId';
import { createOptimisticUpdate } from '@/lib/optimisticState';
import {
  apiDelete,
  apiPatch,
  apiPost,
  clearCache,
  getApiErrorMessage,
  unwrapApiResponse,
} from '@/lib/apiClient';
import type {
  CafeTable,
  CreateTableRequest,
  CreateTableResponse,
  DeleteOrderResponse,
  DeleteTableResponse,
  ToggleTableStatusResponse,
  UpdateTableStatusRequest,
  UpdateTableStatusResponse,
} from '@/types/contract';
import { getTablesStoreState, setTablesStoreState } from '@/hooks/tables/useTables';
import type { UiTable, UiTableStatus } from '@/types/api';

interface UseTableActionsResult {
  addTable: (name: string, capacity: number) => Promise<CafeTable | null>;
  removeTable: (id: string) => Promise<boolean>;
  toggleStatus: (id: string) => Promise<CafeTable | null>;
  reserveTables: (ids: string[]) => Promise<boolean>;
  releaseReservedTable: (id: string) => Promise<CafeTable | null>;
  loading: boolean;
  error: string | null;
}

function getNextTableNumber(tables: UiTable[]): number {
  return tables.reduce((maxNumber, table) => Math.max(maxNumber, table.number), 0) + 1;
}

function getToggledUiStatus(status: UiTableStatus): UiTableStatus {
  return status === 'available' ? 'occupied' : 'available';
}

function mapTableApiStatusToUi(status: CafeTable['status']): UiTableStatus {
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

export function useTableActions(_refetch?: () => Promise<void>): UseTableActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTable(name: string, capacity: number): Promise<CafeTable | null> {
    setLoading(true);
    setError(null);

    const previousState = getTablesStoreState();
    const tempId = createClientId('temp:');
    const optimisticTable: UiTable = {
      id: tempId,
      name,
      number: getNextTableNumber(previousState.tables),
      capacity,
      status: 'available',
      currentOrderId: null,
      isOptimistic: true,
    };

    setTablesStoreState((state) => ({
      ...state,
      tables: [...state.tables, optimisticTable],
    }));

    try {
      const createdTable = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getTablesStoreState(),
        apiCall: async () =>
          unwrapApiResponse(
            apiPost<CreateTableResponse, CreateTableRequest>('/api/tables', { name, capacity }),
          ),
        onSuccess: (result) => {
          setTablesStoreState((state) => ({
            ...state,
            tables: state.tables.map((table) =>
              table.id === tempId
                ? {
                    ...table,
                    id: result.id,
                    name: result.name,
                    capacity: result.capacity,
                    isOptimistic: false,
                  }
                : table,
            ),
          }));
          clearCache('/api/tables');
          toast.success('Masa eklendi');
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError, 'Masa eklenemedi, tekrar deneyin'));
          toast.error('Masa eklenemedi, tekrar deneyin');
        },
        onRollback: (state) => {
          setTablesStoreState(state);
        },
      });

      return createdTable;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function removeTable(id: string): Promise<boolean> {
    setLoading(true);
    setError(null);

    const previousState = getTablesStoreState();
    const currentTable = previousState.tables.find((table) => table.id === id) ?? null;
    const currentOrder = previousState.orders.find((order) => order.tableId === id) ?? null;

    if (currentTable?.currentOrderId && currentOrder?.total === 0 && currentOrder.itemCount === 0) {
      try {
        await unwrapApiResponse(
          apiDelete<DeleteOrderResponse>(`/api/orders/${currentTable.currentOrderId}`),
        );
        clearCache('/api/tables');
      } catch {
        // Let the normal delete path report the failure if cleanup could not complete.
      }
    }

    setTablesStoreState((state) => ({
      ...state,
      tables: state.tables.filter((table) => table.id !== id),
      orders: state.orders.filter((order) => order.tableId !== id),
    }));

    try {
      await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getTablesStoreState(),
        apiCall: async () => {
          const response = await apiDelete<DeleteTableResponse>(`/api/tables/${id}`);

          if (response.data.error) {
            throw new Error(response.data.error);
          }

          return true;
        },
        onSuccess: () => {
          clearCache('/api/tables');
          toast.success('Masa silindi');
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError, 'Islem gerceklestirilemedi, tekrar deneyin');
          setError(message);
          toast.error(message);
        },
        onRollback: (state) => {
          setTablesStoreState(state);
        },
      });

      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(id: string): Promise<CafeTable | null> {
    setLoading(true);
    setError(null);

    const previousState = getTablesStoreState();
    const currentTable = previousState.tables.find((table) => table.id === id);

    if (!currentTable || (currentTable.status !== 'available' && currentTable.status !== 'occupied')) {
      setLoading(false);
      return null;
    }

    setTablesStoreState((state) => ({
      ...state,
      tables: state.tables.map((table) =>
        table.id === id
          ? { ...table, status: getToggledUiStatus(table.status) }
          : table,
      ),
    }));

    try {
      const updatedTable = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getTablesStoreState(),
        apiCall: async () =>
          unwrapApiResponse(apiPost<ToggleTableStatusResponse>(`/api/tables/${id}/toggle-status`)),
        onSuccess: (result) => {
          setTablesStoreState((state) => ({
            ...state,
            tables: state.tables.map((table) =>
              table.id === id
                ? {
                    ...table,
                    status: mapTableApiStatusToUi(result.status),
                  }
                : table,
            ),
          }));
          clearCache('/api/tables');
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError, 'Masa durumu guncellenemedi');
          setError(message);
          toast.error(message);
        },
        onRollback: (state) => {
          setTablesStoreState(state);
        },
      });

      return updatedTable;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function reserveTables(ids: string[]): Promise<boolean> {
    const tableIds = Array.from(new Set(ids));

    if (tableIds.length === 0) {
      return false;
    }

    setLoading(true);
    setError(null);

    const previousState = getTablesStoreState();
    const eligibleIds = new Set(
      previousState.tables
        .filter((table) => tableIds.includes(table.id) && table.status !== 'reserved')
        .map((table) => table.id),
    );

    if (eligibleIds.size === 0) {
      setLoading(false);
      return false;
    }

    setTablesStoreState((state) => ({
      ...state,
      tables: state.tables.map((table) =>
        eligibleIds.has(table.id)
          ? {
              ...table,
              status: 'reserved',
            }
          : table,
      ),
    }));

    try {
      await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getTablesStoreState(),
        apiCall: async () => {
          await Promise.all(
            Array.from(eligibleIds).map((id) =>
              unwrapApiResponse(
                apiPatch<UpdateTableStatusResponse, UpdateTableStatusRequest>(`/api/tables/${id}`, {
                  status: 'reserved',
                }),
              ),
            ),
          );

          return true;
        },
        onSuccess: () => {
          clearCache('/api/tables');
          toast.success(`${eligibleIds.size} masa rezerveye alindi`);
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError, 'Masalar rezerveye alinamadi');
          setError(message);
          toast.error(message);
        },
        onRollback: (state) => {
          setTablesStoreState(state);
        },
      });

      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function releaseReservedTable(id: string): Promise<CafeTable | null> {
    setLoading(true);
    setError(null);

    const previousState = getTablesStoreState();
    const currentTable = previousState.tables.find((table) => table.id === id);

    if (!currentTable || currentTable.status !== 'reserved') {
      setLoading(false);
      return null;
    }

    setTablesStoreState((state) => ({
      ...state,
      tables: state.tables.map((table) =>
        table.id === id
          ? {
              ...table,
              status: 'available',
            }
          : table,
      ),
    }));

    try {
      const updatedTable = await createOptimisticUpdate({
        currentState: previousState,
        optimisticUpdate: () => getTablesStoreState(),
        apiCall: async () =>
          unwrapApiResponse(
            apiPatch<UpdateTableStatusResponse, UpdateTableStatusRequest>(`/api/tables/${id}`, {
              status: 'empty',
            }),
          ),
        onSuccess: (result) => {
          setTablesStoreState((state) => ({
            ...state,
            tables: state.tables.map((table) =>
              table.id === id
                ? {
                    ...table,
                    status: mapTableApiStatusToUi(result.status),
                  }
                : table,
            ),
          }));
          clearCache('/api/tables');
        },
        onError: (mutationError) => {
          const message = getApiErrorMessage(mutationError, 'Rezerve masa guncellenemedi');
          setError(message);
          toast.error(message);
        },
        onRollback: (state) => {
          setTablesStoreState(state);
        },
      });

      return updatedTable;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }

  return {
    addTable,
    removeTable,
    toggleStatus,
    reserveTables,
    releaseReservedTable,
    loading,
    error,
  };
}
