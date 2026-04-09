"use client"

import React, { useState, useEffect } from 'react';
import { Menu, X, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isDarkMode = mounted && resolvedTheme === 'dark';

  const handleNav = (section: string) => {
    if (section === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsOpen(false);
      return;
    }
    const element = document.getElementById(section);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
    setIsOpen(false);
  };

  const toggleTheme = () => {
    if (!mounted) return;
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-background border-b border-border/60 shadow-sm' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <button
            onClick={() => handleNav('home')}
            className="flex items-center gap-1.5 group"
          >
            <span className="text-lg font-bold tracking-tight text-foreground group-hover:text-foreground/80 transition-colors">
              minhaagenda<span className="text-accent">.ai</span>
            </span>
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { key: 'about', label: 'Sobre' },
              { key: 'services', label: 'Serviços' },
              { key: 'plans', label: 'Planos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleNav(key)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground tracking-tight transition-colors"
              >
                {label}
              </button>
            ))}

            {mounted && (
              <button
                onClick={toggleTheme}
                className="p-2 ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Toggle theme"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}

            <Link
              href="/login"
              className="ml-3 px-5 py-2 rounded-md text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
            >
              Entrar
            </Link>
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center gap-1">
            {mounted && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden bg-background border-t border-border">
          <div className="px-6 py-4 space-y-1">
            {[
              { key: 'about', label: 'Sobre' },
              { key: 'services', label: 'Serviços' },
              { key: 'plans', label: 'Planos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleNav(key)}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                {label}
              </button>
            ))}
            <div className="pt-2">
              <Link
                href="/login"
                className="block w-full text-center px-4 py-2.5 rounded-md text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
              >
                Entrar no Sistema
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
