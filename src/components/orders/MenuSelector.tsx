'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { UiMenuItem, UiCategory } from '@/types/api';

const categoryTabs: { value: 'all' | UiCategory; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'food', label: 'Yiyecek' },
  { value: 'drink', label: 'İçecek' },
  { value: 'dessert', label: 'Tatlı' },
  { value: 'other', label: 'Diğer' },
];

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface MenuSelectorProps {
  menuItems: UiMenuItem[];
  onAddItem: (item: UiMenuItem) => void;
}

export function MenuSelector({ menuItems, onAddItem }: MenuSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<'all' | UiCategory>('all');
  const [addedId, setAddedId] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredItems =
    activeCategory === 'all'
      ? menuItems
      : menuItems.filter((item) => item.category === activeCategory);
  const shortcutItems = filteredItems.filter((item) => item.available).slice(0, 9);
  const shortcutIndexByItemId = new Map(
    shortcutItems.map((item, index) => [item.id, index + 1]),
  );

  // Always-current refs to avoid stale closures in the keyboard handler
  const onAddItemRef = useRef(onAddItem);
  const filteredItemsRef = useRef(filteredItems);
  useLayoutEffect(() => { onAddItemRef.current = onAddItem; });
  useLayoutEffect(() => { filteredItemsRef.current = filteredItems; });

  function handleAddItem(item: UiMenuItem) {
    onAddItem(item);
    setAddedId(item.id);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setAddedId(null), 600);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const n = parseInt(e.key, 10);
      if (isNaN(n) || n < 1 || n > 9) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      e.preventDefault();
      e.stopPropagation();

      const available = filteredItemsRef.current.filter((i) => i.available).slice(0, 9);
      const target = available[n - 1];
      if (!target) return;

      onAddItemRef.current(target);
      setAddedId(target.id);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setAddedId(null), 600);
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []); // Empty deps — always reads latest values via refs

  useEffect(() => {
    return () => {
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-3 shrink-0 bg-background">
        {categoryTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveCategory(tab.value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              activeCategory === tab.value
                ? 'border-border bg-foreground text-background shadow-sm'
                : 'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {filteredItems.map((item, i) => (
              <React.Fragment key={item.id}>
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 transition-colors duration-100',
                    item.available
                      ? 'cursor-default hover:bg-muted/70'
                      : 'opacity-30 pointer-events-none'
                  )}
                >
                  {shortcutIndexByItemId.has(item.id) ? (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {shortcutIndexByItemId.get(item.id)}
                    </span>
                  ) : null}
                  <span className="flex-1 truncate text-sm text-foreground">{item.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatPrice(item.price)} ₺
                  </span>

                  {item.available && (
                    <motion.button
                      whileTap={{ scale: 0.75 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      onClick={() => handleAddItem(item)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {addedId === item.id ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.1 }}
                          >
                            <Check strokeWidth={2.5} size={11} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="plus"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.1 }}
                          >
                            <Plus strokeWidth={2} size={12} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  )}
                </div>
                {i < filteredItems.length - 1 && (
                  <div className="mx-3 h-px bg-border" />
                )}
              </React.Fragment>
            ))}
            {filteredItems.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Ürün bulunamadı</p>
            )}
          </motion.div>
        </AnimatePresence>
      </ScrollArea>

      <p className="border-t border-border bg-muted/20 px-3 py-2 text-[10px] tracking-wide text-muted-foreground/80">
        Yalnızca rozetli 1–9 kısayolları aktif
      </p>
    </div>
  );
}
