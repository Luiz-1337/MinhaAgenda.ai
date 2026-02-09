"use client"

import React, { useEffect, useState, useTransition } from 'react';
import { useParams } from 'next/navigation';
import {
  MessageSquare,
  Clock,
  Send,
  Trash2,
  Plus,
  Users,
  ChevronRight,
  Target,
  Zap,
  X
} from 'lucide-react';
import { getRecoveryFlow, saveRecoveryFlow, previewSegmentedLeads, createBroadcastCampaign, sendBroadcastCampaign, listSegmentedLeads } from "@/app/actions/marketing";
import { getServices } from "@/app/actions/services";
import type { ServiceRow } from "@/lib/types/service";

type TabType = 'recovery' | 'broadcast';

interface RecoveryStep {
  id: string;
  days: number;
  message: string;
}

interface RecoveryStepFromApi {
  id: string;
  daysAfterInactivity: number;
  messageTemplate: string;
}

export default function MarketingPage() {
  const params = useParams<{ salonId: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('recovery');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState<string>('');
  const [recoverySteps, setRecoverySteps] = useState<RecoveryStep[]>([]);
  const [isFlowLoading, setIsFlowLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isLoading, startLoading] = useTransition();
  const [isServicesLoading, startServicesLoading] = useTransition();
  const [isPreviewing, startPreviewing] = useTransition();
  const [isLeadsLoading, startLeadsLoading] = useTransition();
  const [isSending, startSending] = useTransition();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceSearch, setServiceSearch] = useState<string>("");
  const [selectedServices, setSelectedServices] = useState<ServiceRow[]>([]);
  const [lastVisitFilter, setLastVisitFilter] = useState<string>("any");
  const [leadsCount, setLeadsCount] = useState<number>(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [campaignMessage, setCampaignMessage] = useState<string>("");
  const [isLeadsModalOpen, setIsLeadsModalOpen] = useState<boolean>(false);
  const [leadsList, setLeadsList] = useState<Array<{ id: string; name: string }>>([]);
  const [leadsListError, setLeadsListError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.salonId) {
      return;
    }

    startLoading(async () => {
      setLoadError(null);
      setIsFlowLoading(true);

      try {
        const result = await getRecoveryFlow(params.salonId);
        if ("error" in result) {
          setLoadError(result.error);
          return;
        }

        if (result.data) {
          setFlowId(result.data.id);
          setFlowName(result.data.name || 'Fluxo de Recuperação');
          setRecoverySteps(
            result.data.steps.map((step: RecoveryStepFromApi) => ({
              id: step.id,
              days: step.daysAfterInactivity,
              message: step.messageTemplate,
            }))
          );
        } else {
          setFlowId(null);
          setFlowName('Fluxo de Recuperação');
          setRecoverySteps([]);
        }
      } finally {
        setIsFlowLoading(false);
      }
    });
  }, [params?.salonId]);

  useEffect(() => {
    if (!params?.salonId) {
      return;
    }

    startServicesLoading(async () => {
      const result = await getServices(params.salonId);
      if ("error" in result) {
        setServices([]);
        return;
      }

      setServices((result.data || []).filter((service) => service.is_active));
    });
  }, [params?.salonId]);

  useEffect(() => {
    if (!params?.salonId) {
      return;
    }

    const criteria = {
      lastVisit: lastVisitFilter,
      serviceIds: selectedServices.map((service) => service.id),
    };

    startPreviewing(async () => {
      setPreviewError(null);
      const result = await previewSegmentedLeads(criteria, params.salonId);
      if ("error" in result) {
        setPreviewError(result.error);
        setLeadsCount(0);
        return;
      }

      setLeadsCount(result.data?.count ?? 0);
    });
  }, [params?.salonId, lastVisitFilter, selectedServices]);

  const addStep = () => {
    const newStep: RecoveryStep = {
      id: `temp-${Date.now()}`,
      days: 5,
      message: ''
    };
    setRecoverySteps([...recoverySteps, newStep]);
  };

  const removeStep = (id: string) => {
    setRecoverySteps(recoverySteps.filter(step => step.id !== id));
  };

  const updateStep = (id: string, updates: Partial<RecoveryStep>) => {
    setRecoverySteps((steps) =>
      steps.map((step) => (step.id === id ? { ...step, ...updates } : step))
    );
  };

  const appendVariable = (id: string, variable: string) => {
    setRecoverySteps((steps) =>
      steps.map((step) =>
        step.id === id ? { ...step, message: `${step.message}${variable}` } : step
      )
    );
  };

  const addService = (service: ServiceRow) => {
    setSelectedServices((prev) => {
      if (prev.some((item) => item.id === service.id)) {
        return prev;
      }
      return [...prev, service];
    });
    setServiceSearch("");
  };

  const removeService = (serviceId: string) => {
    setSelectedServices((prev) => prev.filter((service) => service.id !== serviceId));
  };

  const handleSendCampaign = () => {
    setSendError(null);
    setSendSuccess(null);

    if (!params?.salonId) {
      setSendError("Salão inválido.");
      return;
    }

    if (!campaignMessage.trim()) {
      setSendError("Digite uma mensagem para disparar a campanha.");
      return;
    }

    if (leadsCount === 0) {
      setSendError("Não há contatos para o filtro selecionado.");
      return;
    }

    startSending(async () => {
      const campaignName = `Campanha instantânea ${new Date().toLocaleDateString("pt-BR")}`;
      const criteria = {
        lastVisit: lastVisitFilter,
        serviceIds: selectedServices.map((service) => service.id),
      };

      const createResult = await createBroadcastCampaign({
        salonId: params.salonId,
        name: campaignName,
        description: "Disparo imediato pela tela de campanhas",
        message: campaignMessage.trim(),
        segmentationCriteria: criteria,
        includeAiCoupon: false,
      });

      if ("error" in createResult || !createResult.data?.campaignId) {
        setSendError("Falha ao criar a campanha.");
        return;
      }

      const sendResult = await sendBroadcastCampaign(createResult.data.campaignId, params.salonId);
      if ("error" in sendResult) {
        setSendError(sendResult.error);
        return;
      }

      setSendSuccess("Campanha enviada com sucesso.");
    });
  };

  const handleOpenLeadsModal = () => {
    if (!params?.salonId) {
      return;
    }

    setIsLeadsModalOpen(true);
    setLeadsListError(null);

    const criteria = {
      lastVisit: lastVisitFilter,
      serviceIds: selectedServices.map((service) => service.id),
    };

    startLeadsLoading(async () => {
      const result = await listSegmentedLeads(criteria, params.salonId);
      if ("error" in result) {
        setLeadsList([]);
        setLeadsListError(result.error);
        return;
      }

      setLeadsList(result.data?.leads ?? []);
    });
  };

  const handleCloseLeadsModal = () => {
    setIsLeadsModalOpen(false);
  };

  const handleSaveFlow = () => {
    setSaveError(null);
    setSaveSuccess(null);

    if (!params?.salonId) {
      setSaveError("Salão inválido.");
      return;
    }

    const hasEmptyMessage = recoverySteps.some((step) => step.message.trim().length === 0);
    if (hasEmptyMessage) {
      setSaveError("Preencha a mensagem de todas as etapas antes de salvar.");
      return;
    }

    startSaving(async () => {
      const result = await saveRecoveryFlow({
        salonId: params.salonId,
        id: flowId || undefined,
        name: flowName,
        steps: recoverySteps.map((step) => ({
          id: step.id.startsWith('temp-') ? undefined : step.id,
          days: step.days,
          message: step.message,
        })),
      });

      if ("error" in result) {
        setSaveError(result.error);
        return;
      }

      if (!result.data?.flowId) {
        setSaveError("Não foi possível salvar o fluxo.");
        return;
      }

      setFlowId(result.data.flowId);
      setSaveSuccess("Fluxo salvo com sucesso.");
    });
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
            {(loadError || saveError || saveSuccess) && (
              <div className="space-y-2">
                {loadError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                    {loadError}
                  </div>
                )}
                {saveError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-600">
                    {saveSuccess}
                  </div>
                )}
              </div>
            )}

            {isFlowLoading ? (
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-6 text-center text-sm text-slate-500">
                Carregando fluxo...
              </div>
            ) : (
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
                              value={step.days}
                              onChange={(event) => {
                                const nextDays = Number(event.target.value);
                                updateStep(step.id, { days: Number.isNaN(nextDays) ? 0 : nextDays });
                              }}
                              className="w-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs text-slate-400 font-medium">dias de inatividade</span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Mensagem (Suporta variáveis)</label>
                          <textarea
                            rows={3}
                            value={step.message}
                            onChange={(event) => updateStep(step.id, { message: event.target.value })}
                            placeholder="Digite o conteúdo aqui..."
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500 transition-all resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => appendVariable(step.id, "{{nome_cliente}}")}
                              className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 hover:bg-indigo-500 hover:text-white transition-all"
                            >
                              {"{{nome_cliente}}"}
                            </button>
                            <button
                              type="button"
                              onClick={() => appendVariable(step.id, "{{ultimo_servico}}")}
                              className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 hover:bg-indigo-500 hover:text-white transition-all"
                            >
                              {"{{ultimo_servico}}"}
                            </button>
                            <button
                              type="button"
                              onClick={() => appendVariable(step.id, "{{ultima_visita}}")}
                              className="text-[10px] bg-slate-100 dark:bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 hover:bg-indigo-500 hover:text-white transition-all"
                            >
                              {"{{ultima_visita}}"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Button */}
            <div className="flex flex-col items-center gap-4 pt-4">
              <button
                onClick={addStep}
                className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-sm font-bold text-slate-400 hover:text-indigo-500 hover:border-indigo-500/50 transition-all group"
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform" />
                Adicionar nova etapa no fluxo
              </button>
              <button
                onClick={handleSaveFlow}
                disabled={isSaving || isLoading || isFlowLoading}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-2xl text-sm font-bold shadow-xl shadow-indigo-500/20 transition-all hover:-translate-y-1 active:scale-95 disabled:cursor-not-allowed"
              >
                {isSaving ? "Salvando..." : "Salvar fluxo"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Segmentation Column */}
            <div className="space-y-6 h-full">
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                  <div className="p-2 bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">Definir Público Alvo</h3>
                    <p className="text-xs text-slate-500">Selecione quem receberá esta campanha.</p>
                  </div>
                </div>

                <div className="space-y-5 flex-1">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Última Visita</label>
                    <select
                      value={lastVisitFilter}
                      onChange={(event) => setLastVisitFilter(event.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="any">Qualquer tempo</option>
                      <option value="30days">Mais de 30 dias</option>
                      <option value="60days">Mais de 60 dias</option>
                      <option value="never">Nunca visitou</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Serviço Realizado</label>
                    <div className="space-y-3">
                      <input
                        value={serviceSearch}
                        onChange={(event) => setServiceSearch(event.target.value)}
                        placeholder="Buscar serviço..."
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                      {serviceSearch.trim().length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {services
                            .filter((service) =>
                              service.name.toLowerCase().includes(serviceSearch.toLowerCase())
                            )
                            .filter((service) => !selectedServices.some((item) => item.id === service.id))
                            .slice(0, 8)
                            .map((service) => (
                              <button
                                key={service.id}
                                type="button"
                                onClick={() => addService(service)}
                                className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-full text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 hover:border-indigo-500 transition-all"
                              >
                                {service.name} <Plus size={10} />
                              </button>
                            ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {isServicesLoading && services.length === 0 ? (
                          <span className="text-[10px] text-slate-400">Carregando serviços...</span>
                        ) : selectedServices.length === 0 ? (
                          <span className="text-[10px] text-slate-400">Nenhum serviço selecionado</span>
                        ) : (
                          selectedServices.map((service) => (
                            <span
                              key={service.id}
                              className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-full text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"
                            >
                              {service.name}
                              <button
                                type="button"
                                onClick={() => removeService(service.id)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-800 dark:text-white">
                        {isPreviewing ? "..." : leadsCount.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Leads encontrados</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenLeadsModal}
                    disabled={leadsCount === 0}
                    className="text-xs font-bold text-indigo-500 hover:underline flex items-center gap-1 disabled:text-slate-300 disabled:cursor-not-allowed"
                  >
                    Ver lista <ChevronRight size={14} />
                  </button>
                </div>
                {previewError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[10px] font-medium text-red-600 flex-shrink-0">
                    {previewError}
                  </div>
                )}
              </section>
            </div>

            {/* Message Column */}
            <div className="space-y-6 h-full">
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
                      value={campaignMessage}
                      onChange={(event) => setCampaignMessage(event.target.value)}
                      className="w-full flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-4 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500 transition-all resize-none min-h-[200px]"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5">
                  <button
                    onClick={handleSendCampaign}
                    disabled={isSending || leadsCount === 0 || campaignMessage.trim().length === 0}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 transition-all hover:-translate-y-1 active:scale-95 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                    {isSending ? "Enviando..." : "Enviar agora"}
                  </button>
                  <p className="text-[10px] text-center text-slate-400 mt-4 font-medium italic">
                    Ao clicar em enviar, as mensagens serão disparadas via Twilio para {leadsCount.toLocaleString("pt-BR")} contatos.
                  </p>
                  {(sendError || sendSuccess) && (
                    <div className="mt-4 space-y-2">
                      {sendError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[10px] font-medium text-red-600">
                          {sendError}
                        </div>
                      )}
                      {sendSuccess && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[10px] font-medium text-emerald-600">
                          {sendSuccess}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
      {isLeadsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Leads encontrados</p>
                <p className="text-[10px] text-slate-400">Baseado no filtro atual</p>
              </div>
              <button
                type="button"
                onClick={handleCloseLeadsModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-4 max-h-[320px] overflow-y-auto custom-scrollbar">
              {isLeadsLoading && (
                <p className="text-xs text-slate-400">Carregando contatos...</p>
              )}
              {!isLeadsLoading && leadsListError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-medium text-red-600">
                  {leadsListError}
                </div>
              )}
              {!isLeadsLoading && !leadsListError && leadsList.length === 0 && (
                <p className="text-xs text-slate-400">Nenhum contato encontrado.</p>
              )}
              {!isLeadsLoading && !leadsListError && leadsList.length > 0 && (
                <ul className="space-y-2">
                  {leadsList.map((lead) => (
                    <li
                      key={lead.id}
                      className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                    >
                      {lead.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-slate-100 dark:border-white/5 px-4 py-3">
              <button
                type="button"
                onClick={handleCloseLeadsModal}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 py-2 text-xs font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
