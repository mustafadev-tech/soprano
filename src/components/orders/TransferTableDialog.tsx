'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { UiTable, UiOpenOrder } from '@/types/api';

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface TransferTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTableName: string;
  tables: UiTable[];
  orders: UiOpenOrder[];
  currentTableId: string;
  onTransfer: (targetTableId: string) => Promise<void>;
}

export function TransferTableDialog({
  open,
  onOpenChange,
  sourceTableName,
  tables,
  orders,
  currentTableId,
  onTransfer,
}: TransferTableDialogProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedTableId(null);
      setPending(false);
    }
  }, [open]);

  const eligibleTables = tables.filter(
    (table) => table.id !== currentTableId && table.status !== 'dirty',
  );

  const selectedTableOrder = selectedTableId
    ? orders.find((order) => order.tableId === selectedTableId) ?? null
    : null;

  const selectedTableIsOccupied =
    selectedTableId !== null &&
    eligibleTables.find((t) => t.id === selectedTableId)?.status === 'occupied';

  async function handleConfirm() {
    if (!selectedTableId) return;
    setPending(true);
    try {
      await onTransfer(selectedTableId);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md max-h-[80vh]"
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-4">
          <DialogTitle className="text-base font-semibold">Masa Transfer Et</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            «{sourceTableName}» masasındaki siparişi hangi masaya taşımak istiyorsunuz?
          </p>
        </div>

        {/* Table list */}
        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col py-1">
            {eligibleTables.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Transfer edilebilecek masa yok
              </p>
            )}
            {eligibleTables.map((table) => {
              const tableOrder = orders.find((o) => o.tableId === table.id) ?? null;
              const isOccupied = table.status === 'occupied';
              const isSelected = selectedTableId === table.id;

              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(isSelected ? null : table.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    isSelected && 'bg-muted',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground">{table.name}</span>
                    {isOccupied && tableOrder ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {tableOrder.itemCount} ürün · {formatPrice(tableOrder.total)} ₺
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs font-medium',
                      isOccupied
                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {isOccupied ? 'Dolu' : table.status === 'reserved' ? 'Rezerve' : 'Boş'}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Warning */}
        {selectedTableIsOccupied && selectedTableOrder && (
          <div className="mx-4 mb-2 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Bu masada açık sipariş var. Siparişler birleştirilecek.
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-3 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            İptal
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={!selectedTableId || pending}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {pending ? (
              <Loader2 className="mr-1.5 animate-spin" strokeWidth={1.5} size={14} />
            ) : null}
            Transferi Onayla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
