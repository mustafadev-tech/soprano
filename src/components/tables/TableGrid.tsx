'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCard } from '@/components/tables/TableCard';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { UiTable, UiOpenOrder, UiTableStatus } from '@/types/api';

type FilterStatus = 'all' | UiTableStatus;

const filters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'available', label: 'Müsait' },
  { value: 'occupied', label: 'Dolu' },
  { value: 'reserved', label: 'Rezerve' },
  { value: 'dirty', label: 'Temizlenmeli' },
];

interface TableGridProps {
  tables: UiTable[];
  orders: UiOpenOrder[];
  selectedTableId: string | null;
  onSelectTable: (id: string) => void;
  onAddTable: (name: string, capacity: number) => void;
  onRemoveTable: (id: string) => void;
  onReserveTables?: (ids: string[]) => void;
  onStatusToggle?: (id: string) => void;
  onReservedToggle?: (id: string) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function TableGrid({
  tables,
  orders,
  selectedTableId,
  onSelectTable,
  onAddTable,
  onRemoveTable,
  onReserveTables,
  onStatusToggle,
  onReservedToggle,
  onSuccess,
  onError,
}: TableGridProps) {
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [reserveSelection, setReserveSelection] = useState<string[]>([]);
  const [addForm, setAddForm] = useState({ name: '', capacity: 4 });

  const filteredTables =
    activeFilter === 'all' ? tables : tables.filter((t) => t.status === activeFilter);
  const reservableTables = tables.filter(
    (table) => table.status === 'available' || table.status === 'occupied',
  );

  function toggleReserveSelection(id: string) {
    setReserveSelection((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Masalar</span>
        {activeFilter === 'reserved' ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-border bg-background"
            onClick={() => setReserveDialogOpen(true)}
          >
            Rezerve Masa Ekle
          </Button>
        ) : (
          <Button
            size="sm"
            className="rounded-xl bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
            onClick={() => setAddDialogOpen(true)}
          >
            Masa Ekle
          </Button>
        )}
      </div>

      {/* Filter strip */}
      <div className="flex items-center gap-3 overflow-x-auto border-b border-border pb-3 no-scrollbar sm:gap-4">
        {filters.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveFilter(value)}
            className={cn(
              'shrink-0 text-sm transition-colors duration-150',
              activeFilter === value
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {tables.length === 0 ? (
          Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTables.map((table) => {
              const tableOrder: UiOpenOrder | null = orders.find((o) => o.tableId === table.id) ?? null;
              return (
                <motion.div
                  key={table.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <TableCard
                    table={table}
                    order={tableOrder}
                    isSelected={selectedTableId === table.id}
                    onClick={() => onSelectTable(table.id)}
                    onRemove={(id) => setRemoveTargetId(id)}
                    onStatusToggle={onStatusToggle}
                    onReservedToggle={onReservedToggle}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Add Table Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Masa Ekle</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tname">Masa Adı</Label>
              <Input
                id="tname"
                placeholder="Masa 9"
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tcap">Kapasite</Label>
              <Input
                id="tcap"
                type="number"
                min={1}
                max={20}
                value={addForm.capacity}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, capacity: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
              İptal
            </Button>
            <Button
              onClick={() => {
                if (!addForm.name.trim()) return;
                onAddTable(addForm.name.trim(), addForm.capacity);
                onSuccess?.('Masa eklendi');
                setAddDialogOpen(false);
                setAddForm({ name: '', capacity: 4 });
              }}
            >
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reserveDialogOpen}
        onOpenChange={(open) => {
          setReserveDialogOpen(open);
          if (!open) {
            setReserveSelection([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Rezerve Masa Ekle</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Rezerveye taşımak istediğiniz aktif masaları seçin.
            </p>
            <ScrollArea className="max-h-72 rounded-lg border border-border">
              <div className="flex flex-col divide-y divide-border">
                {reservableTables.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Aktif masa bulunmuyor.</div>
                ) : (
                  reservableTables.map((table) => {
                    const checked = reserveSelection.includes(table.id);

                    return (
                      <div
                        key={table.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleReserveSelection(table.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleReserveSelection(table.id);
                          }
                        }}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors',
                          checked && 'bg-muted/60',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{table.name}</p>
                          <p className="text-xs text-muted-foreground">{table.capacity} kişi</p>
                        </div>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            const isChecked = nextChecked === true;

                            setReserveSelection((current) =>
                              isChecked
                                ? current.includes(table.id)
                                  ? current
                                  : [...current, table.id]
                                : current.filter((item) => item !== table.id),
                            );
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReserveDialogOpen(false)}>
              İptal
            </Button>
            <Button
              disabled={reserveSelection.length === 0}
              onClick={() => {
                if (reserveSelection.length === 0) return;
                onReserveTables?.(reserveSelection);
                onSuccess?.(`${reserveSelection.length} masa rezerveye eklendi`);
                setReserveDialogOpen(false);
                setReserveSelection([]);
              }}
            >
              Rezerveye Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Table AlertDialog */}
      <AlertDialog
        open={removeTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Masayı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu masayı silmek istediğinizden emin misiniz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTargetId) {
                  onRemoveTable(removeTargetId);
                  onSuccess?.('Masa silindi');
                  setRemoveTargetId(null);
                }
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
