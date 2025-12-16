/*!/usr/bin/env node
/**
 * Utilitários para o script mcp-chat.ts
 * 
 * Este arquivo contém funções auxiliares para busca e sanitização de dados
 * usados no chat MCP.
 */

import { db, salons, profiles, salonCustomers, eq, and } from "@repo/db";

/**
 * Sanitiza o número de WhatsApp removendo espaços, traços, parênteses e prefixos
 * @param whatsapp - Número de WhatsApp a ser sanitizado
 * @returns Número sanitizado apenas com dígitos e sinal de + (se presente no início)
 */
export function sanitizeWhatsApp(whatsapp: string): string {
  return whatsapp
    .trim()
    .replace(/^whatsapp:/i, "") // Remove prefixo "whatsapp:" (case-insensitive)
    .replace(/\s/g, "") // Remove todos os espaços
    .replace(/-/g, "") // Remove todos os traços
    .replace(/\(/g, "") // Remove parênteses de abertura
    .replace(/\)/g, ""); // Remove parênteses de fechamento
}

/**
 * Busca o ID do salão baseado no número de WhatsApp
 * @param whatsapp - Número de WhatsApp do salão (pode conter espaços, traços, parênteses)
 * @returns O ID do salão (UUID) ou null se não encontrado
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados
 */
export async function getSalonIdByWhatsapp(
  whatsapp: string
): Promise<string | null> {
  // Sanitiza o número de WhatsApp para garantir o match
  const sanitizedWhatsapp = sanitizeWhatsApp(whatsapp);

  // Valida se o número sanitizado não está vazio
  if (!sanitizedWhatsapp) {
    return null;
  }

  try {
    // Busca o salão pelo número de WhatsApp sanitizado
    const salon = await db.query.salons.findFirst({
      where: eq(salons.whatsapp, sanitizedWhatsapp),
      columns: { id: true },
    });

    // Retorna o ID se encontrado, caso contrário retorna null
    return salon?.id ?? null;
  } catch (error) {
    // Re-lança o erro com contexto adicional
    throw new Error(
      `Erro ao buscar salão por WhatsApp: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Busca o ID do cliente (clientId) baseado no número de telefone
 * @param phoneNumber - Número de telefone do cliente
 * @returns O ID do cliente (UUID) ou null se não encontrado
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados
 */
export async function getClientIdByPhoneNumber(
  phoneNumber: string
): Promise<string | null> {
  // Valida se o número não está vazio
  const trimmedPhone = phoneNumber.trim();
  if (!trimmedPhone) {
    throw new Error("Número de telefone não pode ser vazio");
  }

  try {
    // Busca o perfil pelo número de telefone
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.phone, trimmedPhone),
      columns: { id: true },
    });

    // Retorna o ID se encontrado, caso contrário retorna null
    return profile?.id ?? null;
  } catch (error) {
    // Re-lança o erro com contexto adicional
    throw new Error(
      `Erro ao buscar cliente por telefone: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Busca todas as informações do cliente baseado no clientId, incluindo dados do perfil e preferências
 * @param clientId - ID do cliente (UUID)
 * @returns Objeto com todas as informações do cliente (dados do perfil e preferências)
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados ou se o cliente não for encontrado
 */
export async function getDataFromClient(
  clientId: string
): Promise<{
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  systemRole: string;
  userTier: string | null;
  createdAt: Date;
  updatedAt: Date;
  preferences: Record<string, unknown> | Record<string, Record<string, unknown>>;
      salonCustomers: Array<{
        salonId: string;
        notes: string | null;
        birthday: string | null;
        marketingOptIn: boolean;
        interactionStatus: string;
        preferences: Record<string, unknown> | null;
      }>;
}> {
  // Valida se o clientId não está vazio
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error("clientId não pode ser vazio");
  }

  try {
    // Busca os dados do perfil do cliente
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, trimmedClientId),
      columns: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        systemRole: true,
        userTier: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      throw new Error(`Cliente com ID ${trimmedClientId} não encontrado`);
    }

    // Busca todas as informações do cliente nos salões (preferências, notas, etc.)
    const customerRecords = await db.query.salonCustomers.findMany({
      where: eq(salonCustomers.profileId, trimmedClientId),
      columns: {
        salonId: true,
        notes: true,
        birthday: true,
        marketingOptIn: true,
        interactionStatus: true,
        preferences: true,
      },
    });

    // Processa as preferências
    let preferences: Record<string, unknown> | Record<string, Record<string, unknown>>;
    
    if (customerRecords.length === 0) {
      // Se não encontrou nenhum registro, retorna objeto vazio
      preferences = {};
    } else if (customerRecords.length === 1) {
      // Se encontrou apenas um registro, retorna as preferências diretamente
      preferences = (customerRecords[0].preferences as Record<string, unknown>) || {};
    } else {
      // Se encontrou múltiplos registros (cliente em múltiplos salões),
      // retorna um objeto com as preferências agrupadas por salão
      const preferencesBySalon: Record<string, Record<string, unknown>> = {};
      for (const record of customerRecords) {
        if (record.salonId && record.preferences) {
          preferencesBySalon[record.salonId] = record.preferences as Record<string, unknown>;
        }
      }
      preferences = preferencesBySalon;
    }

    // Retorna objeto completo com todas as informações
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      phone: profile.phone,
      systemRole: profile.systemRole,
      userTier: profile.userTier,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      preferences,
      salonCustomers: customerRecords.map((record) => ({
        salonId: record.salonId,
        notes: record.notes,
        birthday: record.birthday,
        marketingOptIn: record.marketingOptIn,
        interactionStatus: record.interactionStatus,
        preferences: (record.preferences as Record<string, unknown>) || null,
      })),
    };
  } catch (error) {
    // Re-lança o erro com contexto adicional
    if (error instanceof Error && error.message.includes("não encontrado")) {
      throw error;
    }
    throw new Error(
      `Erro ao buscar dados do cliente: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

