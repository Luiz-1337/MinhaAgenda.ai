"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Bot, ArrowRight, Sun, Moon, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button
      type="submit"
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
      {isLoading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          <span>Redefinindo...</span>
        </>
      ) : (
        <>
          <span>Redefinir senha</span>
          <ArrowRight size={18} />
        </>
      )}
    </Button>
  )
}

export default function ResetPasswordPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()

  // Estados do fluxo de recuperação
  const [checking, setChecking] = useState(true)   // validando o link/sessão
  const [ready, setReady] = useState(false)         // sessão de recuperação ativa → mostra form
  const [linkError, setLinkError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const resolvedRef = useRef(false)

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  useEffect(() => {
    setMounted(true)
    setIsDark(resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))
  }, [theme, resolvedTheme])

  useEffect(() => {
    const resolveReady = () => {
      resolvedRef.current = true
      setReady(true)
      setChecking(false)
    }

    // 1. Erro vindo no hash (#error=...) ou na query (?error=...) do link do Supabase.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(window.location.search)
    const errorCode = hashParams.get('error_code') || queryParams.get('error_code')
    const hasError =
      errorCode || hashParams.get('error') || queryParams.get('error')

    if (hasError) {
      resolvedRef.current = true
      const desc = hashParams.get('error_description') || queryParams.get('error_description')
      setLinkError(
        errorCode === 'otp_expired'
          ? 'O link de recuperação expirou ou já foi usado. Solicite um novo abaixo.'
          : desc
            ? decodeURIComponent(desc.replace(/\+/g, ' '))
            : 'Link inválido ou expirado. Solicite um novo abaixo.'
      )
      setChecking(false)
      return
    }

    // 2. O client (@supabase/ssr) processa o token da URL automaticamente e
    //    emite PASSWORD_RECOVERY quando a sessão de recuperação é estabelecida.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) resolveReady()
    })

    // 3. Cobre o caso da sessão já existir no momento do mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) resolveReady()
    })

    // 4. Se em alguns segundos nada resolveu, tratamos como link inválido.
    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        setLinkError('Link inválido ou expirado. Solicite um novo abaixo.')
        setChecking(false)
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    setTheme(newTheme)
    setIsDark(!isDark)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    const formData = new FormData(e.currentTarget)
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirmPassword') || '')

    if (password.length < 6) {
      setFormError('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setFormError('As senhas não coincidem.')
      return
    }

    setIsLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsLoading(false)

    if (error) {
      setFormError(error.message || 'Erro ao redefinir a senha. Solicite um novo link.')
      return
    }

    router.push('/login?passwordReset=success')
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
            Segurança em primeiro lugar
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Defina uma nova senha segura.
          </h1>
          <p className="text-white/80 text-lg leading-relaxed">
            Escolha uma senha forte para proteger sua conta. Use pelo menos 6 caracteres.
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

          {checking ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <span>Validando link de recuperação...</span>
            </div>
          ) : linkError ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-700/20 dark:border-red-300/20 rounded-md">
                <AlertCircle className="shrink-0 text-red-600 dark:text-red-400 mt-0.5" size={22} />
                <div>
                  <h3 className="font-semibold text-red-900 dark:text-red-100">Link inválido</h3>
                  <p className="text-sm">{linkError}</p>
                </div>
              </div>
              <Link
                href="/forgot-password"
                className="block w-full text-center bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 px-4 rounded-md transition-all"
              >
                Solicitar novo link
              </Link>
              <Link href="/login" className="block text-center text-sm text-accent hover:underline">
                Voltar para o login
              </Link>
            </div>
          ) : ready ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">Redefinir senha</h2>
                <p className="text-muted-foreground">
                  Digite sua nova senha abaixo.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Nova Senha
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full pl-10 pr-10 py-3 bg-card border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                      placeholder="••••••••"
                      id="password"
                      name="password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Confirmar Senha
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock size={18} className="text-muted-foreground group-focus-within:text-accent transition-colors" />
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className="w-full pl-10 pr-10 py-3 bg-card border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                      placeholder="••••••••"
                      id="confirmPassword"
                      name="confirmPassword"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <SubmitButton isLoading={isLoading} />
              </form>
              {formError && <p className="text-red-500 text-sm mt-2">{formError}</p>}
              <p className="mt-8 text-center text-sm text-muted-foreground">
                Lembrou sua senha?{' '}
                <Link href="/login" className="font-semibold text-accent hover:underline">
                  Fazer login
                </Link>
              </p>
            </>
          ) : null}
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
