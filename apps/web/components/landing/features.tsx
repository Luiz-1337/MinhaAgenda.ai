"use client"

import React from 'react';
import { motion } from 'framer-motion';
import { FEATURES } from './constants';

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const Features: React.FC = () => {
  return (
    <section id="services" className="py-24 bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={spring}
          className="mb-14"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">
            Serviços
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-foreground max-w-lg leading-tight">
              Mais que uma agenda,{' '}
              <em className="font-display not-italic italic font-light">um gerente completo</em>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs lg:text-right">
              IA generativa que entende o contexto do seu negócio e age como seu melhor funcionário.
            </p>
          </div>
        </motion.div>

        {/* Feature list */}
        <div className="rounded-md border border-border bg-card overflow-hidden divide-y divide-border">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-20px' }}
                transition={{ ...spring, delay: index * 0.05 }}
                className="group flex items-center gap-5 px-6 py-5 hover:bg-muted/40 transition-colors cursor-default"
              >
                {/* Index */}
                <span className="w-8 text-xs font-mono text-muted-foreground/40 shrink-0 select-none tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>

                {/* Icon */}
                <div className="shrink-0 w-10 h-10 rounded-md bg-accent/10 dark:bg-accent/15 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Icon className="w-5 h-5 text-accent" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                    {feature.description}
                  </p>
                </div>

                {/* Arrow */}
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
                  <ArrowRight />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// Inline arrow to avoid extra import
function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default Features;
