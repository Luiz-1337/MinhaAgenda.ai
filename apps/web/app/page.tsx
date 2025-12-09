import DashboardLayout from "./dashboard/layout"
import DashboardHomePage from "./dashboard/page"

export default async function Home() {
  return (
    <DashboardLayout>
      <DashboardHomePage />
    </DashboardLayout>
  )
}
