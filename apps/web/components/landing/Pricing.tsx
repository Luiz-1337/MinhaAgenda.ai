import React from 'react';
import { Check } from 'lucide-react';
import { PLANS } from './constants';
import Link from 'next/link';

const Pricing: React.FC = () => {
  return (
    <section id="plans" className="py-20 bg-slate-50 dark:bg-slate-900/20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-base text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase">Planos</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Investimento que se paga no primeiro dia
          </p>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            Escolha o plano ideal para o tamanho do seu sonho. Sem fidelidade, cancele quando quiser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan, index) => (
            <div 
              key={index} 
              className={`relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl transition-colors duration-300 ${plan.highlight ? 'ring-4 ring-indigo-600 dark:ring-indigo-500 shadow-2xl scale-105 z-10' : 'border border-slate-200 dark:border-white/5 shadow-lg' } p-8`}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wide shadow-md">
                  Mais Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm h-10">{plan.description}</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                {plan.price !== "Sob Consulta" && <span className="text-slate-500 dark:text-slate-400 font-medium">/mês</span>}
              </div>
              <ul className="mb-8 space-y-4 flex-1">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/register?plan=${plan.name}`}>
              <button className={`w-full py-3 px-6 rounded-xl font-bold transition-colors ${
                plan.highlight 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-lg shadow-indigo-600/30' 
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
              }`}>
                {plan.buttonText}
              </button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;

