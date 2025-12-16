"use client"

import React, { useActionState, useState, useEffect } from 'react';
import { Bot, ArrowRight, Sun, Moon, Lock, Mail, User, CheckCircle2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { useTheme } from 'next-themes';
import { signup } from '../actions/auth';

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
      <span>{pending ? "Cadastrando..." : "Cadastrar Grátis"}</span>
      {!pending && <ArrowRight size={18} />}
    </button>
  )
}

export default function RegisterPage() {
  const [state, formAction] = useActionState(signup, { error: "" })
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
        <div className="absolute inset-0 bg-slate-900/60 z-10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-900/20 to-slate-50 dark:to-slate-950 z-20"></div>
        <img 
          src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=2674&auto=format&fit=crop" 
          alt="Modern Barber Shop" 
          className="w-full h-full object-cover"
        />
        
        {/* Float Content on Image */}
        <div className="absolute bottom-12 left-12 z-30 max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/30">
              <CheckCircle2 className="text-white" size={20} />
            </div>
            <p className="text-white font-medium text-sm tracking-wide">Junte-se a mais de 2.000 barbearias</p>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Comece a automatizar seu negócio hoje mesmo.
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed">
            Crie sua conta em segundos e experimente o poder da IA na gestão do seu salão. 
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

        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16 overflow-y-auto custom-scrollbar">
          
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8 mt-10 md:mt-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="text-white" size={24} />
            </div>
            <span className="font-bold text-2xl text-slate-800 dark:text-white tracking-tight">
              minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Crie sua conta</h2>
            <p className="text-slate-500 dark:text-slate-400">Preencha os dados abaixo para começar.</p>
          </div>

          <form action={formAction} className="space-y-5">
            
            <div className="space-y-1.5">
              <label htmlFor="full_name" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nome Completo</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input 
                  type="text" 
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  placeholder="Seu nome"
                  id="full_name"
                  name="full_name"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">E-mail</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input 
                  type="email" 
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  placeholder="nome@empresa.com"
                  id="email"
                  name="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Senha</label>
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

            {state?.error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
              </div>
            )}

            <SubmitButton />
          </form>

          <p className="mt-8 text-center text-sm text-slate-500 pb-6 md:pb-0">
            Já tem uma conta?{' '}
            <a 
              href="/login"
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
            >
              Entrar
            </a>
          </p>
        </div>
        
        {/* Footer */}
        <div className="p-6 text-center border-t border-slate-200 dark:border-white/5">
          <p className="text-xs text-slate-400 dark:text-slate-600">
            Ao se registrar, você concorda com nossos <a href="#" className="hover:text-indigo-500">Termos de Uso</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
