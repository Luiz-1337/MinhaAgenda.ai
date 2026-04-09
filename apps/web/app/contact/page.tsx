"use client"

import React, { useState } from 'react';
import { Bot, ArrowRight, Mail, User, MessageSquare, Building2, CheckCircle2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function ContactPage() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const isEnterprise = reason === 'enterprise_plan'

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 w-full z-10 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
              <Bot className="text-accent-foreground" size={20} />
            </div>
            <span className="font-bold text-xl text-foreground tracking-tight">
              minha<span className="text-accent">agenda</span>.ai
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="/" className="text-sm font-medium text-muted-foreground hover:text-accent transition-colors">Voltar para Home</a>
          </nav>
        </div>
      </header>

      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              {isEnterprise ? 'Fale com nosso time de Vendas' : 'Entre em contato'}
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {isEnterprise 
                ? 'Para grandes redes e franquias, oferecemos soluções personalizadas. Preencha o formulário e entraremos em contato em até 24 horas.' 
                : 'Tem alguma dúvida ou sugestão? Estamos aqui para ajudar.'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {/* Contact Info */}
            <div className="md:col-span-1 space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Por que o Enterprise?</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground text-sm">Gestão multi-unidades centralizada</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground text-sm">API dedicada para integrações</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground text-sm">Gerente de conta exclusivo</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground text-sm">SLA garantido de 99.9%</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 bg-card rounded-md border border-border">
                <h3 className="font-semibold text-foreground mb-2">Precisa de ajuda imediata?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Envie um e-mail direto para nossa equipe de suporte.
                </p>
                <a href="mailto:contato@minhaagenda.ai" className="text-accent font-medium text-sm hover:underline">
                  contato@minhaagenda.ai
                </a>
              </div>
            </div>

            {/* Form */}
            <div className="md:col-span-2 bg-card rounded-lg p-8 border border-border">
              <form className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-foreground">Nome</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <input 
                        type="text" 
                        id="name"
                        className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all"
                        placeholder="Seu nome"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="company" className="text-sm font-medium text-foreground">Empresa</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <input 
                        type="text" 
                        id="company"
                        className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all"
                        placeholder="Nome do Salão/Rede"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">E-mail Corporativo</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                    <input 
                      type="email" 
                      id="email"
                      className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all"
                      placeholder="voce@empresa.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-foreground">Mensagem</label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                    <textarea 
                      id="message"
                      rows={4}
                      className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all resize-none"
                      placeholder="Conte-nos sobre sua necessidade..."
                    ></textarea>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-3 px-6 rounded-md transition-all flex items-center justify-center gap-2"
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




