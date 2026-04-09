"use client"

import React, { useActionState, useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { Bot, ArrowRight, Sun, Moon, Lock, Mail, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { login } from '../actions/auth';
import { useSearchParams } from 'next/navigation';

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button
    type="submit"
    disabled={isLoading}
    className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
    {isLoading ? (
      <>
        <Loader2 size={18} className="animate-spin" />
        <span>Entrando...</span>
      </>
    ) : (
      <>
        <span>Login</span>
        <ArrowRight size={18} />
      </>
    )}
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, { error: "" })
  const [isPending, startTransition] = useTransition()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const searchParams = useSearchParams()
  const passwordResetSuccess = searchParams.get('passwordReset') === 'success'

  useEffect(() => {
    setMounted(true)
    setIsDark(resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))
  }, [theme, resolvedTheme])

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
      // O isPending do useTransition já gerencia o estado de loading automaticamente
    }
  }

  return (
    <div className="w-screen h-screen flex overflow-hidden bg-background transition-colors duration-300">
      
      {/* Left Side - Image (2/3) */}
      <div className="w-2/3 h-full relative hidden md:block">
        <div className="absolute inset-0 bg-black/40 z-10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-background z-20"></div>
        <Image
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=2574&auto=format&fit=crop"
          alt="Luxury Salon"
          fill
          className="object-cover"
          priority
        />
        
        {/* Float Content on Image */}
        <div className="absolute bottom-12 left-12 z-30 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white text-xs font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Disponível 24/7
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Revolucione a gestão do seu salão com Inteligência Artificial.
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            Agendamentos automáticos, atendimento humanizado e insights financeiros em tempo real. O futuro da beleza é agora.
          </p>
        </div>
      </div>

      {/* Right Side - Form (1/3) */}
      <div className="w-full md:w-1/3 h-full flex flex-col relative bg-background border-l border-border z-30">
        
        {/* Top Controls */}
        <div className="absolute top-6 right-6 z-40">
          {mounted && (
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full bg-border text-muted-foreground hover:text-accent transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-16">
          
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center">
              <Bot className="text-accent-foreground" size={24} />
            </div>
            <span className="font-bold text-2xl text-foreground tracking-tight">
              minha<span className="text-accent">agenda</span>.ai
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">Bem-vindo de volta</h2>
            <p className="text-muted-foreground">Digite suas credenciais para acessar o painel.</p>
          </div>

          {passwordResetSuccess && (
            <div className="mb-6 flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-700/20 dark:border-emerald-300/20 rounded-md">
              <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={20} />
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Senha redefinida com sucesso! Faça login com sua nova senha.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Corporativo</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
                </div>
                <input 
                  type="email" 
                  className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                  placeholder="nome@empresa.com"
                  id="email" name="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Senha</label>
                <a href="/forgot-password" className="text-xs font-medium text-accent hover:text-accent/80">Esqueceu?</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`w-full pl-10 pr-10 py-3 bg-card border rounded-md text-foreground focus:outline-none focus:ring-2 transition-all ${
                    state?.error
                      ? 'border-rose-600 dark:border-rose-400 focus:ring-rose-600/20 focus:border-rose-600'
                      : 'border-border focus:ring-ring focus:border-ring'
                  }`}
                  placeholder="••••••••"
                  id="password"
                  name="password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <SubmitButton isLoading={isPending} />
          </form>
          
          {state?.error && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-700/20 dark:border-rose-300/20 rounded-md animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                {state.error}
              </p>
            </div>
          )}
          
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Não tem uma conta?{' '}
            <a href="/register" className="font-semibold text-accent hover:underline">
              Cadastre-se
            </a>
          </p>
        </div>
        
        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; 2025 MinhaAgenda AI. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}