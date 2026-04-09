import React from 'react';
import { Bot, User, BrainCircuit } from 'lucide-react';
import { formatCreditsForDisplay } from "@/lib/utils";

interface Agent {
  name: string;
  credits: number;
  role?: 'bot' | 'human';
  id?: string;
  model?: string;
}

interface AgentListProps {
  agents: Agent[];
  creditsByModel?: Array<{ name: string; percent: number }>;
}

export function AgentList({ agents, creditsByModel = [] }: AgentListProps) {
  return (
    <div className="h-full flex flex-col bg-card rounded-md border border-border overflow-hidden transition-colors duration-300">
      <div className="p-5 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="text-foreground font-semibold">Top Agentes</h3>
          <p className="text-xs text-muted-foreground mt-1">Consumo de créditos por agente</p>
        </div>
        <button className="text-xs text-accent hover:text-accent/80 transition-colors font-medium">Ver todos</button>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {agents.length > 0 ? (
          agents.map((agent, index) => {
            const agentId = agent.id || `agent-${index}`;
            const isBot = agent.role === 'bot' || !agent.role;
            
            return (
              <div key={agentId} className="group flex items-center justify-between p-3 rounded-md hover:bg-muted transition-all duration-200 mb-1">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    isBot
                      ? 'bg-accent/10 border-accent/20 text-accent'
                      : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {isBot ? <Bot size={16} /> : <User size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors">{agent.name}</p>
                    {agent.model && (
                      <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <BrainCircuit size={10} className="text-accent" />
                        {agent.model}
                      </p>
                    )}
                    {!agent.model && agentId && (
                      <p className="text-[10px] text-muted-foreground font-mono">ID: {agentId.substring(0, 8)}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{formatCreditsForDisplay(agent.credits)}</p>
                  <p className="text-[10px] text-muted-foreground">créditos</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhum agente encontrado
          </div>
        )}
      </div>

      {creditsByModel.length > 0 && (
        <div className="p-4 bg-background border-t border-border">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Modelos Utilizados</h4>
          <div className="space-y-3">
            {creditsByModel.map((model, index) => {
              const colors = [
                { icon: 'text-rose-400 dark:text-rose-300', bar: 'bg-rose-400' },
                { icon: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-600' },
                { icon: 'text-primary', bar: 'bg-primary' },
                { icon: 'text-accent', bar: 'bg-accent' },
              ];
              const color = colors[index % colors.length];
              
              return (
                <div key={model.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <BrainCircuit size={14} className={color.icon} />
                    <span className="text-foreground font-medium">{model.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${color.bar} w-[${model.percent}%] rounded-full`} style={{ width: `${model.percent}%` }}></div>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{model.percent}%</span>
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

