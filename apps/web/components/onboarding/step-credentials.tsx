"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Mail, Lock, ArrowRight } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"

const credentialsSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string().min(6, "Confirmação de senha inválida"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

type CredentialsFormData = z.infer<typeof credentialsSchema>

interface StepCredentialsProps {
  onNext: () => void
}

export function StepCredentials({ onNext }: StepCredentialsProps) {
  const { data, setData } = useOnboardingStore()
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      email: data.email || "",
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (formData: CredentialsFormData) => {
    // Salvar apenas email e senha no store
    setData({
      email: formData.email,
      password: formData.password,
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Crie sua conta</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Informe seu e-mail e crie uma senha para começar.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            E-mail <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="email"
              type="email"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="nome@empresa.com"
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Senha <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="password"
              type="password"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="••••••••"
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Confirmar Senha <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="confirmPassword"
              type="password"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="••••••••"
              {...register("confirmPassword")}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <span>{isSubmitting ? "Processando..." : "Continuar"}</span>
          {!isSubmitting && <ArrowRight size={18} />}
        </button>
      </form>
    </div>
  )
}

