"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepperProps {
  currentStep: number
  steps: { label: string; description?: string }[]
}

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1
          const isCompleted = stepNumber < currentStep
          const isCurrent = stepNumber === currentStep
          const isPending = stepNumber > currentStep

          return (
            <div key={stepNumber} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm",
                    isCompleted && "bg-indigo-600 border-indigo-600 text-white shadow-indigo-500/20",
                    isCurrent && "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-indigo-500/10",
                    isPending && "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400"
                  )}
                >
                  {isCompleted ? (
                    <Check size={20} />
                  ) : (
                    <span className="font-semibold text-sm">{stepNumber}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      "text-xs font-semibold",
                      isCurrent && "text-indigo-600 dark:text-indigo-400",
                      isCompleted && "text-slate-600 dark:text-slate-400",
                      isPending && "text-slate-400 dark:text-slate-600"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors",
                    isCompleted ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
