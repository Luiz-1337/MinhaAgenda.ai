"use client"

import React, { useState } from 'react';
import { Bot, ArrowRight, Mail, User, MessageSquare, Building2, CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function ContactPage() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const isEnterprise = reason === 'enterprise_plan'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="text-white" size={20} />
            </div>
            <span className="font-bold text-xl text-slate-800 dark:text-white tracking-tight">
              minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="/" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors">Voltar para Home</a>
          </nav>
        </div>
      </header>

      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              {isEnterprise ? 'Fale com nosso time de Vendas' : 'Entre em contato'}
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              {isEnterprise 
                ? 'Para grandes redes e franquias, oferecemos soluções personalizadas. Preencha o formulário e entraremos em contato em até 24 horas.' 
                : 'Tem alguma dúvida ou sugestão? Estamos aqui para ajudar.'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="md:col-span-1 space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Por que o Enterprise?</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-400 text-sm">Gestão multi-unidades centralizada</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-400 text-sm">API dedicada para integrações</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-400 text-sm">Gerente de conta exclusivo</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-400 text-sm">SLA garantido de 99.9%</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Precisa de ajuda imediata?</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Envie um e-mail direto para nossa equipe de suporte.
                </p>
                <a href="mailto:contato@minhaagenda.ai" className="text-indigo-600 dark:text-indigo-400 font-medium text-sm hover:underline">
                  contato@minhaagenda.ai
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-white/5 shadow-xl">
              <form className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input 
                        type="text" 
                        id="name"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        placeholder="Seu nome"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company" className="text-sm font-medium text-slate-700 dark:text-slate-300">Empresa</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input 
                        type="text" 
                        id="company"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                        placeholder="Nome do Salão/Rede"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">E-mail Corporativo</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input 
                      type="email" 
                      id="email"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                      placeholder="voce@empresa.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-slate-700 dark:text-slate-300">Mensagem</label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <textarea 
                      id="message"
                      rows={4}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                      placeholder="Conte-nos sobre sua necessidade..."
                    ></textarea>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Enviar Mensagem
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

