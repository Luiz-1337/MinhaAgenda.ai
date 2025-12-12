"use client"

import React, { useState, useEffect } from 'react';
import { Menu, X, Scissors, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDarkMode = mounted && resolvedTheme === 'dark';

  const handleNav = (section: string) => {
    if (section === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsOpen(false);
  };

  const toggleTheme = () => {
    if (!mounted) return;
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md fixed w-full z-50 shadow-sm border-b border-slate-200 dark:border-white/5 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center cursor-pointer" onClick={() => handleNav('home')}>
            <div className="flex-shrink-0 text-indigo-600 dark:text-indigo-400">
              <Scissors className="h-8 w-8" />
            </div>
            <span className="ml-2 text-xl font-bold text-slate-800 dark:text-white tracking-tight">
              minhaagenda<span className="text-indigo-600 dark:text-indigo-400">.ai</span>
            </span>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              <button onClick={() => handleNav('about')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">Sobre</button>
              <button onClick={() => handleNav('services')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">Serviços</button>
              <button onClick={() => handleNav('plans')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium transition-colors">Planos</button>
              
              {/* Theme Toggle */}
              {mounted && (
                <button 
                  onClick={toggleTheme}
                  className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Toggle Dark Mode"
                >
                  {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
              )}

              <Link 
                href="/login"
                className="bg-indigo-600 dark:bg-indigo-600 text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 px-6 py-2 rounded-full text-sm font-bold transition-colors shadow-lg shadow-indigo-600/30"
              >
                Entrar / Painel
              </Link>
            </div>
          </div>

          <div className="-mr-2 flex md:hidden items-center gap-2">
            {mounted && (
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/5">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <button onClick={() => handleNav('about')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 block px-3 py-2 rounded-md text-base font-medium w-full text-left">Sobre</button>
            <button onClick={() => handleNav('services')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 block px-3 py-2 rounded-md text-base font-medium w-full text-left">Serviços</button>
            <button onClick={() => handleNav('plans')} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 block px-3 py-2 rounded-md text-base font-medium w-full text-left">Planos</button>
            <Link 
              href="/login"
              className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 block px-3 py-2 rounded-md text-base font-bold w-full text-left mt-4"
            >
              Entrar no Sistema
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

