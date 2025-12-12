import React from 'react';
import { Bot, User, BrainCircuit } from 'lucide-react';

interface Agent {
  name: string;
  credits: number;
  role?: 'bot' | 'human';
  id?: string;
}

interface AgentListProps {
  agents: Agent[];
  creditsByModel?: Array<{ name: string; percent: number }>;
}

export function AgentList({ agents, creditsByModel = [] }: AgentListProps) {
  return (
    <div className="h-full flex flex-col bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden transition-colors duration-300">
      <div className="p-5 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
        <div>
          <h3 className="text-slate-800 dark:text-slate-200 font-semibold">Top Agentes</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Consumo de créditos por agente</p>
        </div>
        <button className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors font-medium">Ver todos</button>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {agents.length > 0 ? (
          agents.map((agent, index) => {
            const agentId = agent.id || `agent-${index}`;
            const isBot = agent.role === 'bot' || !agent.role;
            
            return (
              <div key={agentId} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-200 mb-1">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    isBot 
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400' 
                      : 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'
                  }`}>
                    {isBot ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">{agent.name}</p>
                    {agentId && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">ID: {agentId.substring(0, 8)}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{agent.credits.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">créditos</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum agente encontrado
          </div>
        )}
      </div>

      {creditsByModel.length > 0 && (
        <div className="p-4 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-200 dark:border-white/5">
          <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-3">Modelos Utilizados</h4>
          <div className="space-y-3">
            {creditsByModel.map((model, index) => {
              const colors = [
                { icon: 'text-pink-500', bar: 'bg-pink-500' },
                { icon: 'text-blue-500', bar: 'bg-blue-500' },
                { icon: 'text-indigo-500', bar: 'bg-indigo-500' },
                { icon: 'text-violet-500', bar: 'bg-violet-500' },
              ];
              const color = colors[index % colors.length];
              
              return (
                <div key={model.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <BrainCircuit size={14} className={color.icon} />
                    <span className="text-slate-600 dark:text-slate-300 font-medium">{model.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${color.bar} w-[${model.percent}%] rounded-full`} style={{ width: `${model.percent}%` }}></div>
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{model.percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

