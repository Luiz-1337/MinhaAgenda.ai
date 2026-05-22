export interface KanbanColumnDTO {
  id: string
  salonId: string
  name: string
  color: string
  position: number
  isDefault: boolean
  isSystem: boolean
}

export interface KanbanChatCard {
  id: string
  customer: { name: string; phone: string }
  preview: string
  lastMessageAt: string
  isManual: boolean
  status: "Ativo" | "Finalizado" | "Aguardando humano"
  kanbanColumnId: string | null
  kanbanPosition: number | null
}

export interface KanbanBoardDTO {
  columns: KanbanColumnDTO[]
  chatsByColumnId: Record<string, KanbanChatCard[]>
}
