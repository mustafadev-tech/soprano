import { useCallback, useEffect, useState } from 'react';

import { apiGet, getApiErrorMessage, unwrapApiResponse } from '@/lib/apiClient';
import type { GetDailyReportResponse } from '@/types/contract';
import { mapDailyReportToUi, type UiDailyReport } from '@/types/api';

interface UseDailyReportResult {
  report: UiDailyReport | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

export function useDailyReport(date: string): UseDailyReportResult {
  const [report, setReport] = useState<UiDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await unwrapApiResponse(
        apiGet<GetDailyReportResponse>(`/api/reports/daily?date=${encodeURIComponent(date)}`, {
          cacheTTL: 0,
        }),
      );

      setReport(mapDailyReportToUi(data));
      setLastUpdated(new Date());
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError, 'Veriler yuklenemedi'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { report, loading, error, lastUpdated, refetch };
}
