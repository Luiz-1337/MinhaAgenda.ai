import dotenv from "dotenv"
import { MinhaAgendaAITools } from "../packages/mcp-server/src/MinhaAgendaAI_tools"
import { getSalonIdByWhatsapp } from "./mcp-chat-utils"

dotenv.config()

async function main() {
  const impl = new MinhaAgendaAITools()

  const salonId = "0bf1611a-3f91-4ba9-b57b-1cc4b2be94f4"
  const professionalId = "23752648-2d95-42a5-91e4-00fa7f455a3a"
  const serviceId = "5ce029e0-f8c4-4eeb-9990-d4f0c56eb400"
  const serviceDuration = 60
  const phone = "+5511983221100"

  console.log("Starting test...\n")
  console.log("--------------------------------\n")

  const checkAvailability = await impl.checkAvailability(salonId!, "2026-05-01T14:00:00", professionalId, serviceId, serviceDuration)

  console.log(checkAvailability)

  console.log("--------------------------------\n")

  const createAppointment = await impl.createAppointment(salonId!, professionalId, phone, serviceId, "2026-05-01T14:00:00", "Teste de agendamento")

  console.log(createAppointment)

  console.log("--------------------------------\n")

  const { appointmentId } = JSON.parse(createAppointment);

  console.log("appointmentId:")
  console.log(appointmentId)

  console.log("--------------------------------\n")

  const updateAppointment = await impl.updateAppointment(appointmentId, professionalId, serviceId, "2026-06-01T14:00:00", "Teste de agendamento atualizado")

  console.log(updateAppointment)

  console.log("--------------------------------\n")

  const createAppointment2 = await impl.createAppointment(salonId!, professionalId, phone, serviceId, "2026-07-01T14:00:00", "Teste de agendamento 2")

  console.log(createAppointment2)

  console.log("--------------------------------\n")

  const removeAppointment = await impl.deleteAppointment(appointmentId)

  console.log(removeAppointment)

  console.log("--------------------------------\n")
  console.log("Finished test\n")
}

main().catch(console.error)
