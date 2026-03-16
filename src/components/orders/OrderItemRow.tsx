'use client';

import { motion } from 'framer-motion';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { OrderItem } from '@/components/_types';

interface OrderItemRowProps {
  item: OrderItem;
  delay?: number;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
}

export function OrderItemRow({
  item,
  delay = 0,
  onIncrement,
  onDecrement,
  onRemove,
}: OrderItemRowProps) {
  const formattedPrice = (item.price * item.quantity).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <motion.div
      layout
      variants={{
        initial: { opacity: 0, y: 8 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.18, delay },
        },
        exit: { opacity: 0, x: 20, transition: { duration: 0.12 } },
      }}
      initial="initial"
      animate="animate"
      exit="exit"
      className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 transition-colors hover:bg-muted/50"
    >
      {/* Item name */}
      <span className="flex-1 text-sm font-medium text-foreground">{item.name}</span>

      {/* Quantity controls */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          onClick={() => onDecrement(item.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Minus strokeWidth={2} size={10} />
        </button>
        <span className="min-w-[2rem] rounded-md bg-background px-2 py-0.5 text-center text-sm font-medium tabular-nums text-foreground shadow-sm">
          {item.quantity}
        </span>
        <button
          onClick={() => onIncrement(item.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Plus strokeWidth={2} size={10} />
        </button>
      </div>

      {/* Price */}
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {formattedPrice} ₺
      </span>

      {/* Remove button (hover-only) */}
      <button
        onClick={() => onRemove(item.id)}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
        aria-label="Kaldır"
      >
        <Trash2 strokeWidth={1.5} size={13} />
      </button>
    </motion.div>
  );
}
