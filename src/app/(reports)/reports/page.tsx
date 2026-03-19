'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RequireRole } from '@/components/auth/RequireRole';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ChevronDown, Download, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useDailyReport } from '@/hooks/reports/useDailyReport';
import { useReportExport } from '@/hooks/reports/useReportExport';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

function formatPrice(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPaymentMethod(value: string | null): string {
  if (value === 'cash') return 'Nakit';
  if (value === 'credit_card') return 'Kredi Kartı';
  if (value === 'unknown') return 'Bilinmiyor';
  return value ?? '—';
}

export default function ReportsPage() {
  return (
    <RequireRole allowed={['soprano_admin']}>
      <AdminReportsPage />
    </RequireRole>
  );
}

function AdminReportsPage() {
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const lastErrorRef = useRef<string | null>(null);
  const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined;

  const { report, loading, error, lastUpdated, refetch } = useDailyReport(selectedDate);
  const { exportCSV, loading: exportLoading, error: exportError } = useReportExport();

  const summary = report?.summary ?? null;
  const items = report?.byItem ?? [];
  const categoryEntries = report?.byCategory ?? [];
  const paymentEntries = report?.paymentBreakdown ?? [];
  const hourlyEntries = report?.hourlyBreakdown ?? [];
  const recentDays = report?.recentDays ?? [];
  const tableEntries = report?.byTable ?? [];
  const deletedBills = report?.deletedBills ?? [];

  const sortedItems = [...items].sort((a, b) => b.total - a.total);
  const grandTotal = items.reduce((s, i) => s + i.total, 0);
  const hasData =
    items.length > 0 ||
    tableEntries.length > 0 ||
    categoryEntries.length > 0 ||
    paymentEntries.length > 0 ||
    hourlyEntries.length > 0 ||
    recentDays.length > 0;
  const pageError = exportError ?? error;

  useEffect(() => {
    if (pageError && pageError !== lastErrorRef.current) {
      toast.error(pageError);
      lastErrorRef.current = pageError;
      return;
    }

    if (!pageError) {
      lastErrorRef.current = null;
    }
  }, [pageError]);

  return (
      <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Z Raporu</h1>
          {report ? (
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span>API üretim: {formatDateTime(report.generatedAt)}</span>
              {report.snapshotUpdatedAt ? (
                <span>Snapshot güncelleme: {formatDateTime(report.snapshotUpdatedAt)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Son güncelleme: {formatTime(lastUpdated)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw
              strokeWidth={1.5}
              size={14}
              className={cn(loading && 'animate-spin')}
            />
            Yenile
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-[220px] justify-start gap-2 font-normal tabular-nums"
                />
              }
            >
              <CalendarIcon strokeWidth={1.5} size={14} />
              {selectedDateObj
                ? format(selectedDateObj, 'dd MMMM yyyy', { locale: tr })
                : 'Tarih seç'}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDateObj}
                locale={tr}
                onSelect={(date) => {
                  if (date) {
                    const iso = date.toISOString().slice(0, 10);
                    setSelectedDate(iso);
                    setCalendarOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportCSV(selectedDate)}
            disabled={exportLoading}
          >
            <Download strokeWidth={1.5} size={16} className="mr-2" />
            CSV İndir
          </Button>
        </div>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {(loading
          ? Array.from({ length: 5 }).map((_, index) => ({
              label: `loading-${index}`,
              value: null,
            }))
          : [
              {
                label: 'Toplam Ciro',
                value: summary ? formatPrice(summary.totalRevenue) + ' ₺' : '—',
              },
              { label: 'Toplam Sipariş', value: summary?.totalOrders.toString() ?? '—' },
              {
                label: 'Nakit',
                value: summary ? formatPrice(summary.cashRevenue) + ' ₺' : '—',
              },
              {
                label: 'Kredi Kartı',
                value: summary ? formatPrice(summary.cardRevenue) + ' ₺' : '—',
              },
              {
                label: 'Açık Sipariş',
                value: summary?.openOrdersCount.toString() ?? '—',
              },
            ]
        ).map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">{label}</span>
              {value === null ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <span className="text-2xl font-bold tabular-nums">{value}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state or data */}
      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-md border border-border p-4">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-56 w-full" />
          </div>
          <div className="rounded-md border border-border p-4">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      ) : !hasData ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Bu tarih için kayıt bulunamadı
        </p>
      ) : (
        <>
          <section className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                <h2 className="text-base font-medium">Kategori Dağılımı</h2>
                {categoryEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Kategori verisi yok</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {categoryEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p>{entry.name}</p>
                          <p className="text-xs text-muted-foreground">{entry.quantity} adet</p>
                        </div>
                        <span className="tabular-nums font-medium">{formatPrice(entry.total)} ₺</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                <h2 className="text-base font-medium">Ödeme Dağılımı</h2>
                {paymentEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ödeme kırılımı yok</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {paymentEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p>{formatPaymentMethod(entry.method)}</p>
                          <p className="text-xs text-muted-foreground">{entry.orderCount} sipariş</p>
                        </div>
                        <span className="tabular-nums font-medium">{formatPrice(entry.total)} ₺</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                <h2 className="text-base font-medium">Saatlik Dağılım</h2>
                {hourlyEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Saatlik veri yok</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {hourlyEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p>{entry.hour}</p>
                          <p className="text-xs text-muted-foreground">{entry.orderCount} sipariş</p>
                        </div>
                        <span className="tabular-nums font-medium">{formatPrice(entry.total)} ₺</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Satılan Ürünler table */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Satılan Ürünler</h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Birim Fiyat</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(item.unitPrice)} ₺
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(item.total)} ₺
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Toplam
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatPrice(grandTotal)} ₺
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Son 30 Gün Özeti</h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>İlk Sipariş</TableHead>
                    <TableHead>Son Sipariş</TableHead>
                    <TableHead className="text-right">Sipariş</TableHead>
                    <TableHead className="text-right">Açık</TableHead>
                    <TableHead className="text-right">Nakit</TableHead>
                    <TableHead className="text-right">Kart</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDays.map((day) => (
                    <TableRow key={day.id}>
                      <TableCell>{day.date}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(day.firstOrderAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(day.lastOrderAt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{day.totalOrders}</TableCell>
                      <TableCell className="text-right tabular-nums">{day.openOrdersCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(day.cashRevenue)} ₺
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(day.cardRevenue)} ₺
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatPrice(day.totalRevenue)} ₺
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Silinen Hesaplar */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Silinen Hesaplar</h2>
            {deletedBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu tarihte silinmiş hesap bulunmuyor.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Silinen hesaplar ciro hesabına dahil edilmez.
                </p>
                {deletedBills.map((bill) => (
                  <Collapsible key={bill.id}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm hover:bg-destructive/10 transition-colors duration-150">
                      <span className="font-medium text-destructive">{bill.tableName}</span>
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span className="text-xs">
                          {formatDateTime(bill.deletedAt)}
                        </span>
                        <span className="tabular-nums text-destructive font-medium">
                          {formatPrice(bill.totalAmount)} ₺
                        </span>
                        <ChevronDown
                          strokeWidth={1.5}
                          size={14}
                          className="transition-transform duration-150 data-open:rotate-180"
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border border-t-0 border-destructive/30 rounded-b-lg overflow-hidden">
                      <div className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {bill.items.map((item, index) => (
                            <div
                              key={`${bill.id}-${item.name}-${index}`}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>{item.name}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {item.quantity} x {formatPrice(item.unitPrice)} ₺
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 border-t border-destructive/20 pt-2 flex justify-between text-sm font-medium">
                          <span>Toplam</span>
                          <span className="tabular-nums text-destructive">
                            {formatPrice(bill.totalAmount)} ₺
                          </span>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
                <div className="flex justify-between px-4 py-2 text-sm font-semibold text-destructive">
                  <span>Silinen Hesaplar Toplamı</span>
                  <span className="tabular-nums">
                    {formatPrice(deletedBills.reduce((s, b) => s + b.totalAmount, 0))} ₺
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Masa Detayları collapsibles */}
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">Masa Detayları</h2>
            <div className="flex flex-col gap-2">
              {tableEntries.map((entry) => (
                <Collapsible key={entry.tableId}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-sm hover:bg-muted transition-colors duration-150">
                    <span className="font-medium">{entry.tableName}</span>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{entry.orderCount} sipariş</span>
                      <span className="tabular-nums">{formatPrice(entry.total)} ₺</span>
                      <ChevronDown
                        strokeWidth={1.5}
                        size={14}
                        className="transition-transform duration-150 data-open:rotate-180"
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border border-t-0 border-border rounded-b-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Açılış</TableHead>
                          <TableHead>Kapanış</TableHead>
                          <TableHead>Durum</TableHead>
                          <TableHead>Ödeme</TableHead>
                          <TableHead className="text-right">Tutar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entry.orders.map((o, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground">{o.openedAt}</TableCell>
                            <TableCell className="text-muted-foreground">{o.closedAt}</TableCell>
                            <TableCell>{o.status}</TableCell>
                            <TableCell>{formatPaymentMethod(o.paymentMethod)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatPrice(o.amount)} ₺
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="border-t border-border px-4 py-3">
                      <div className="flex flex-col gap-3">
                        {entry.orders.map((order) => (
                          <div key={order.orderId} className="rounded-xl border border-border p-3">
                            <p className="text-xs font-medium tracking-widest text-muted-foreground mb-2">
                              Sipariş Kalemleri
                            </p>
                            <div className="flex flex-col gap-2">
                              {order.items.map((item, itemIndex) => (
                                <div
                                  key={`${order.orderId}-${item.itemName}-${itemIndex}`}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <div>
                                    <span>{item.itemName}</span>
                                    <span className="ml-2 text-muted-foreground">
                                      {item.categoryName}
                                    </span>
                                  </div>
                                  <span className="tabular-nums">
                                    {item.quantity} x {formatPrice(item.unitPrice)} ₺
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </section>
        </>
      )}
      </div>
  );
}
