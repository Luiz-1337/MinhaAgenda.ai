import React from 'react';
import { FEATURES } from './constants';

const Features: React.FC = () => {
  return (
    <section id="services" className="py-20 bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-base text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase">Serviços</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Mais que uma agenda, um gerente completo
          </p>
          <p className="mt-4 max-w-2xl text-xl text-slate-500 dark:text-slate-400 mx-auto">
            A tecnologia Gemini impulsiona nossa IA para entender o contexto do seu negócio e agir como seu melhor funcionário.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="relative p-8 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl hover:shadow-xl transition-all duration-300 group">
                <div className="absolute top-8 right-8 text-slate-200 dark:text-white/5 group-hover:text-indigo-100 dark:group-hover:text-indigo-900/20 transition-colors">
                  <Icon className="h-16 w-16" />
                </div>
                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center p-3 bg-indigo-600 dark:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20 mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{feature.title}</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;

