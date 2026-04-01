"use client"

import React from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const Hero: React.FC = () => {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden bg-background">

      {/* Depth: soft radial glows — light and dark mode */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 20% 50%, hsl(221 70% 48% / 0.08) 0%, transparent 70%), ' +
            'radial-gradient(ellipse 50% 50% at 85% 20%, hsl(25 75% 52% / 0.06) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-8 pt-28 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-14 lg:gap-20 items-center">

          {/* ─── Left column: copy ─── */}
          <div className="space-y-8">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0 }}
            >
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground">
                <Zap className="w-3 h-3 text-primary" />
                IA #1 para Beauty Business no Brasil
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.08 }}
              className="space-y-3"
            >
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.92] text-foreground">
                Seu salão{' '}
                <em className="font-display not-italic italic font-light text-primary">
                  agendando sozinho
                </em>
                {' '}enquanto você trabalha.
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md">
                O <strong className="font-semibold text-foreground">minhaagenda.ai</strong>{' '}
                responde clientes, agenda horários e vende produtos 24h por dia — WhatsApp e Instagram.
              </p>
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.16 }}
              className="flex flex-wrap gap-3"
            >
              <button
                onClick={() => scrollTo('plans')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => scrollTo('about')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
              >
                Ver como funciona
              </button>
            </motion.div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...spring, delay: 0.24 }}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <div className="flex -space-x-1.5">
                {['A', 'B', 'C'].map((l, i) => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground"
                  >
                    {l}
                  </div>
                ))}
              </div>
              <span>Usado por +500 salões no Brasil</span>
            </motion.div>
          </div>

          {/* ─── Right column: mockup ─── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
            className="flex flex-col gap-3"
          >
            {/* Chat card */}
            <div className="rounded-2xl border border-border bg-card shadow-xl shadow-black/[0.08] dark:shadow-black/40 overflow-hidden">

              {/* Window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="ml-3 text-[11px] text-muted-foreground font-mono">
                  minhaagenda.ai — chat ativo
                </span>
              </div>

              {/* Messages */}
              <div className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-bold">
                    AI
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-foreground max-w-[80%] leading-relaxed">
                    Olá, Mariana! Faz 30 dias do seu último corte. Que tal uma hidratação quinta às 14h?
                  </div>
                </div>

                <div className="flex items-start gap-3 flex-row-reverse">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                    M
                  </div>
                  <div className="bg-primary rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-primary-foreground max-w-[80%] leading-relaxed">
                    Nossa, eu estava pensando nisso agora! Pode marcar sim.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[10px] font-bold">
                    AI
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-foreground max-w-[80%] leading-relaxed">
                    Perfeito! Quinta, 14h confirmado. Também separei o óleo reparador que você gosta. Deixo reservado?
                  </div>
                </div>

                {/* Input area */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-9 rounded-xl border border-border bg-background px-3 flex items-center">
                    <span className="text-xs text-muted-foreground/50">Responder...</span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                    <ArrowRight className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row — BELOW the card, not overlapping */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: '+12', label: 'Agendamentos hoje', trend: '+23%' },
                { value: '98%', label: 'Satisfação' },
                { value: '24/7', label: 'Online sempre' },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card px-3 py-3 text-center"
                >
                  <p className="text-lg font-bold tracking-tight text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stat.label}</p>
                  {stat.trend && (
                    <p className="text-[10px] text-green-500 font-medium mt-0.5">{stat.trend}</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default Hero;
