import { Badge } from '@/components/ui/badge';
import type { TableStatus } from '@/components/_types';

const statusMap: Record<TableStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  available: { variant: 'default', label: 'Müsait' },
  occupied: { variant: 'secondary', label: 'Dolu' },
  reserved: { variant: 'outline', label: 'Rezerve' },
  dirty: { variant: 'destructive', label: 'Temizlenmeli' },
};

interface StatusBadgeProps {
  status: TableStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { variant, label } = statusMap[status];
  return <Badge variant={variant}>{label}</Badge>;
}
