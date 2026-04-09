"use client"

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const stats = [
  { value: '24/7', label: 'Atendimento ininterrupto' },
  { value: '+30%', label: 'Faturamento médio' },
  { value: '+500', label: 'Salões ativos' },
  { value: '< 1s', label: 'Tempo de resposta' },
];

const About: React.FC = () => {
  return (
    <section
      id="about"
      className="relative py-24 bg-foreground dark:bg-muted overflow-hidden"
    >
      {/* Subtle glow behind content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 80% 50%, hsl(221 70% 58% / 0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">

          {/* Left: text + stats */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={spring}
            className="space-y-8"
          >
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                Sobre a IA
              </p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight text-background dark:text-foreground">
                Não é apenas um chatbot.{' '}
                <em className="font-display not-italic italic font-light">
                  É o seu concierge digital.
                </em>
              </h2>
              <p className="text-background/70 dark:text-muted-foreground leading-relaxed max-w-lg">
                Desenvolvemos o{' '}
                <strong className="font-semibold text-background dark:text-foreground">
                  minhaagenda.ai
                </strong>{' '}
                pensando na dor real dos profissionais da beleza: perder tempo gerenciando agenda ao
                invés de cuidar dos clientes.
              </p>
              <p className="text-background/70 dark:text-muted-foreground leading-relaxed max-w-lg">
                Nossa IA aprende o estilo do seu salão, entende os tempos de cada procedimento e
                trata seu cliente com a cordialidade que ele merece — garantindo que nenhuma
                oportunidade seja perdida.
              </p>
            </div>

            {/* Stats — 2×2 grid, contained within the column */}
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...spring, delay: i * 0.06 }}
                  className="rounded-md border border-background/15 dark:border-border bg-background/8 dark:bg-card px-4 py-4"
                >
                  <p className="text-3xl font-bold tracking-tighter text-background dark:text-foreground">
                    {stat.value}
                  </p>
                  <p className="text-xs text-background/60 dark:text-muted-foreground mt-1">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: image — no floating overlays or badges */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ ...spring, delay: 0.12 }}
          >
            <div className="relative rounded-md overflow-hidden border border-background/10 dark:border-border aspect-[4/5]">
              <Image
                src="https://images.unsplash.com/photo-1560066984-138dadb4c035?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
                alt="Salão de beleza moderno"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 45vw"
              />
              {/* Gradient overlay from bottom for legibility, no heavy filter */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default About;
