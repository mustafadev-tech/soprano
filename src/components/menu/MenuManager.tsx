'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MenuItem, Category } from '@/components/_types';
import type { UiCategoryOption } from '@/types/api';

const CATEGORY_FALLBACK: Record<string, string> = {
  food: 'Yiyecek',
  drink: 'İçecek',
  dessert: 'Tatlı',
  other: 'Diğer',
};

const categoryOptions: { value: Category; label: string }[] = [
  { value: 'food', label: 'Yiyecek' },
  { value: 'drink', label: 'İçecek' },
  { value: 'dessert', label: 'Tatlı' },
  { value: 'other', label: 'Diğer' },
];

const categoryTabs: { value: 'all' | Category; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  ...categoryOptions,
];

interface MenuManagerProps {
  menuItems: MenuItem[];
  categories?: UiCategoryOption[];
  onAdd: (item: Omit<MenuItem, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<MenuItem>) => void;
  onDelete: (id: string) => void;
  onAddCategory?: (name: string) => void;
  onUpdateCategory?: (id: string, name: string) => void;
  onDeleteCategory?: (id: string) => void;
}

interface ItemFormState {
  name: string;
  description: string;
  price: string;
  category: Category;
  available: boolean;
}

const emptyItemForm: ItemFormState = {
  name: '',
  description: '',
  price: '',
  category: 'food',
  available: true,
};

export function MenuManager({
  menuItems,
  categories = [],
  onAdd,
  onUpdate,
  onDelete,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}: MenuManagerProps) {
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const [activeCategory, setActiveCategory] = useState<'all' | Category>('all');

  // Product dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm);
  const [itemFormError, setItemFormError] = useState<string | null>(null);

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<UiCategoryOption | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catFormError, setCatFormError] = useState<string | null>(null);

  const filtered =
    activeCategory === 'all'
      ? menuItems
      : menuItems.filter((item) => item.category === activeCategory);

  function getCategoryName(cat: string): string {
    return categories.find((c) => c.kind === cat)?.name ?? CATEGORY_FALLBACK[cat] ?? cat;
  }

  // — Product handlers —
  function openAddItemDialog() {
    setItemForm(emptyItemForm);
    setItemFormError(null);
    setAddDialogOpen(true);
  }

  function openEditItemDialog(item: MenuItem) {
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price.toString(),
      category: item.category,
      available: item.available,
    });
    setItemFormError(null);
    setEditingItem(item);
  }

  function handleSaveItem() {
    if (!itemForm.name.trim()) { setItemFormError('İsim zorunludur.'); return; }
    const price = parseFloat(itemForm.price);
    if (isNaN(price) || price <= 0) { setItemFormError('Geçerli bir fiyat giriniz.'); return; }

    const payload: Omit<MenuItem, 'id'> = {
      name: itemForm.name.trim(),
      description: itemForm.description.trim() || null,
      price,
      category: itemForm.category,
      available: itemForm.available,
      imageUrl: null,
    };

    if (editingItem) {
      onUpdate(editingItem.id, payload);
      setEditingItem(null);
    } else {
      onAdd(payload);
      setAddDialogOpen(false);
    }
  }

  function handleDeleteItem() {
    if (deleteConfirmId) { onDelete(deleteConfirmId); setDeleteConfirmId(null); }
  }

  // — Category handlers —
  function openAddCatDialog() {
    setCatName('');
    setCatFormError(null);
    setEditingCat(null);
    setCatDialogOpen(true);
  }

  function openEditCatDialog(cat: UiCategoryOption) {
    setCatName(cat.name);
    setCatFormError(null);
    setEditingCat(cat);
    setCatDialogOpen(true);
  }

  function handleSaveCat() {
    if (!catName.trim()) { setCatFormError('İsim zorunludur.'); return; }
    if (editingCat) {
      onUpdateCategory?.(editingCat.id, catName.trim());
    } else {
      onAddCategory?.(catName.trim());
    }
    setCatDialogOpen(false);
    setEditingCat(null);
    setCatName('');
  }

  function handleDeleteCat() {
    if (deleteCatId) { onDeleteCategory?.(deleteCatId); setDeleteCatId(null); }
  }

  const isItemDialogOpen = addDialogOpen || editingItem !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Top-level tab switcher */}
      <div className="flex items-center gap-1 border-b border-border pb-3">
        {(['products', 'categories'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab === 'products' ? 'Ürünler' : 'Kategoriler'}
          </button>
        ))}
      </div>

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={activeCategory}
              onValueChange={(v) => setActiveCategory(v as 'all' | Category)}
            >
              <TabsList className="overflow-x-auto no-scrollbar">
                {categoryTabs.map(({ value, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="data-[active]:bg-white data-[active]:!text-black data-[active]:font-semibold"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              className="rounded-xl bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
              onClick={openAddItemDialog}
            >
              <Plus strokeWidth={1.5} size={16} className="mr-2" />
              Yeni Ürün Ekle
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Fiyat</TableHead>
                  <TableHead className="text-center">Müsait</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <AnimatePresence mode="wait">
                <motion.tbody
                  key={activeCategory}
                  data-slot="table-body"
                  className="[&_tr:last-child]:border-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Ürün bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {getCategoryName(item.category)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => onUpdate(item.id, { available: !item.available })}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                              item.available
                                ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                                : 'bg-muted text-muted-foreground hover:bg-muted/70'
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', item.available ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                            {item.available ? 'Müsait' : 'Müsait Değil'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditItemDialog(item)}>
                              <Pencil strokeWidth={1.5} size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setDeleteConfirmId(item.id)}>
                              <Trash2 strokeWidth={1.5} size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </motion.tbody>
              </AnimatePresence>
            </Table>
          </div>
        </>
      )}

      {/* CATEGORIES TAB */}
      {activeTab === 'categories' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{categories.length} kategori</span>
            <Button
              size="sm"
              className="rounded-xl bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
              onClick={openAddCatDialog}
            >
              <Plus strokeWidth={1.5} size={16} className="mr-2" />
              Yeni Kategori Ekle
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>Sıralama</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      Kategori bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  categories
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-muted-foreground">{cat.sortOrder}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCatDialog(cat)}>
                              <Pencil strokeWidth={1.5} size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setDeleteCatId(cat.id)}>
                              <Trash2 strokeWidth={1.5} size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add / Edit Item Dialog */}
      <Dialog open={isItemDialogOpen} onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); setEditingItem(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Ürün Düzenle' : 'Yeni Ürün'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iname">İsim</Label>
              <Input id="iname" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ürün adı" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="idesc">Açıklama</Label>
              <Input id="idesc" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} placeholder="İsteğe bağlı" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iprice">Fiyat (₺)</Label>
              <Input id="iprice" type="number" min="0" step="0.5" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="icat">Kategori</Label>
              <Select value={itemForm.category} onValueChange={(v) => setItemForm((f) => ({ ...f, category: v as Category }))}>
                <SelectTrigger id="icat">
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {categories.length > 0
                    ? categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.kind}>
                          {cat.name}
                        </SelectItem>
                      ))
                    : categoryOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="iavailable"
                checked={itemForm.available}
                onCheckedChange={(checked) => setItemForm((f) => ({ ...f, available: !!checked }))}
              />
              <Label htmlFor="iavailable" className="cursor-pointer">Müsait</Label>
            </div>
            {itemFormError && <p className="text-sm text-destructive">{itemFormError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setEditingItem(null); }}>İptal</Button>
            <Button onClick={handleSaveItem}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Ürünü Sil</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Bu ürünü silmek istediğinizden emin misiniz?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>İptal</Button>
            <Button variant="destructive" onClick={handleDeleteItem}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={(open) => { if (!open) { setCatDialogOpen(false); setEditingCat(null); } }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Kategori Düzenle' : 'Yeni Kategori'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cname">Kategori Adı</Label>
              <Input id="cname" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="ör. Sıcak İçecekler" />
            </div>
            {catFormError && <p className="text-sm text-destructive">{catFormError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCatDialogOpen(false); setEditingCat(null); }}>İptal</Button>
            <Button onClick={handleSaveCat}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <Dialog open={deleteCatId !== null} onOpenChange={(open) => { if (!open) setDeleteCatId(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Kategoriyi Sil</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Bu kategoriyi silmek istediğinizden emin misiniz? İçindeki ürünler etkilenebilir.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCatId(null)}>İptal</Button>
            <Button variant="destructive" onClick={handleDeleteCat}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
