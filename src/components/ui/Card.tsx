import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  const pads = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${pads[padding]} ${className}`}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  trend?: { value: string; positive: boolean };
  badge?: { text: string; variant: 'success' | 'warning' | 'danger' | 'info' };
  color?: 'blue' | 'green' | 'amber' | 'red';
}

const COLORS = {
  blue: { icon: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
  green: { icon: 'bg-green-50 text-green-600', border: 'border-green-100' },
  amber: { icon: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
  red: { icon: 'bg-red-50 text-red-600', border: 'border-red-100' },
};

export function MetricCard({ label, value, subtext, icon, trend, badge, color = 'blue' }: MetricCardProps) {
  const c = COLORS[color];
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && <div className={`p-2 rounded-lg ${c.icon}`}>{icon}</div>}
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      {trend && (
        <div className={`text-sm font-medium mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
          {trend.positive ? '↑' : '↓'} {trend.value}
        </div>
      )}
      {subtext && <p className="text-sm text-slate-500 mt-1">{subtext}</p>}
      {badge && (
        <div className="mt-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            badge.variant === 'success' ? 'bg-green-100 text-green-700' :
            badge.variant === 'warning' ? 'bg-amber-100 text-amber-700' :
            badge.variant === 'danger' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>{badge.text}</span>
        </div>
      )}
    </Card>
  );
}
