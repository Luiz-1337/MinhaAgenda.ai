"use client"

import React from 'react';
import { ArrowRight, Star } from 'lucide-react';

const Hero: React.FC = () => {
  const handleCtaClick = () => {
    const element = document.getElementById('plans');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative pt-32 pb-16 sm:pt-40 sm:pb-24 overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center">
        
        <div className="w-full md:w-1/2 text-left z-10">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase mb-6 border border-indigo-100 dark:border-indigo-500/20">
            <Star className="w-3 h-3 mr-1 fill-current" />
            A IA #1 para Beauty Business
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-6">
            Seu salão <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">agendando sozinho</span> enquanto você trabalha.
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-lg leading-relaxed">
            O <strong>minhaagenda.ai</strong> é o agente inteligente que responde clientes, agenda horários e vende produtos 24 horas por dia no WhatsApp e Instagram.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={handleCtaClick}
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 md:text-lg shadow-lg shadow-indigo-600/30 transition-all transform hover:-translate-y-1"
            >
              Começar Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
            <button className="inline-flex items-center justify-center px-8 py-3 border border-slate-200 dark:border-white/5 text-base font-medium rounded-full text-slate-700 dark:text-slate-200 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 md:text-lg transition-all">
              Ver Demonstração
            </button>
          </div>
          
          <div className="mt-10 flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <div className="flex -space-x-2">
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold">1</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400 text-xs font-bold">2</div>
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 bg-pink-100 dark:bg-pink-900 flex items-center justify-center text-pink-600 dark:text-pink-400 text-xs font-bold">3</div>
            </div>
            <p>Usado por +500 salões no Brasil</p>
          </div>
        </div>

        <div className="w-full md:w-1/2 mt-12 md:mt-0 relative">
           {/* Decorative blob */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-purple-200 dark:bg-purple-900/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-indigo-200 dark:bg-indigo-900/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
          
          <div className="relative rounded-2xl shadow-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 overflow-hidden transform rotate-1 hover:rotate-0 transition-transform duration-500">
             {/* Simulated Chat Interface Image or Component */}
             <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <div className="ml-4 text-xs text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded">minhaagenda.ai - chat ativo</div>
             </div>
             <div className="p-6 space-y-4 bg-white dark:bg-slate-900">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold">AI</div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none text-sm text-slate-700 dark:text-slate-200 max-w-[80%]">
                    Olá, Mariana! Vi que já faz 30 dias do seu último corte. Que tal agendar uma hidratação para essa quinta às 14h? 💇‍♀️
                  </div>
                </div>
                <div className="flex items-start gap-3 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 text-xs font-bold">M</div>
                  <div className="bg-indigo-600 p-3 rounded-2xl rounded-tr-none text-sm text-white max-w-[80%]">
                    Nossa, eu estava pensando nisso agora! Pode marcar sim.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold">AI</div>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none text-sm text-slate-700 dark:text-slate-200 max-w-[80%]">
                    Perfeito! Agendado para Quinta, 14h. Também separei aquele óleo reparador que você gosta. Deixo reservado? ✨
                  </div>
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Hero;

