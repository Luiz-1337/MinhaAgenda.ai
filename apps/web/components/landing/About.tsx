import React from 'react';

const About: React.FC = () => {
  return (
    <section id="about" className="py-20 bg-indigo-600 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Background patterns */}
        <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>

        <div className="relative z-10 lg:flex lg:items-center gap-16">
          <div className="lg:w-1/2 mb-10 lg:mb-0">
            <h2 className="text-base text-indigo-200 font-semibold tracking-wide uppercase">Sobre a IA</h2>
            <h3 className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Não é apenas um chatbot. <br />É o seu concierge digital.
            </h3>
            <p className="mt-4 text-lg text-indigo-100 leading-relaxed">
              Desenvolvemos o <strong>minhaagenda.ai</strong> pensando na dor real dos profissionais da beleza: perder tempo gerenciando agenda ao invés de cuidar dos clientes.
            </p>
            <p className="mt-4 text-lg text-indigo-100 leading-relaxed">
              Nossa IA aprende o estilo do seu salão, entende os tempos de cada procedimento e trata seu cliente com a cordialidade que ele merece, garantindo que nenhuma oportunidade de negócio seja perdida.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
               <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
                 <p className="text-3xl font-bold text-white">24/7</p>
                 <p className="text-indigo-200 text-sm">Atendimento ininterrupto</p>
               </div>
               <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
                 <p className="text-3xl font-bold text-white">+30%</p>
                 <p className="text-indigo-200 text-sm">Aumento no faturamento</p>
               </div>
            </div>
          </div>
          <div className="lg:w-1/2">
            <img 
              src="https://images.unsplash.com/photo-1560066984-138dadb4c035?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" 
              alt="Salão de beleza moderno" 
              className="rounded-2xl shadow-2xl border-4 border-white/10 rotate-2 hover:rotate-0 transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;

