"use client"

import React, { useState } from 'react';
import { 
  MessageSquare, 
  Clock, 
  Filter, 
  Send, 
  Trash2, 
  MapPin, 
  Plus, 
  Users, 
  Sparkles, 
  ChevronRight,
  Target,
  Zap
} from 'lucide-react';

type TabType = 'recovery' | 'broadcast';

interface RecoveryStep {
  id: string;
  days: number;
  message: string;
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('recovery');
  const [recoverySteps, setRecoverySteps] = useState<RecoveryStep[]>([
    { id: '1', days: 3, message: 'Olá {{nome_cliente}}, notamos que você ainda não agendou seu retorno. Que tal um café por nossa conta?' },
    { id: '2', days: 7, message: 'Oi {{nome_cliente}}, faz uma semana desde nosso último contato. Preparamos um desconto de 15% para você hoje!' }
  ]);

  const addStep = () => {
    const newStep: RecoveryStep = {
      id: Date.now().toString(),
      days: 5,
      message: ''
    };
    setRecoverySteps([...recoverySteps, newStep]);
  };

  const removeStep = (id: string) => {
    setRecoverySteps(recoverySteps.filter(step => step.id !== id));
  };

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-end flex-shrink-0">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Automação de Marketing</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Recupere clientes inativos e impulsione suas vendas com IA.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/5">
          <button 
            onClick={() => setActiveTab('recovery')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'recovery' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Fluxo de Recuperação
          </button>
          <button 
            onClick={() => setActiveTab('broadcast')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'broadcast' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Campanhas e Promoções
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {activeTab === 'recovery' ? (
          <div className="max-w-4xl mx-auto space-y-6 pb-10">
            {/* Steps Timeline */}
            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-indigo-500 before:via-slate-200 dark:before:via-slate-800 before:to-transparent">
              
              {recoverySteps.map((step, index) => (
                <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group animate-in fade-in slide-in-from-bottom-4 duration-300">
                  {/* Icon Dot */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white dark:border-slate-900 bg-slate-50 dark:bg-slate-800 text-indigo-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Clock size={16} />
                  </div>
                  
                  {/* Card Content */}
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Etapa {index + 1}</span>
                        <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400 text-[10px] font-bold">
                          <Zap size={10} /> AUTO
                        </div>
                      </div>
                      <button 
                        onClick={() => removeStep(step.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Enviar após</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            defaultValue={step.days}
                            className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs text-slate-400 font-medium">dias de inatividade</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Mensagem (Suporta variávies)</label>
                        <textarea 
                          rows={3}
                          defaultValue={step.message}
                          placeholder="Digite o conteúdo aqui..."
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-all resize-none"
                        />
                        <div className="flex gap-2">
                          <span className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 cursor-pointer hover:bg-indigo-500 hover:text-white transition-all">{"{{nome_cliente}}"}</span>
                          <span className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 cursor-pointer hover:bg-indigo-500 hover:text-white transition-all">{"{{ultimo_servico}}"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Button */}
            <div className="flex justify-center pt-4">
              <button 
                onClick={addStep}
                className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-sm font-bold text-slate-400 hover:text-indigo-500 hover:border-indigo-500/50 transition-all group"
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform" />
                Adicionar nova etapa no fluxo
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Segmentation Column */}
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">Definir Público Alvo</h3>
                    <p className="text-xs text-slate-500">Selecione quem receberá esta campanha.</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Raio de Distância</label>
                    <select className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500">
                      <option>Todos os locais</option>
                      <option>Até 1km de distância</option>
                      <option>Até 5km de distância</option>
                      <option>Até 10km de distância</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Última Visita</label>
                      <select className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500">
                        <option>Qualquer tempo</option>
                        <option>Mais de 30 dias</option>
                        <option>Mais de 60 dias</option>
                        <option>Nunca visitou</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Gênero</label>
                      <select className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500">
                        <option>Todos</option>
                        <option>Masculino</option>
                        <option>Feminino</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Serviço Realizado</label>
                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl">
                      {['Barba', 'Corte', 'Coloração', 'Pezinho'].map(serv => (
                        <span key={serv} className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-full text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 hover:border-indigo-500 cursor-pointer transition-all">
                          {serv} <Plus size={10} />
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-800 dark:text-white">1,248</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Leads encontrados</p>
                    </div>
                  </div>
                  <button className="text-xs font-bold text-indigo-500 hover:underline flex items-center gap-1">
                    Ver lista <ChevronRight size={14} />
                  </button>
                </div>
              </section>
            </div>

            {/* Message Column */}
            <div className="space-y-6">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-violet-500 rounded-xl text-white shadow-lg shadow-violet-500/20">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">Conteúdo da Campanha</h3>
                    <p className="text-xs text-slate-500">Escreva o que será enviado no broadcast.</p>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div className="flex flex-col gap-1.5 h-full">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mensagem do Disparo</label>
                    <textarea 
                      placeholder="Ex: Olá! Temos uma oferta imperdível para este final de semana..."
                      className="w-full flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-4 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500 transition-all resize-none min-h-[200px]"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5">
                  <button className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 transition-all hover:-translate-y-1 active:scale-95">
                    <Send size={18} />
                    Disparar Campanha Agora
                  </button>
                  <p className="text-[10px] text-center text-slate-400 mt-4 font-medium italic">
                    Ao clicar em disparar, as mensagens serão enviadas via WhatsApp API para os 1,248 contatos.
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
