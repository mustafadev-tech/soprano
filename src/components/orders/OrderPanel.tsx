'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderItemRow } from '@/components/orders/OrderItemRow';
import { MenuSelector } from '@/components/orders/MenuSelector';
import { cn } from '@/lib/utils';
import type { UiOrder, UiMenuItem } from '@/types/api';

function getOrderColor(order: UiOrder | null): 'none' | 'open' | 'paid' {
  if (!order) return 'none';
  return order.status === 'paid' ? 'paid' : 'open';
}

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface OrderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: UiOrder | null;
  tableName: string | null;
  menuItems: UiMenuItem[];
  onAddItem: (item: UiMenuItem) => void;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onCloseOrder?: (method: 'cash' | 'card') => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function OrderPanel({
  open,
  onOpenChange,
  order,
  tableName,
  menuItems,
  onAddItem,
  onIncrement,
  onDecrement,
  onRemove,
  onCloseOrder,
  onSuccess,
  onError,
}: OrderPanelProps) {
  const [pendingMethod, setPendingMethod] = useState<'cash' | 'card' | null>(null);
  const [mobileTab, setMobileTab] = useState<'order' | 'menu'>('order');

  const colorState = getOrderColor(order);
  const isPending = pendingMethod !== null;
  const isClosedOrEmpty = !order || order.items.length === 0 || order.status === 'paid';
  const itemCount = order?.items.length ?? 0;

  const motionTotal = useMotionValue(order?.total ?? 0);
  const smoothTotal = useSpring(motionTotal, { stiffness: 300, damping: 30 });
  const formattedSpringTotal = useTransform(smoothTotal, (v) => formatPrice(Math.max(0, v)));

  useEffect(() => {
    motionTotal.set(order?.total ?? 0);
  }, [order?.total, motionTotal]);

  async function handleClose(method: 'cash' | 'card') {
    setPendingMethod(method);
    try {
      await (onCloseOrder?.(method) as unknown as Promise<void> | undefined);
      onSuccess?.(
        method === 'cash' ? 'Hesap nakit kapatıldı' : 'Hesap kredi kartıyla kapatıldı'
      );
    } catch {
      onError?.('Hesap kapatılamadı');
    } finally {
      setPendingMethod(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ width: '90vw', maxWidth: '90vw', height: '85vh', maxHeight: '85vh' }}
        className="flex flex-col gap-0 overflow-hidden border border-border bg-background p-0 text-foreground shadow-2xl outline-none"
      >
        {/* HEADER */}
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-muted/30 px-5 py-4">
          <div className="flex-1 min-w-0">
            <DialogTitle className="m-0 text-base font-semibold leading-tight text-foreground">
              {tableName ? tableName : 'Sipariş'}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{itemCount} ürün</p>
          </div>

          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
              colorState === 'paid'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                colorState === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'
              )}
            />
            {colorState === 'paid' ? 'Ödendi' : 'Açık'}
          </div>

          <DialogClose
            render={
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Kapat"
              />
            }
          >
            <X strokeWidth={1.5} size={16} />
          </DialogClose>
        </div>

        {/* MOBILE TAB BAR */}
        <div className="flex shrink-0 border-b border-border sm:hidden">
          <button
            onClick={() => setMobileTab('order')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
              mobileTab === 'order'
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground'
            )}
          >
            <ShoppingCart strokeWidth={1.5} size={14} />
            Sipariş
            {itemCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                {itemCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileTab('menu')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
              mobileTab === 'menu'
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground'
            )}
          >
            <UtensilsCrossed strokeWidth={1.5} size={14} />
            Menü
          </button>
        </div>

        {/* BODY: two-column on desktop, tab-switched on mobile */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* LEFT: order items */}
          <div
            className={cn(
              'flex flex-1 flex-col overflow-hidden bg-background',
              'hidden sm:flex',
              mobileTab === 'order' && '!flex'
            )}
          >
            <div className="hidden shrink-0 px-4 pb-3 pt-4 sm:block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sipariş
              </span>
            </div>
            <div className="mx-4 hidden h-px shrink-0 bg-border sm:block" />
            <ScrollArea className="flex-1 px-1 py-1">
              <div className="flex flex-col">
                <AnimatePresence initial={false}>
                  {(order?.items ?? []).length > 0 ? (
                    order!.items.map((item, index) => (
                      <OrderItemRow
                        key={`${item.menuItemId}::${(item.note ?? '').trim()}`}
                        item={item}
                        delay={index * 0.04}
                        onIncrement={onIncrement}
                        onDecrement={onDecrement}
                        onRemove={onRemove}
                      />
                    ))
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex h-32 items-center justify-center"
                    >
                      <p className="text-sm text-muted-foreground">Henüz sipariş eklenmedi</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>

          {/* Vertical divider — desktop only */}
          <div className="hidden w-px shrink-0 bg-border sm:block" />

          {/* RIGHT: embedded MenuSelector */}
          <div
            className={cn(
              'flex w-full flex-col overflow-hidden bg-background sm:w-72 sm:shrink-0',
              'hidden sm:flex',
              mobileTab === 'menu' && '!flex'
            )}
          >
            <div className="hidden shrink-0 px-4 pb-3 pt-4 sm:block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Menü
              </span>
            </div>
            <div className="mx-4 hidden h-px shrink-0 bg-border sm:block" />
            <div className="flex-1 overflow-hidden">
              <MenuSelector menuItems={menuItems} onAddItem={onAddItem} />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex flex-1 items-baseline gap-2">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Toplam
            </span>
            <div className="flex items-baseline gap-1">
              <motion.span className="text-2xl font-bold tabular-nums text-foreground">
                {formattedSpringTotal}
              </motion.span>
              <span className="text-sm text-muted-foreground">₺</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={isClosedOrEmpty || isPending}
              onClick={() => void handleClose('cash')}
              variant="outline"
              className="h-10 flex-1 rounded-xl px-3 sm:flex-none sm:px-5"
            >
              {pendingMethod === 'cash' ? (
                <Loader2 className="animate-spin" strokeWidth={1.5} size={14} />
              ) : null}
              Nakit Kapat
            </Button>
            <Button
              disabled={isClosedOrEmpty || isPending}
              onClick={() => void handleClose('card')}
              className="h-10 flex-1 rounded-xl bg-foreground px-3 text-background hover:bg-foreground/90 sm:flex-none sm:px-5"
            >
              {pendingMethod === 'card' ? (
                <Loader2 className="animate-spin" strokeWidth={1.5} size={14} />
              ) : null}
              Kredi Kartı Kapat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
