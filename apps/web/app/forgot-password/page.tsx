"use client"

import React, { useActionState, useState, useEffect, useTransition } from 'react';
import { Bot, ArrowRight, Sun, Moon, Mail, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { resetPasswordRequest } from '../actions/auth';
import Link from 'next/link';

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button              
      type="submit"
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
      {isLoading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          <span>Enviando...</span>
        </>
      ) : (
        <>
          <span>Enviar link de recuperação</span>
          <ArrowRight size={18} />
        </>
      )}
    </Button>
  )
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordRequest, { error: "" })
  const [isPending, startTransition] = useTransition()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))
  }, [theme, resolvedTheme])

  useEffect(() => {
    // Se não há erro e o formulário foi submetido, significa que o email foi enviado
    if (!state?.error && isPending === false && state !== null) {
      setEmailSent(true)
    }
  }, [state, isPending])

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    setTheme(newTheme)
    setIsDark(!isDark)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    try {
      startTransition(() => {
        formAction(formData)
      })
    } finally {
      // O finally garante que qualquer erro síncrono seja tratado
    }
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
            Recupere o acesso à sua conta com segurança.
          </h1>
          <p className="text-slate-200 text-lg leading-relaxed">
            Enviaremos um link seguro para redefinir sua senha. Verifique sua caixa de entrada.
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

          {emailSent ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={24} />
                <div>
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Email enviado!</h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
                  </p>
                </div>
              </div>
              <Link 
                href="/login"
                className="block text-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Recuperar senha</h2>
                <p className="text-slate-500 dark:text-slate-400">
                  Digite seu email e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Email Corporativo
                  </label>
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
                <SubmitButton isLoading={isPending} />
              </form>
              {state?.error && <p className="text-red-500 text-sm mt-2">{state.error}</p>}
              <p className="mt-8 text-center text-sm text-slate-500">
                Lembrou sua senha?{' '}
                <Link href="/login" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Fazer login
                </Link>
              </p>
            </>
          )}
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
