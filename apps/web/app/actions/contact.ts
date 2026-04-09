"use server"

import { Resend } from "resend"

interface ContactFormData {
  name: string
  company: string
  email: string
  phone: string
  hairdressers: string
  message: string
}

export async function sendContactEmail(data: ContactFormData): Promise<{ success: true } | { error: string }> {
  const { name, company, email, phone, hairdressers, message } = data

  if (!name || !email || !message) {
    return { error: "Nome, e-mail e mensagem são obrigatórios." }
  }

  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.error("RESEND_API_KEY não configurado")
    return { error: "Erro interno ao enviar mensagem. Tente novamente mais tarde." }
  }

  const resend = new Resend(apiKey)

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
      <h2 style="color: #141414; margin: 0 0 24px 0; font-size: 22px;">Nova mensagem de contato</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; width: 160px; border-bottom: 1px solid #e5e5e5;">Nome</td>
          <td style="padding: 10px 12px; color: #141414; border-bottom: 1px solid #e5e5e5;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e5e5;">Empresa / Salão</td>
          <td style="padding: 10px 12px; color: #141414; border-bottom: 1px solid #e5e5e5;">${company || "—"}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e5e5;">E-mail</td>
          <td style="padding: 10px 12px; color: #141414; border-bottom: 1px solid #e5e5e5;"><a href="mailto:${email}" style="color: #2b77d3;">${email}</a></td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e5e5;">Telefone</td>
          <td style="padding: 10px 12px; color: #141414; border-bottom: 1px solid #e5e5e5;">${phone || "—"}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; border-bottom: 1px solid #e5e5e5;">Nº de Cabeleireiros</td>
          <td style="padding: 10px 12px; color: #141414; border-bottom: 1px solid #e5e5e5;">${hairdressers || "—"}</td>
        </tr>
      </table>
      <div style="margin-top: 20px; padding: 16px; background: #ffffff; border-radius: 6px; border: 1px solid #e5e5e5;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #555; font-size: 13px;">Mensagem</p>
        <p style="margin: 0; color: #141414; white-space: pre-wrap; line-height: 1.6;">${message}</p>
      </div>
      <p style="margin-top: 24px; font-size: 11px; color: #aaa; text-align: center;">Enviado pelo formulário de contato — minhaagenda.ai</p>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: "MinhaAgenda.AI <onboarding@resend.dev>",
      to: "minhaagendaai@gmail.com",
      replyTo: email,
      subject: `[Contato] ${company ? `${company} — ` : ""}${name}`,
      html,
    })

    if (error) {
      console.error("Erro ao enviar email de contato:", error)
      return { error: "Falha ao enviar mensagem. Tente novamente mais tarde." }
    }

    return { success: true }
  } catch (err) {
    console.error("Erro ao enviar email de contato:", err)
    return { error: "Falha ao enviar mensagem. Tente novamente mais tarde." }
  }
}
