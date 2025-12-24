"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Store, User, Mail, Lock, ArrowRight } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"

const accountSchema = z.object({
  salonName: z.string().min(3, "Nome do salão deve ter pelo menos 3 caracteres"),
  fullName: z.string().min(2, "Nome completo deve ter pelo menos 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
})

type AccountFormData = z.infer<typeof accountSchema>

interface StepAccountProps {
  onNext: () => void
}

export function StepAccount({ onNext }: StepAccountProps) {
  const { data, setData } = useOnboardingStore()
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      salonName: data.salonName || "",
      fullName: data.fullName || "",
      email: data.email || "",
      password: "",
    },
  })

  const onSubmit = async (formData: AccountFormData) => {
    setData(formData)
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Crie sua conta</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Preencha os dados abaixo para começar.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="salonName" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nome do Salão <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Store size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="salonName"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="Barbearia do Silva"
              {...register("salonName")}
            />
          </div>
          {errors.salonName && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.salonName.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nome Completo <span className="text-indigo-500">*</span>
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User size={18} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              id="fullName"
              type="text"
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
              placeholder="Seu nome completo"
              {...register("fullName")}
            />
          </div>
          {errors.fullName && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.fullName.message}</p>
          )}
        </div>

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
