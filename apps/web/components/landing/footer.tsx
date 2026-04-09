import React from 'react';
import { Instagram, Facebook, Twitter } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-background border-t border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">

        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-10 mb-12">

          {/* Brand */}
          <div className="space-y-4">
            <p className="text-base font-bold tracking-tight text-foreground">
              minhaagenda<span className="text-accent">.ai</span>
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Revolucionando a gestão de salões de beleza com inteligência artificial generativa.
            </p>
            <div className="flex gap-3">
              {[
                { Icon: Instagram, label: 'Instagram' },
                { Icon: Facebook, label: 'Facebook' },
                { Icon: Twitter, label: 'Twitter' },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Produto */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Produto</p>
            <ul className="space-y-2.5">
              {['Funcionalidades', 'Integrações', 'Preços', 'Updates'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Suporte</p>
            <ul className="space-y-2.5">
              {['Central de Ajuda', 'API Docs', 'Comunidade', 'Status'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Legal</p>
            <ul className="space-y-2.5">
              {['Privacidade', 'Termos'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="pt-8 border-t border-border/60 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-muted-foreground">
            &copy; 2025 minhaagenda.ai. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground">
            Feito com IA para o Brasil
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
