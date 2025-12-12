"use client"

import React, { useActionState, useState, useEffect } from 'react';
import { Bot, ArrowRight, Sun, Moon, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormStatus } from 'react-dom';
import { useTheme } from 'next-themes';
import { login } from '../actions/auth';

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button              
    type="submit"
    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
    <span>Login</span>
    <ArrowRight size={18} />
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, { error: "" })
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))
  }, [theme, resolvedTheme])

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    setTheme(newTheme)
    setIsDark(!isDark)
  }

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Left Side - Image (2/3) */}
      <div className="w-2/3 h-full relative hidden md:block">
        <div className="absolute inset-0 bg-slate-900/40 z-10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-slate-50 dark:to-slate-950 z-20"></div>
        <img 
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2574&auto=format&fit=crop" 
          alt="Luxury Salon" 
          className="w-full h-full object-cover"
        />
        
        {/* Float Content on Image */}
        <div className="absolute bottom-12 left-12 z-30 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-white text-xs font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Disponível 24/7
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Revolucione a gestão do seu salão com Inteligência Artificial.
          </h1>
          <p className="text-slate-200 text-lg leading-relaxed">
            Agendamentos automáticos, atendimento humanizado e insights financeiros em tempo real. O futuro da beleza é agora.
          </p>
        </div>
      </div>

      {/* Right Side - Form (1/3) */}
      <div className="w-full md:w-1/3 h-full flex flex-col relative bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-white/5 shadow-2xl z-30">
        
        {/* Top Controls */}
        <div className="absolute top-6 right-6 z-40">
          {mounted && (
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16">
          
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="text-white" size={24} />
            </div>
            <span className="font-bold text-2xl text-slate-800 dark:text-white tracking-tight">
              minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Bem-vindo de volta</h2>
            <p className="text-slate-500 dark:text-slate-400">Digite suas credenciais para acessar o painel.</p>
          </div>

          <form action={formAction} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Corporativo</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input 
                  type="email" 
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  placeholder="nome@empresa.com"
                  id="email" name="email" 
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Senha</label>
                <a href="#" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">Esqueceu?</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input 
                  type="password" 
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  placeholder="••••••••"
                  id="password" 
                  name="password"
                  required
                />
              </div>
            </div>
            <SubmitButton />
          </form>
          {state?.error && <p className="text-red-500 text-sm">{state.error}</p>}
          <p className="mt-8 text-center text-sm text-slate-500">
            Não tem uma conta?{' '}
            <a href="/register" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              Cadastre-se
            </a>
          </p>
        </div>
        
        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            &copy; 2025 MinhaAgenda AI. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}