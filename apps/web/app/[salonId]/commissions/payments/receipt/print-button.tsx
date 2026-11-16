"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Abre a impressão do navegador. O CSS da página deixa só os recibos no papel. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={16} />
      Imprimir
    </Button>
  )
}
