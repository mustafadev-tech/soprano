'use client';

import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { UiTable, UiOpenOrder } from '@/types/api';

function getOrderColor(order: UiOpenOrder | null): 'none' | 'open' | 'paid' {
  if (!order) return 'none';
  return order.status === 'paid' ? 'paid' : 'open';
}

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface TableCardProps {
  table: UiTable;
  order: UiOpenOrder | null;
  isSelected: boolean;
  onClick: () => void;
  onRemove: (id: string) => void;
  onStatusToggle?: (id: string) => void;
  onReservedToggle?: (id: string) => void;
}

export function TableCard({
  table,
  order,
  isSelected,
  onClick,
  onRemove,
  onStatusToggle,
  onReservedToggle,
}: TableCardProps) {
  const colorState = getOrderColor(order);

  return (
    <div className="relative group">
      <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
        <button onClick={onClick} className="w-full text-left" aria-pressed={isSelected}>
          <Card
            className={cn(
              'transition-all duration-150 cursor-pointer',
              isSelected && 'ring-1 ring-foreground',
              colorState === 'open' && 'border-red-400/40',
              colorState === 'paid' && 'border-emerald-500/40',
            )}
          >
            <CardContent className="p-4 flex flex-col gap-2">
              {/* Dot + number */}
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold leading-tight">{table.name}</span>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    colorState === 'none' && 'bg-muted-foreground',
                    colorState === 'open' && 'bg-red-400',
                    colorState === 'paid' && 'bg-emerald-500',
                  )}
                />
              </div>
              {/* Capacity */}
              <span className="text-sm text-muted-foreground">{table.capacity} kişi</span>
              {/* Total */}
              <span
                className={cn(
                  'text-sm tabular-nums',
                  colorState === 'none' && 'text-muted-foreground',
                  colorState === 'open' && 'text-red-400',
                  colorState === 'paid' && 'text-emerald-500',
                )}
              >
                {order ? `${formatPrice(order.total)} ₺` : '—'}
              </span>
              {onStatusToggle && (table.status === 'available' || table.status === 'occupied') ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onStatusToggle(table.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onStatusToggle(table.id); } }}
                  className="w-fit"
                  aria-label="Durumu değiştir"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={table.status}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                        table.status === 'available'
                          ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                          : 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
                      )}
                    >
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        table.status === 'available' ? 'bg-emerald-500' : 'bg-red-400',
                      )} />
                      {table.status === 'available' ? 'Müsait' : 'Dolu'}
                    </motion.span>
                  </AnimatePresence>
                </div>
              ) : table.status === 'reserved' && onReservedToggle ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReservedToggle(table.id);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onReservedToggle(table.id); } }}
                  className="w-fit"
                  aria-label="Rezerveden çıkar"
                >
                  <StatusBadge status={table.status} />
                </div>
              ) : (
                <StatusBadge status={table.status} />
              )}
            </CardContent>
          </Card>
        </button>
      </motion.div>

      {/* Remove button — hover-only, only when no active order */}
      {!table.currentOrderId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(table.id);
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
            transition-opacity duration-150
            h-6 w-6 rounded-md flex items-center justify-center
            bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
          aria-label="Masayı sil"
        >
          <X strokeWidth={2} size={13} />
        </button>
      )}
    </div>
  );
}
