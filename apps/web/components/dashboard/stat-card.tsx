import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  badgeText?: string;
  badgeType?: 'success' | 'neutral' | 'warning';
  icon?: React.ReactNode;
  trend?: string;
}

export function StatCard({ 
  title, 
  value, 
  subtext, 
  badgeText, 
  badgeType = 'neutral',
  icon,
  trend 
}: StatCardProps) {
  const getBadgeColors = () => {
    switch(badgeType) {
      case 'success': return 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'warning': return 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="relative group overflow-hidden bg-card rounded-md border border-border p-5 transition-all duration-300 hover:border-border">

      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 rounded-md bg-muted border border-border text-accent">
          {icon}
        </div>
        {badgeText && (
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-sm border ${getBadgeColors()}`}>
            {badgeText}
          </span>
        )}
      </div>

      <div>
        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold text-foreground tracking-tight">{value}</h3>
          {trend && <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">{trend}</span>}
        </div>
        {subtext && (
          <p className="mt-2 text-xs text-muted-foreground">{subtext}</p>
        )}
      </div>
    </div>
  );
}

