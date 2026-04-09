"use client"

import React, { useState } from 'react';
import { Bot, ArrowRight, Mail, User, MessageSquare, Building2, CheckCircle2, Phone, Users, Loader2, CheckCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { sendContactEmail } from '../actions/contact';

export default function ContactPage() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const isEnterprise = reason === 'enterprise_plan'

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    const form = e.currentTarget
    const formData = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      company: (form.elements.namedItem("company") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      phone: (form.elements.namedItem("phone") as HTMLInputElement).value,
      hairdressers: (form.elements.namedItem("hairdressers") as HTMLInputElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
    }

    try {
      const result = await sendContactEmail(formData)
      if ("error" in result) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    } catch {
      setError("Erro inesperado. Tente novamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all text-foreground placeholder:text-muted-foreground"

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
              {success ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mb-6">
                    <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">Mensagem enviada!</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Recebemos sua mensagem e entraremos em contato em breve. Obrigado pelo interesse!
                  </p>
                  <button
                    onClick={() => setSuccess(false)}
                    className="mt-6 px-6 py-2.5 rounded-md text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
                  >
                    Enviar outra mensagem
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium text-foreground">Nome *</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          className={inputClass}
                          placeholder="Seu nome"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="company" className="text-sm font-medium text-foreground">Empresa / Salão</label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <input
                          type="text"
                          id="company"
                          name="company"
                          className={inputClass}
                          placeholder="Nome do Salão/Rede"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-foreground">E-mail *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <input
                          type="email"
                          id="email"
                          name="email"
                          required
                          className={inputClass}
                          placeholder="voce@empresa.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium text-foreground">Telefone</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          className={inputClass}
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="hairdressers" className="text-sm font-medium text-foreground">Quantos profissionais no salão?</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <input
                        type="number"
                        id="hairdressers"
                        name="hairdressers"
                        min="1"
                        className={inputClass}
                        placeholder="Ex: 5"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-medium text-foreground">Mensagem *</label>
                    <div className="relative">
                      <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                      <textarea
                        id="message"
                        name="message"
                        rows={4}
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-all resize-none text-foreground placeholder:text-muted-foreground"
                        placeholder="Conte-nos sobre sua necessidade..."
                      ></textarea>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950 border border-rose-700/20 dark:border-rose-300/20 rounded-md">
                      <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold py-3 px-6 rounded-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Enviar Mensagem
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
