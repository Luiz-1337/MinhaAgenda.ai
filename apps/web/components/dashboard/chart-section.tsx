"use client"

import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTheme } from 'next-themes';
import { creditsForDisplay } from "@/lib/utils";

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

  // Exibe valores divididos por 1000 (banco mantém o valor original)
  const displayData = useMemo(
    () => data.map((d) => ({ ...d, value: creditsForDisplay(d.value) })),
    [data]
  );
  
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
    <div className="h-full flex flex-col bg-card rounded-md border border-border relative overflow-hidden transition-colors duration-300">

      <div className="p-5 flex justify-between items-start z-10 flex-shrink-0">
        <div>
          <h3 className="text-foreground font-semibold">Gastos de créditos</h3>
          <p className="text-xs text-muted-foreground mt-1">Monitoramento em tempo real ({range} dias)</p>
        </div>
        <div className="flex bg-muted rounded-lg p-1 border border-border">
          {([7, 14, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleRangeClick(r)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                range === r
                  ? "bg-card text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-2 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              formatter={(value: number) => [`${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} C`, 'Créditos']}
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

