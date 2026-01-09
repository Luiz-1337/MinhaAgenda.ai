export type SystemPromptTemplateRow = {
  id: string
  salonId: string | null
  name: string
  description: string | null
  systemPrompt: string
  category: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type SystemPromptTemplateFormData = {
  name: string
  description?: string
  systemPrompt: string
  category?: string
  isActive: boolean
  isGlobal?: boolean // Para controle no formulário (se é template global)
}

