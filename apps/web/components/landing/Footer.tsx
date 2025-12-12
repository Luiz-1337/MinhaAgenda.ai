import React from 'react';
import { Scissors, Instagram, Facebook, Twitter } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800 dark:border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center text-white mb-4">
              <Scissors className="h-6 w-6 text-indigo-500" />
              <span className="ml-2 text-xl font-bold">minhaagenda.ai</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Revolucionando a gestão de salões de beleza com inteligência artificial generativa.
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 uppercase text-sm tracking-wider">Produto</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Funcionalidades</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Integrações</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Preços</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Updates</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 uppercase text-sm tracking-wider">Suporte</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Central de Ajuda</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">API Docs</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Comunidade</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Status</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 uppercase text-sm tracking-wider">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Privacidade</a></li>
              <li><a href="#" className="hover:text-indigo-400 transition-colors">Termos</a></li>
            </ul>
            <div className="flex space-x-4 mt-6">
              <a href="#" className="text-slate-400 hover:text-white transition-colors"><Instagram className="h-5 w-5" /></a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors"><Facebook className="h-5 w-5" /></a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors"><Twitter className="h-5 w-5" /></a>
            </div>
          </div>

        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 dark:border-white/5 text-center text-xs text-slate-500">
          &copy; 2025 minhaagenda.ai. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;

