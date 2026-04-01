"use client"

import React from 'react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { PLANS } from './constants';
import Link from 'next/link';

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const Pricing: React.FC = () => {
  return (
    <section id="plans" className="py-24 bg-background border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={spring}
          className="mb-14"
        >
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Planos</p>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-foreground max-w-md leading-tight">
              Investimento que se paga{' '}
              <span className="font-display italic font-light">no primeiro dia</span>
            </h2>
            <p className="text-muted-foreground text-sm max-w-xs lg:text-right leading-relaxed">
              Sem fidelidade. Cancele quando quiser.
            </p>
          </div>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto items-start">
          {PLANS.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ ...spring, delay: index * 0.08 }}
              className={`relative flex flex-col rounded-2xl p-6 ${
                plan.highlight
                  ? 'bg-primary text-primary-foreground ring-1 ring-primary/20 shadow-xl md:scale-[1.03] z-10'
                  : 'bg-card border border-border shadow-sm'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">
                  Mais Popular
                </div>
              )}

              <div className="mb-5">
                <h3 className={`text-lg font-bold tracking-tight ${plan.highlight ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {plan.name}
                </h3>
                <p className={`text-xs mt-1 leading-relaxed ${plan.highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className={`text-5xl font-bold tracking-tighter ${plan.highlight ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {plan.price}
                  </span>
                  {plan.price !== 'Sob Consulta' && (
                    <span className={`text-sm font-medium ${plan.highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      /mês
                    </span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 flex-1 mb-6">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-2.5">
                    <Check className={`h-4 w-4 shrink-0 mt-0.5 ${plan.highlight ? 'text-primary-foreground/80' : 'text-primary'}`} />
                    <span className={`text-sm leading-snug ${plan.highlight ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link href={`/register?plan=${plan.name}`}>
                <button
                  className={`w-full py-2.5 px-5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  }`}
                >
                  {plan.buttonText}
                </button>
              </Link>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};

export default Pricing;
