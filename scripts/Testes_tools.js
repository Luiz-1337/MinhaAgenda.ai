import { MinhaAgendaAITools } from "../packages/mcp-server/src/MinhaAgendaAI_tools"
import { getProfessionalIdByName, getSalonIdByWhatsapp, getRandomFutureDate } from "./mcp-chat-utils"

async function main() {

  console.log("Starting MinhaAgendaAI Tools")
  console.log("----------------------------")

 const phone = "+5511986049295"
 const salonphone = "+14155238886"
 const profName= "Luiz Guilherme de Oliveira"
 const salonId = await getSalonIdByWhatsapp(salonphone)
 const serviceId = "c0e994be-1129-4b11-a93e-162386aeaaa8" 
 const randomDate = getRandomFutureDate()

 if (!salonId) {
   console.error("Erro: Salão não encontrado para o WhatsApp:", salonphone)
   process.exit(1)
 }

 const profId = await getProfessionalIdByName(profName, salonId)

 if (!profId) {
   console.warn("Aviso: Profissional não encontrado:", profName)
 }

 const teste = new MinhaAgendaAITools();

  const identifyCustomer = await teste.identifyCustomer(phone)

  console.log("Identify Customer: \n Telefone:",phone, "result: ", identifyCustomer)
  console.log("----------------------------")

  if (profId) {
    const checkAvailability = await teste.checkAvailability(salonId, randomDate, profId, serviceId, 60)
    console.log("Check Availability: \n Salon ID:",salonId, "result: ", checkAvailability)
    console.log("----------------------------")
  } else {
    console.log("Check Availability: Pulado (profissional não encontrado)")
    console.log("----------------------------")
  }

  if (profId) {
    const createAppointment = await teste.createAppointment(salonId, profId, phone, serviceId, randomDate, "Teste de agendamento")
    console.log("Create Appointment: \n Salon ID:",salonId, "result: ", createAppointment)
    console.log("----------------------------")
  } else {
    console.log("Create Appointment: Pulado (profissional não encontrado)")
    console.log("----------------------------")
  }


  const cancelAppointment = await teste.cancelAppointment("1", "Teste de cancelamento")
  console.log("Cancel Appointment: \n Telefone:",phone, "result: ", cancelAppointment)
  console.log("----------------------------")

  const rescheduleAppointment = await teste.rescheduleAppointment("1", "2025-12-18")
  console.log("Reschedule Appointment: \n Telefone:",phone, "result: ", rescheduleAppointment)
  console.log("----------------------------")

  const getCustomerUpcomingAppointments = await teste.getCustomerUpcomingAppointments(salonId, phone)
  console.log("Get Customer Upcoming Appointments: \n Telefone:",phone, "result: ", getCustomerUpcomingAppointments)
  console.log("----------------------------")

  if (profId) {
    const getMyFutureAppointments = await teste.getMyFutureAppointments(salonId, profId, phone)
    console.log("Get My Future Appointments: \n Telefone:",phone, "result: ", getMyFutureAppointments)
    console.log("----------------------------")
  } else {
    console.log("Get My Future Appointments: Pulado (profissional não encontrado)")
    console.log("----------------------------")
  }

  const getServices = await teste.getServices(salonId)
  console.log("Get Services: \n Telefone:",phone, "result: ", getServices)
  console.log("----------------------------")

  if (profId) {
    const saveUserPreferences = await teste.saveCustomerPreference(salonId, profId, phone, "Teste de preferências")
    console.log("Save User Preferences: \n Telefone:",phone, "result: ", saveUserPreferences)
    console.log("----------------------------")
  } else {
    console.log("Save User Preferences: Pulado (profissional não encontrado)")
    console.log("----------------------------")
  }

  const qualifyLead = await teste.qualifyLead(salonId, phone, "high", "Teste de qualificação")
  console.log("Qualify Lead: \n Telefone:",phone, "result: ", qualifyLead)
  console.log("----------------------------")

  const getSalonDetails = await teste.getSalonDetails(salonId)
  console.log("Get Salon Details: \n Salon ID:",salonId, "result: ", getSalonDetails)
  console.log("----------------------------")

  const getProfessionals = await teste.getProfessionals(salonId)
  console.log("Get Professionals: \n Salon ID:",salonId, "result: ", getProfessionals)
  console.log("----------------------------")

  const getProfessionalAvailabilityRules = await teste.getProfessionalAvailabilityRules(salonId, profName)
  console.log("Get Professional Availability Rules: \n Salon ID:",salonId, "result: ", getProfessionalAvailabilityRules)
  console.log("----------------------------")
}

main().catch((err) => {
  console.error("Error:", err);
});
