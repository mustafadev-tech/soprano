'use client';

import { useEffect, useMemo, useState } from 'react';
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
import type { UiCategoryOption, UiMenuItem } from '@/types/api';

type MenuItemDraft = Pick<UiMenuItem, 'name' | 'description' | 'price' | 'available' | 'categoryId'>;

interface MenuManagerProps {
  menuItems: UiMenuItem[];
  categories?: UiCategoryOption[];
  canManage?: boolean;
  onAdd: (item: MenuItemDraft) => void;
  onUpdate: (id: string, updates: Partial<MenuItemDraft>) => void;
  onDelete: (id: string) => void;
  onAddCategory?: (name: string) => void;
  onUpdateCategory?: (id: string, name: string) => void;
  onDeleteCategory?: (id: string) => void;
}

interface ItemFormState {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  available: boolean;
}

function createEmptyItemForm(defaultCategoryId = ''): ItemFormState {
  return {
    name: '',
    description: '',
    price: '',
    categoryId: defaultCategoryId,
    available: true,
  };
}

export function MenuManager({
  menuItems,
  categories = [],
  canManage = true,
  onAdd,
  onUpdate,
  onDelete,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}: MenuManagerProps) {
  const sortedCategories = useMemo(
    () => categories.slice().sort((left, right) => left.sortOrder - right.sortOrder),
    [categories],
  );
  const categoryTabs = useMemo(
    () => [
      { value: 'all', label: 'Tümü' },
      ...sortedCategories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [sortedCategories],
  );

  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  const [activeCategoryId, setActiveCategoryId] = useState<'all' | string>('all');

  // Product dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UiMenuItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(() => createEmptyItemForm());
  const [itemFormError, setItemFormError] = useState<string | null>(null);

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<UiCategoryOption | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catFormError, setCatFormError] = useState<string | null>(null);

  const filtered =
    activeCategoryId === 'all'
      ? menuItems
      : menuItems.filter((item) => item.categoryId === activeCategoryId);

  useEffect(() => {
    if (
      activeCategoryId !== 'all' &&
      sortedCategories.every((category) => category.id !== activeCategoryId)
    ) {
      setActiveCategoryId('all');
    }
  }, [activeCategoryId, sortedCategories]);

  useEffect(() => {
    if (!sortedCategories.length) {
      return;
    }

    setItemForm((currentForm) => {
      if (currentForm.categoryId && sortedCategories.some((category) => category.id === currentForm.categoryId)) {
        return currentForm;
      }

      return {
        ...currentForm,
        categoryId: sortedCategories[0]?.id ?? '',
      };
    });
  }, [sortedCategories]);

  // — Product handlers —
  function openAddItemDialog() {
    setItemForm(createEmptyItemForm(sortedCategories[0]?.id ?? ''));
    setItemFormError(null);
    setAddDialogOpen(true);
  }

  function openEditItemDialog(item: UiMenuItem) {
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price.toString(),
      categoryId: item.categoryId,
      available: item.available,
    });
    setItemFormError(null);
    setEditingItem(item);
  }

  function handleSaveItem() {
    if (!itemForm.name.trim()) {
      setItemFormError('İsim zorunludur.');
      return;
    }

    if (!itemForm.categoryId) {
      setItemFormError('Kategori seçiniz.');
      return;
    }

    const price = parseFloat(itemForm.price);

    if (isNaN(price) || price <= 0) {
      setItemFormError('Geçerli bir fiyat giriniz.');
      return;
    }

    const payload: MenuItemDraft = {
      name: itemForm.name.trim(),
      description: itemForm.description.trim() || null,
      price,
      categoryId: itemForm.categoryId,
      available: itemForm.available,
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
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    }
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
    if (!catName.trim()) {
      setCatFormError('İsim zorunludur.');
      return;
    }

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
    if (deleteCatId) {
      onDeleteCategory?.(deleteCatId);
      setDeleteCatId(null);
    }
  }

  const isItemDialogOpen = addDialogOpen || editingItem !== null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 overflow-hidden">
      {/* Top-level tab switcher */}
      <div className="overflow-x-auto border-b border-border pb-3 no-scrollbar">
        <div className="flex min-w-max items-center gap-1">
          {(['products', 'categories'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              {tab === 'products' ? 'Ürünler' : 'Kategoriler'}
            </button>
          ))}
        </div>
      </div>

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 overflow-x-auto no-scrollbar">
              <Tabs
                value={activeCategoryId}
                onValueChange={setActiveCategoryId}
                className="min-w-max"
              >
                <TabsList className="w-max min-w-max">
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
            </div>
            {canManage ? (
              <Button
                size="sm"
                className="w-full shrink-0 rounded-xl bg-black text-white hover:bg-black/90 sm:w-auto dark:bg-white dark:text-black dark:hover:bg-white/90"
                onClick={openAddItemDialog}
                disabled={!sortedCategories.length}
              >
                <Plus strokeWidth={1.5} size={16} className="mr-2" />
                Yeni Ürün Ekle
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Ürün bulunamadı
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.categoryName}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {item.price.toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ₺
                    </p>
                  </div>

                  {item.description ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                        item.available
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          item.available ? 'bg-emerald-500' : 'bg-muted-foreground'
                        )}
                      />
                      {item.available ? 'Müsait' : 'Müsait Değil'}
                    </span>

                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditItemDialog(item)}
                        >
                          <Pencil strokeWidth={1.5} size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setDeleteConfirmId(item.id)}
                        >
                          <Trash2 strokeWidth={1.5} size={14} />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Fiyat</TableHead>
                  <TableHead className="text-center">Müsait</TableHead>
                  {canManage ? <TableHead className="text-right">İşlemler</TableHead> : null}
                </TableRow>
              </TableHeader>
              <AnimatePresence mode="wait">
                <motion.tbody
                  key={activeCategoryId}
                  data-slot="table-body"
                  className="[&_tr:last-child]:border-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 5 : 4} className="h-24 text-center text-muted-foreground">
                        Ürün bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.categoryName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                              item.available
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', item.available ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                            {item.available ? 'Müsait' : 'Müsait Değil'}
                          </span>
                        </TableCell>
                        {canManage ? (
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
                        ) : null}
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
            {canManage ? (
              <Button
                size="sm"
                className="rounded-xl bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                onClick={openAddCatDialog}
              >
                <Plus strokeWidth={1.5} size={16} className="mr-2" />
                Yeni Kategori Ekle
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 md:hidden">
            {categories.length === 0 ? (
              <div className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Kategori bulunamadı
              </div>
            ) : (
              sortedCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{cat.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sıralama: {cat.sortOrder}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditCatDialog(cat)}
                      >
                        <Pencil strokeWidth={1.5} size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setDeleteCatId(cat.id)}
                      >
                        <Trash2 strokeWidth={1.5} size={14} />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-md border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>Sıralama</TableHead>
                  {canManage ? <TableHead className="text-right">İşlemler</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 3 : 2} className="h-24 text-center text-muted-foreground">
                      Kategori bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedCategories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-muted-foreground">{cat.sortOrder}</TableCell>
                      {canManage ? (
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
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add / Edit Item Dialog */}
      <Dialog open={canManage && isItemDialogOpen} onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); setEditingItem(null); } }}>
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
              <Select
                value={itemForm.categoryId}
                onValueChange={(value) =>
                  setItemForm((form) => ({ ...form, categoryId: value ?? '' }))
                }
              >
                <SelectTrigger id="icat">
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {sortedCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
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
      <Dialog open={canManage && deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
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
      <Dialog open={canManage && catDialogOpen} onOpenChange={(open) => { if (!open) { setCatDialogOpen(false); setEditingCat(null); } }}>
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
      <Dialog open={canManage && deleteCatId !== null} onOpenChange={(open) => { if (!open) setDeleteCatId(null); }}>
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
