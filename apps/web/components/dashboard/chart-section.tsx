"use client"

import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTheme } from 'next-themes';

interface ChartData {
  date: string;
  value: number;
}

interface ChartSectionProps {
  data: ChartData[];
  range?: 7 | 14 | 30;
  onRangeChange?: (range: 7 | 14 | 30) => void;
}

export function ChartSection({ data, range = 7, onRangeChange }: ChartSectionProps) {
  const { theme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark');
  
  // Theme-aware colors
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const axisColor = isDark ? '#64748b' : '#94a3b8';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipText = isDark ? '#e2e8f0' : '#1e293b';

  const handleRangeClick = (newRange: 7 | 14 | 30) => {
    if (onRangeChange) {
      onRangeChange(newRange);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 relative overflow-hidden transition-colors duration-300">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent"></div>
      
      <div className="p-5 flex justify-between items-start z-10">
        <div>
          <h3 className="text-slate-800 dark:text-slate-200 font-semibold">Gastos de créditos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Monitoramento em tempo real ({range} dias)</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-950 rounded-lg p-1 border border-slate-200 dark:border-white/5">
            {([7, 14, 30] as const).map((r) => (
                <button 
                    key={r}
                    onClick={() => handleRangeClick(r)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                        range === r
                        ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm dark:shadow-lg dark:shadow-indigo-500/20' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                    {r}d
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: axisColor, fontSize: 10 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: axisColor, fontSize: 10 }} 
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: tooltipBg, 
                borderColor: tooltipBorder, 
                borderRadius: '8px', 
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                color: tooltipText
              }}
              itemStyle={{ color: isDark ? '#e2e8f0' : '#475569', fontSize: '12px', fontWeight: 500 }}
              labelStyle={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px' }}
              formatter={(value) => [`${value} C`, 'Créditos']}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#6366f1" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorCredits)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

