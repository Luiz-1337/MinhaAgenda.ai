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
      case 'success': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
      default: return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
  };

  return (
    <div className="relative group overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:border-indigo-300/30 dark:hover:border-white/10 hover:shadow-lg dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.05)] hover:bg-white/80 dark:hover:bg-slate-900/60">
      
      {/* Decorative gradient blob */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all duration-500"></div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 text-indigo-500 dark:text-indigo-400 shadow-sm dark:shadow-none">
          {icon}
        </div>
        {badgeText && (
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border ${getBadgeColors()}`}>
            {badgeText}
          </span>
        )}
      </div>

      <div className="relative z-10">
        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">{value}</h3>
          {trend && <span className="text-emerald-500 dark:text-emerald-400 text-xs font-bold">{trend}</span>}
        </div>
        {subtext && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
        )}
      </div>
    </div>
  );
}

