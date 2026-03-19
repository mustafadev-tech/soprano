import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CategoryReport,
  DailyReportHistoryDay,
  DailyReportSummary,
  DeletedBill,
  ItemReport,
  OrderReport,
  OrderReportItem,
  PaymentBreakdown,
  PaymentMethod,
  TableReport,
  HourlyReport,
} from '@/types/contract';

import { badRequest, serverError } from '@/app/api/_server/http';

const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
const ISTANBUL_OFFSET = '+03:00';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_WINDOW_DAYS = 30;

type NumericValue = number | string;
type DatabaseClient = SupabaseClient;

interface DailySummaryRow {
  order_id: string;
  table_name: string;
  opened_at: string;
  closed_at: string | null;
  payment_method: Exclude<PaymentMethod, null> | null;
  total_amount: NumericValue;
  status: string;
  item_count: number | string;
}

interface OrderItemDetailsViewRow {
  id: string;
  order_id: string;
  quantity: number;
  unit_price: NumericValue;
  note: string | null;
  created_at: string;
  item_name: string;
  category_id: string;
  category_name: string;
}

interface ReportWindow {
  date: string;
  start_iso: string;
  next_start_iso: string;
}

interface SnapshotRow {
  report_date: string;
  payload: DailyReportSummary;
  total_revenue: NumericValue;
  total_orders: number;
  cash_total: NumericValue;
  card_total: NumericValue;
  open_orders_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  updated_at: string;
}

function toNumber(value: NumericValue): number {
  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw serverError('Database returned an invalid numeric value.');
  }

  return Number(parsedValue.toFixed(2));
}

function getDateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ISTANBUL_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function getIstanbulDateString(dateString?: string): string {
  const parts = getDateParts(dateString ? new Date(dateString) : new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTodayInIstanbul(): string {
  return getIstanbulDateString();
}

function addDays(dateString: string, days: number): string {
  const baseDate = new Date(`${dateString}T00:00:00${ISTANBUL_OFFSET}`);
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return getIstanbulDateString(baseDate.toISOString());
}

function buildReportWindow(date: string): ReportWindow {
  const startDate = new Date(`${date}T00:00:00${ISTANBUL_OFFSET}`);
  const nextStartDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

  return {
    date,
    start_iso: startDate.toISOString(),
    next_start_iso: nextStartDate.toISOString(),
  };
}

export function resolveReportWindow(dateParam: string | null): ReportWindow {
  if (!dateParam) {
    return buildReportWindow(getTodayInIstanbul());
  }

  if (!DATE_PATTERN.test(dateParam)) {
    throw badRequest('date must be in YYYY-MM-DD format.');
  }

  const [year, month, day] = dateParam.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw badRequest('date must be a valid calendar date.');
  }

  return buildReportWindow(dateParam);
}

function formatIstanbulTime(dateString: string | null): string {
  if (!dateString) {
    return '';
  }

  const parts = getDateParts(new Date(dateString));
  return `${parts.hour}:${parts.minute}`;
}

function escapeCsvValue(value: string | number | null): string {
  const stringValue = value === null ? '' : String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

async function readManyRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  message: string,
): Promise<T[]> {
  const { data, error } = await query;

  if (error) {
    throw serverError(message);
  }

  return data ?? [];
}

async function readMaybeRow<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  message: string,
): Promise<T | null> {
  const { data, error } = await query;

  if (error) {
    throw serverError(message);
  }

  return data ?? null;
}

async function listClosedOrderSummaries(
  supabase: DatabaseClient,
  window: ReportWindow,
): Promise<DailySummaryRow[]> {
  return readManyRows<DailySummaryRow>(
    supabase
      .from('daily_summary')
      .select('order_id, table_name, opened_at, closed_at, payment_method, total_amount, status, item_count')
      .gte('closed_at', window.start_iso)
      .lt('closed_at', window.next_start_iso)
      .order('closed_at', { ascending: true }),
    'Failed to load daily summary.',
  );
}

async function listOrderItemDetails(
  supabase: DatabaseClient,
  orderIds: string[],
): Promise<OrderItemDetailsViewRow[]> {
  if (!orderIds.length) {
    return [];
  }

  return readManyRows<OrderItemDetailsViewRow>(
    supabase
      .from('order_item_details')
      .select('id, order_id, quantity, unit_price, note, created_at, item_name, category_id, category_name')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true }),
    'Failed to load report item details.',
  );
}

interface DeletedOrderRow {
  id: string;
  original_order_id: string;
  table_name: string;
  total_amount: NumericValue;
  deleted_at: string;
  deleted_by: string | null;
  deleted_order_items: Array<{
    menu_item_name: string;
    quantity: number;
    unit_price: NumericValue;
  }>;
  // Supabase returns joined one-to-one rows as an array in the inferred type
  staff_accounts: Array<{ full_name: string | null }> | { full_name: string | null } | null;
}

async function fetchDeletedOrdersForDate(
  supabase: DatabaseClient,
  window: ReportWindow,
): Promise<DeletedBill[]> {
  const { data, error } = await supabase
    .from('deleted_orders')
    .select(
      'id, original_order_id, table_name, total_amount, deleted_at, deleted_by, deleted_order_items(menu_item_name, quantity, unit_price), staff_accounts(full_name)',
    )
    .gte('deleted_at', window.start_iso)
    .lt('deleted_at', window.next_start_iso)
    .order('deleted_at', { ascending: true });

  if (error) {
    // Non-fatal: return empty list so the rest of the report still works
    console.error('Failed to load deleted orders for report.', error);
    return [];
  }

  return (data ?? []).map((row: DeletedOrderRow) => ({
    id: row.id,
    original_order_id: row.original_order_id,
    table_name: row.table_name,
    total_amount: toNumber(row.total_amount),
    deleted_by_name: Array.isArray(row.staff_accounts)
      ? (row.staff_accounts[0]?.full_name ?? null)
      : (row.staff_accounts?.full_name ?? null),
    deleted_at: row.deleted_at,
    items: (row.deleted_order_items ?? []).map((item) => ({
      menu_item_name: item.menu_item_name,
      quantity: item.quantity,
      unit_price: toNumber(item.unit_price),
    })),
  }));
}

async function countOpenOrdersAtEndOfDay(
  supabase: DatabaseClient,
  window: ReportWindow,
): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .lt('opened_at', window.next_start_iso)
    .or(`closed_at.is.null,closed_at.gte.${window.next_start_iso}`);

  if (error) {
    throw serverError('Failed to load open orders for report.');
  }

  return count ?? 0;
}

async function getSnapshotForDate(
  supabase: DatabaseClient,
  date: string,
): Promise<SnapshotRow | null> {
  return readMaybeRow<SnapshotRow>(
    supabase
      .from('z_report_snapshots')
      .select(
        'report_date, payload, total_revenue, total_orders, cash_total, card_total, open_orders_count, first_order_at, last_order_at, updated_at',
      )
      .eq('report_date', date)
      .maybeSingle(),
    'Failed to load report snapshot.',
  );
}

async function listSnapshotRowsInWindow(
  supabase: DatabaseClient,
  endDate: string,
): Promise<SnapshotRow[]> {
  const startDate = addDays(endDate, -(HISTORY_WINDOW_DAYS - 1));

  return readManyRows<SnapshotRow>(
    supabase
      .from('z_report_snapshots')
      .select(
        'report_date, payload, total_revenue, total_orders, cash_total, card_total, open_orders_count, first_order_at, last_order_at, updated_at',
      )
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true }),
    'Failed to load report history.',
  );
}

function buildHistoryDays(endDate: string, snapshotRows: SnapshotRow[]): DailyReportHistoryDay[] {
  const rowsByDate = new Map(snapshotRows.map((row) => [row.report_date, row]));
  const history: DailyReportHistoryDay[] = [];

  for (let offset = HISTORY_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    const snapshotRow = rowsByDate.get(date);

    history.push({
      date,
      total_revenue: snapshotRow ? toNumber(snapshotRow.total_revenue) : 0,
      total_orders: snapshotRow?.total_orders ?? 0,
      cash_total: snapshotRow ? toNumber(snapshotRow.cash_total) : 0,
      card_total: snapshotRow ? toNumber(snapshotRow.card_total) : 0,
      open_orders_count: snapshotRow?.open_orders_count ?? 0,
      first_order_at: snapshotRow?.first_order_at ?? null,
      last_order_at: snapshotRow?.last_order_at ?? null,
      snapshot_updated_at: snapshotRow?.updated_at ?? null,
    });
  }

  return history;
}

function buildEmptyReport(
  date: string,
  recentDays: DailyReportHistoryDay[],
  source: 'live' | 'snapshot',
  snapshotUpdatedAt: string | null,
  deletedBills: DeletedBill[] = [],
): DailyReportSummary {
  return {
    date,
    generated_at: new Date().toISOString(),
    snapshot_updated_at: snapshotUpdatedAt,
    source,
    summary: {
      total_revenue: 0,
      total_orders: 0,
      cash_total: 0,
      card_total: 0,
      open_orders_count: 0,
    },
    by_table: [],
    by_item: [],
    by_category: [],
    payment_breakdown: [],
    hourly_breakdown: [],
    recent_days: recentDays,
    deleted_bills: deletedBills,
  };
}

function buildPaymentBreakdown(rows: DailySummaryRow[]): PaymentBreakdown[] {
  const breakdownByMethod = new Map<string, PaymentBreakdown>();

  for (const row of rows) {
    const paymentMethod = row.payment_method ?? 'unknown';
    const current = breakdownByMethod.get(paymentMethod) ?? {
      payment_method: paymentMethod,
      order_count: 0,
      total_revenue: 0,
    };

    current.order_count += 1;
    current.total_revenue = Number((current.total_revenue + toNumber(row.total_amount)).toFixed(2));
    breakdownByMethod.set(paymentMethod, current);
  }

  return Array.from(breakdownByMethod.values()).sort((left, right) => right.total_revenue - left.total_revenue);
}

function buildCategoryBreakdown(rows: OrderItemDetailsViewRow[]): CategoryReport[] {
  const categoryReportsByName = new Map<string, CategoryReport>();

  for (const row of rows) {
    const revenue = row.quantity * toNumber(row.unit_price);
    const current = categoryReportsByName.get(row.category_name) ?? {
      category_name: row.category_name,
      total_quantity: 0,
      total_revenue: 0,
    };

    current.total_quantity += row.quantity;
    current.total_revenue = Number((current.total_revenue + revenue).toFixed(2));
    categoryReportsByName.set(row.category_name, current);
  }

  return Array.from(categoryReportsByName.values()).sort((left, right) => right.total_revenue - left.total_revenue);
}

function buildHourlyBreakdown(rows: DailySummaryRow[]): HourlyReport[] {
  const hourlyByKey = new Map<string, HourlyReport>();

  for (const row of rows) {
    const hour = `${formatIstanbulTime(row.closed_at ?? row.opened_at).slice(0, 2)}:00`;
    const current = hourlyByKey.get(hour) ?? {
      hour,
      order_count: 0,
      total_revenue: 0,
    };

    current.order_count += 1;
    current.total_revenue = Number((current.total_revenue + toNumber(row.total_amount)).toFixed(2));
    hourlyByKey.set(hour, current);
  }

  return Array.from(hourlyByKey.values()).sort((left, right) => left.hour.localeCompare(right.hour));
}

function buildLiveReport(
  date: string,
  closedOrderRows: DailySummaryRow[],
  itemRows: OrderItemDetailsViewRow[],
  openOrdersCount: number,
  recentDays: DailyReportHistoryDay[],
  snapshotUpdatedAt: string | null,
  deletedBills: DeletedBill[] = [],
): DailyReportSummary {
  const itemsByOrderId = new Map<string, OrderReportItem[]>();

  for (const item of itemRows) {
    const orderItems = itemsByOrderId.get(item.order_id) ?? [];
    orderItems.push({
      item_name: item.item_name,
      category_name: item.category_name,
      quantity: item.quantity,
      unit_price: toNumber(item.unit_price),
    });
    itemsByOrderId.set(item.order_id, orderItems);
  }

  const tableReportsByName = new Map<string, TableReport>();

  for (const orderRow of closedOrderRows) {
    const tableReport = tableReportsByName.get(orderRow.table_name) ?? {
      table_name: orderRow.table_name,
      orders: [],
      table_total: 0,
    };

    const totalAmount = toNumber(orderRow.total_amount);
    const orderReport: OrderReport = {
      order_id: orderRow.order_id,
      opened_at: orderRow.opened_at,
      closed_at: orderRow.closed_at,
      status: orderRow.status,
      payment_method: orderRow.payment_method,
      total_amount: totalAmount,
      items: itemsByOrderId.get(orderRow.order_id) ?? [],
    };

    tableReport.orders.push(orderReport);
    tableReport.table_total = Number((tableReport.table_total + totalAmount).toFixed(2));
    tableReportsByName.set(orderRow.table_name, tableReport);
  }

  const itemReportsByKey = new Map<string, ItemReport>();

  for (const item of itemRows) {
    const revenue = item.quantity * toNumber(item.unit_price);
    const key = `${item.item_name}::${item.category_name}`;
    const current = itemReportsByKey.get(key) ?? {
      item_name: item.item_name,
      category_name: item.category_name,
      total_quantity: 0,
      total_revenue: 0,
    };

    current.total_quantity += item.quantity;
    current.total_revenue = Number((current.total_revenue + revenue).toFixed(2));
    itemReportsByKey.set(key, current);
  }

  const totalRevenue = Number(
    closedOrderRows.reduce((sum, row) => sum + toNumber(row.total_amount), 0).toFixed(2),
  );
  const cashTotal = Number(
    closedOrderRows
      .filter((row) => row.payment_method === 'cash')
      .reduce((sum, row) => sum + toNumber(row.total_amount), 0)
      .toFixed(2),
  );
  const cardTotal = Number(
    closedOrderRows
      .filter((row) => row.payment_method === 'credit_card')
      .reduce((sum, row) => sum + toNumber(row.total_amount), 0)
      .toFixed(2),
  );

  return {
    date,
    generated_at: new Date().toISOString(),
    snapshot_updated_at: snapshotUpdatedAt,
    source: 'live',
    summary: {
      total_revenue: totalRevenue,
      total_orders: closedOrderRows.length,
      cash_total: cashTotal,
      card_total: cardTotal,
      open_orders_count: openOrdersCount,
    },
    by_table: Array.from(tableReportsByName.values()),
    by_item: Array.from(itemReportsByKey.values()).sort((left, right) => right.total_revenue - left.total_revenue),
    by_category: buildCategoryBreakdown(itemRows),
    payment_breakdown: buildPaymentBreakdown(closedOrderRows),
    hourly_breakdown: buildHourlyBreakdown(closedOrderRows),
    recent_days: recentDays,
    deleted_bills: deletedBills,
  };
}

function extractFirstAndLastOrderTimes(report: DailyReportSummary): {
  firstOrderAt: string | null;
  lastOrderAt: string | null;
} {
  const orders = report.by_table.flatMap((tableReport) => tableReport.orders);

  if (!orders.length) {
    return {
      firstOrderAt: null,
      lastOrderAt: null,
    };
  }

  const openedAtValues = orders.map((order) => order.opened_at).sort();
  const closedOrOpenedValues = orders.map((order) => order.closed_at ?? order.opened_at).sort();

  return {
    firstOrderAt: openedAtValues[0] ?? null,
    lastOrderAt: closedOrOpenedValues[closedOrOpenedValues.length - 1] ?? null,
  };
}

async function upsertReportSnapshot(
  supabase: DatabaseClient,
  report: DailyReportSummary,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  const orderTimes = extractFirstAndLastOrderTimes(report);
  const { error } = await supabase.from('z_report_snapshots').upsert(
    {
      report_date: report.date,
      payload: report,
      total_revenue: report.summary.total_revenue,
      total_orders: report.summary.total_orders,
      cash_total: report.summary.cash_total,
      card_total: report.summary.card_total,
      open_orders_count: report.summary.open_orders_count,
      first_order_at: orderTimes.firstOrderAt,
      last_order_at: orderTimes.lastOrderAt,
      updated_at: updatedAt,
    },
    {
      onConflict: 'report_date',
    },
  );

  if (error) {
    throw serverError('Failed to persist report snapshot.');
  }
}

export async function refreshDailyReportSnapshot(
  supabase: DatabaseClient,
  dateParam: string | null,
): Promise<void> {
  const window = resolveReportWindow(dateParam);
  const [closedOrderRows, openOrdersCount, deletedBills] = await Promise.all([
    listClosedOrderSummaries(supabase, window),
    countOpenOrdersAtEndOfDay(supabase, window),
    fetchDeletedOrdersForDate(supabase, window),
  ]);

  const orderIds = closedOrderRows.map((row) => row.order_id);
  const itemRows = await listOrderItemDetails(supabase, orderIds);
  const report = buildLiveReport(
    window.date,
    closedOrderRows,
    itemRows,
    openOrdersCount,
    [],
    null,
    deletedBills,
  );

  await upsertReportSnapshot(supabase, report);
}

function mergeRecentDaysWithLiveReport(
  recentDays: DailyReportHistoryDay[],
  report: DailyReportSummary,
  snapshotUpdatedAt: string,
): DailyReportHistoryDay[] {
  const orderTimes = extractFirstAndLastOrderTimes(report);

  return recentDays.map((entry) =>
    entry.date === report.date
      ? {
          date: report.date,
          total_revenue: report.summary.total_revenue,
          total_orders: report.summary.total_orders,
          cash_total: report.summary.cash_total,
          card_total: report.summary.card_total,
          open_orders_count: report.summary.open_orders_count,
          first_order_at: orderTimes.firstOrderAt,
          last_order_at: orderTimes.lastOrderAt,
          snapshot_updated_at: snapshotUpdatedAt,
        }
      : entry,
  );
}

function mergeSnapshotPayload(
  snapshot: SnapshotRow,
  recentDays: DailyReportHistoryDay[],
): DailyReportSummary {
  const payload = snapshot.payload;

  return {
    ...payload,
    generated_at: new Date().toISOString(),
    snapshot_updated_at: snapshot.updated_at,
    source: 'snapshot',
    recent_days: recentDays,
  };
}

export async function getDailyReport(
  supabase: DatabaseClient,
  dateParam: string | null,
): Promise<DailyReportSummary> {
  const window = resolveReportWindow(dateParam);
  const [snapshotForDate, recentSnapshotRows, closedOrderRows, openOrdersCount, deletedBills] = await Promise.all([
    getSnapshotForDate(supabase, window.date),
    listSnapshotRowsInWindow(supabase, window.date),
    listClosedOrderSummaries(supabase, window),
    countOpenOrdersAtEndOfDay(supabase, window),
    fetchDeletedOrdersForDate(supabase, window),
  ]);

  const recentDays = buildHistoryDays(window.date, recentSnapshotRows);
  const orderIds = closedOrderRows.map((row) => row.order_id);
  const itemRows = await listOrderItemDetails(supabase, orderIds);
  const hasLiveData = closedOrderRows.length > 0 || openOrdersCount > 0 || window.date === getTodayInIstanbul() || deletedBills.length > 0;

  if (hasLiveData) {
    const liveReport = buildLiveReport(
      window.date,
      closedOrderRows,
      itemRows,
      openOrdersCount,
      recentDays,
      snapshotForDate?.updated_at ?? null,
      deletedBills,
    );

    const snapshotUpdatedAt = new Date().toISOString();

    await upsertReportSnapshot(supabase, liveReport, snapshotUpdatedAt);

    return {
      ...liveReport,
      snapshot_updated_at: snapshotUpdatedAt,
      recent_days: mergeRecentDaysWithLiveReport(recentDays, liveReport, snapshotUpdatedAt),
    };
  }

  if (snapshotForDate) {
    return mergeSnapshotPayload(snapshotForDate, recentDays);
  }

  return buildEmptyReport(window.date, recentDays, 'live', null, deletedBills);
}

export function buildDailyReportCsv(report: DailyReportSummary): string {
  const header = [
    'Masa',
    'Urun',
    'Kategori',
    'Adet',
    'Birim Fiyat',
    'Toplam',
    'Odeme Yontemi',
    'Saat',
  ];

  const rows: Array<Array<string | number | null>> = [header];

  for (const tableReport of report.by_table) {
    for (const order of tableReport.orders) {
      const reportItems = order.items.length
        ? order.items
        : [{ item_name: '', category_name: '', quantity: 0, unit_price: 0 }];

      for (const item of reportItems) {
        rows.push([
          tableReport.table_name,
          item.item_name,
          item.category_name,
          item.quantity,
          item.unit_price,
          Number((item.quantity * item.unit_price).toFixed(2)),
          order.payment_method,
          formatIstanbulTime(order.closed_at ?? order.opened_at),
        ]);
      }
    }
  }

  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
    .join('\n');
}
