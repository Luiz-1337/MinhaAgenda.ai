"use client"

import SoloDashboardContent from "./solo-dashboard-content"
import ProDashboardContent from "./pro-dashboard-content"
import type { DashboardStats } from "@/app/actions/dashboard"

interface DashboardContentProps {
  stats: DashboardStats
  salonId: string
}

export default function DashboardContent({ stats, salonId }: DashboardContentProps) {
  if (stats.planTier === "SOLO") {
    return <SoloDashboardContent stats={stats} salonId={salonId} />
  }
  return <ProDashboardContent stats={stats} />
}

