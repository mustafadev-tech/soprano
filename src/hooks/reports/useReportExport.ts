import { useState } from 'react';

import { apiClient, getApiErrorMessage } from '@/lib/apiClient';

interface UseReportExportResult {
  exportCSV: (date: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useReportExport(): UseReportExportResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCSV(date: string): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<string>(`/api/reports/daily/export?date=${encodeURIComponent(date)}`, {
        responseType: 'text',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `z-raporu-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(getApiErrorMessage(exportError, 'Islem gerceklestirilemedi, tekrar deneyin'));
    } finally {
      setLoading(false);
    }
  }

  return { exportCSV, loading, error };
}
