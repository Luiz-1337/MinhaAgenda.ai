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
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                    isCompleted && "bg-accent border-accent text-accent-foreground",
                    isCurrent && "bg-accent/10 border-accent text-accent",
                    isPending && "bg-muted border-border text-muted-foreground"
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
                      isCurrent && "text-accent",
                      isCompleted && "text-muted-foreground",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  {step.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
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
                    isCompleted ? "bg-accent" : "bg-border"
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
