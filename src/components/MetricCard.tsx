import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export default function MetricCard({ title, value, icon, className }: MetricCardProps) {
  return (
    <Card className={cn('animate-fade-in', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          {icon && <div className="text-muted-foreground shrink-0">{icon}</div>}
        </div>
        <p className="text-xl font-bold mt-1 tabular-nums break-words leading-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
