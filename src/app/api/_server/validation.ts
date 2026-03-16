import type { PaymentMethod, TableStatus } from '@/types/contract';

import { badRequest } from '@/app/api/_server/http';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE_STATUSES: TableStatus[] = ['empty', 'occupied', 'reserved'];
const PAYMENT_METHODS: Exclude<PaymentMethod, null>[] = ['cash', 'credit_card'];

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw badRequest('Invalid JSON body.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.');
  }

  return body as Record<string, unknown>;
}

export function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export function ensureAtLeastOneField(body: Record<string, unknown>, fields: string[]): void {
  const hasAtLeastOneField = fields.some((field) => hasOwn(body, field));

  if (!hasAtLeastOneField) {
    throw badRequest(`Request body must include at least one of: ${fields.join(', ')}.`);
  }
}

export function parseUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw badRequest(`${fieldName} must be a valid UUID.`);
  }

  return value;
}

export function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} must be a string.`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw badRequest(`${fieldName} cannot be empty.`);
  }

  return trimmedValue;
}

export function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} must be a string or null.`);
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

export function parsePositiveInteger(value: unknown, fieldName: string): number {
  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw badRequest(`${fieldName} must be a positive integer.`);
  }

  return parsedValue;
}

export function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw badRequest(`${fieldName} must be a boolean.`);
  }

  return value;
}

export function parsePrice(value: unknown, fieldName: string): number {
  const parsedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw badRequest(`${fieldName} must be a non-negative number.`);
  }

  return Number(parsedValue.toFixed(2));
}

export function parseTableStatus(value: unknown): TableStatus {
  if (typeof value !== 'string' || !TABLE_STATUSES.includes(value as TableStatus)) {
    throw badRequest('status must be one of: empty, occupied, reserved.');
  }

  return value as TableStatus;
}

export function parsePaymentMethod(value: unknown): Exclude<PaymentMethod, null> {
  if (typeof value !== 'string' || !PAYMENT_METHODS.includes(value as Exclude<PaymentMethod, null>)) {
    throw badRequest('payment_method must be one of: cash, credit_card.');
  }

  return value as Exclude<PaymentMethod, null>;
}
