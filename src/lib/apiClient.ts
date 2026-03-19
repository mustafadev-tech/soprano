import axios from 'axios';
import type {
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  Method,
} from 'axios';

import type { ApiResponse } from '@/types/contract';

export interface ApiRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  cacheTTL?: number;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const getRequestCache = new Map<string, CacheEntry>();
const inFlightGetRequests = new Map<string, Promise<AxiosResponse<unknown>>>();

const DEFAULT_RETRY_COUNT = 2;
const RETRY_DELAY_MS = 500;

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const apiErrorMessages: Array<[needle: string, message: string]> = [
  ['Unauthorized', 'Oturum süreniz doldu, tekrar giriş yapın'],
  ['Forbidden', 'Bu işlem için yetkiniz yok'],
  ['Table not found', 'Masa bulunamadi'],
  ['Order not found', 'Siparis bulunamadi'],
  ['Order item not found', 'Siparis kalemi bulunamadi'],
  ['Only open empty orders can be deleted', 'Sadece bos acik siparis silinebilir'],
  ['Menu item not found', 'Menu urunu bulunamadi'],
  ['Category not found', 'Kategori bulunamadi'],
  ['Todo not found', 'Todo bulunamadi'],
  ['Table already has an open order', 'Masada zaten acik bir siparis var'],
  ['Only empty tables can be deleted', 'Masada acik hesap var, silinemez'],
  ['Table cannot be deleted while it has related orders', 'Masada acik hesap var, silinemez'],
  ['Cannot mark table as empty while it has an open order', 'Acik siparisi olan masa musait yapilamaz'],
  ['Reserved tables cannot be toggled with this action', 'Rezerve masa bu islemle guncellenemez'],
  ['Menu item is not currently available', 'Secilen urun su anda musait degil'],
  ['Category cannot be deleted', 'Kategori silinemedi'],
  ['Menu item cannot be deleted', 'Menu urunu silinemedi'],
  ['Cannot update items on a closed order', 'Kapali siparis guncellenemez'],
  ['Cannot delete items from a closed order', 'Kapali siparisten urun silinemez'],
  ['Cannot add items to a closed order', 'Kapali siparise urun eklenemez'],
  ['Order is already closed', 'Siparis zaten kapatildi'],
  ['Failed to load', 'Veriler yuklenemedi'],
  ['Failed to create', 'Islem gerceklestirilemedi, tekrar deneyin'],
  ['Failed to update', 'Islem gerceklestirilemedi, tekrar deneyin'],
  ['Failed to delete', 'Islem gerceklestirilemedi, tekrar deneyin'],
  ['Failed to load profile', 'Kullanici bilgisi yuklenemedi'],
  ['Failed to load todos', 'Todolar yuklenemedi'],
  ['Failed to create todo', 'Todo eklenemedi'],
  ['Failed to update todo', 'Todo guncellenemedi'],
  ['Failed to delete todo', 'Todo silinemedi'],
  ['Invalid credentials', 'Kullanici adi veya sifre hatali'],
  ['Failed to close', 'Islem gerceklestirilemedi, tekrar deneyin'],
  ['Failed to create table', 'Masa eklenemedi, tekrar deneyin'],
  ['Source order has no items', 'Transfer edilecek sipariş boş'],
  ['Cannot transfer to the same table', 'Aynı masaya transfer yapılamaz'],
  ['Target table not found', 'Hedef masa bulunamadı'],
  ['Internal server error', 'Sunucu hatasi olustu'],
];

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function normalizeUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/i, '');
}

function buildRequestKey<D>(method: Method | undefined, config: ApiRequestConfig<D>): string {
  const requestMethod = (method ?? config.method ?? 'get').toLowerCase();
  const requestUrl = apiClient.getUri({
    ...config,
    method: requestMethod,
    baseURL: '',
  });

  return normalizeUrl(requestUrl);
}

function isRetryableNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

async function requestWithRetry<T, D = unknown>(
  method: Method,
  config: ApiRequestConfig<D>,
  retriesRemaining = DEFAULT_RETRY_COUNT,
): Promise<AxiosResponse<T>> {
  try {
    return await apiClient.request<T, AxiosResponse<T>, D>({
      ...config,
      method,
    });
  } catch (error) {
    if (!isRetryableNetworkError(error) || retriesRemaining <= 0) {
      throw error;
    }

    await sleep(RETRY_DELAY_MS);
    return requestWithRetry<T, D>(method, config, retriesRemaining - 1);
  }
}

export function clearCache(url?: string): void {
  if (!url) {
    getRequestCache.clear();
    return;
  }

  const normalizedUrl = normalizeUrl(url);

  for (const key of getRequestCache.keys()) {
    if (key === normalizedUrl || key.startsWith(`${normalizedUrl}?`)) {
      getRequestCache.delete(key);
    }
  }
}

export async function apiGet<T, D = unknown>(
  url: string,
  config: ApiRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  const requestKey = buildRequestKey('get', { ...config, url });
  const cacheTTL = config.cacheTTL ?? 0;

  if (cacheTTL > 0) {
    const cached = getRequestCache.get(requestKey);

    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return {
        data: cached.data as T,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { ...(config as InternalAxiosRequestConfig<D>), url },
      };
    }
  }

  const inFlight = inFlightGetRequests.get(requestKey) as Promise<AxiosResponse<T>> | undefined;

  if (inFlight) {
    return inFlight;
  }

  const requestPromise = requestWithRetry<T, D>('get', { ...config, url }).then((response) => {
    if (cacheTTL > 0) {
      getRequestCache.set(requestKey, {
        data: response.data,
        timestamp: Date.now(),
      });
    }

    return response;
  });

  inFlightGetRequests.set(requestKey, requestPromise as Promise<AxiosResponse<unknown>>);

  try {
    return await requestPromise;
  } finally {
    inFlightGetRequests.delete(requestKey);
  }
}

export function apiPost<T, D = unknown>(
  url: string,
  data?: D,
  config: ApiRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return requestWithRetry<T, D>('post', { ...config, url, data });
}

export function apiPatch<T, D = unknown>(
  url: string,
  data?: D,
  config: ApiRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return requestWithRetry<T, D>('patch', { ...config, url, data });
}

export function apiDelete<T, D = unknown>(
  url: string,
  config: ApiRequestConfig<D> = {},
): Promise<AxiosResponse<T>> {
  return requestWithRetry<T, D>('delete', { ...config, url });
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as ApiResponse<unknown> | undefined;
    const apiError = responseData?.error;

    if (apiError) {
      const translated = apiErrorMessages.find(([needle]) => apiError.includes(needle));
      return translated?.[1] ?? fallbackMessage;
    }
  }

  return fallbackMessage;
}

export async function unwrapApiResponse<T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const response = await request;

  if (response.data.error || response.data.data === null) {
    throw new Error(response.data.error ?? 'Unknown API error');
  }

  return response.data.data;
}
