/*!/usr/bin/env node
/**
 * Utilitários para o script mcp-chat.ts
 * 
 * Este arquivo contém funções auxiliares para busca e sanitização de dados
 * usados no chat MCP.
 */

import { db, salons, profiles, customers, professionals, eq, and, ilike } from "@repo/db";

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
): Promise<string> {
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
    return profile?.id ?? "Não encontrado";
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

    // Busca clientes relacionados a este profile (se houver phone correspondente)
    let customerRecords: Array<{
      salonId: string;
      preferences: Record<string, unknown> | null;
    }> = [];
    
    if (profile.phone) {
      const normalizedPhone = profile.phone.replace(/\D/g, "");
      const customersList = await db.query.customers.findMany({
        where: eq(customers.phone, normalizedPhone),
        columns: {
          salonId: true,
          preferences: true,
        },
      });
      
      customerRecords = customersList.map((c) => ({
        salonId: c.salonId || "",
        preferences: (c.preferences as Record<string, unknown>) || null,
      }));
    }

    // Processa as preferências
    let preferences: Record<string, unknown> | Record<string, Record<string, unknown>>;
    
    if (customerRecords.length === 0) {
      preferences = {};
    } else if (customerRecords.length === 1) {
      preferences = customerRecords[0].preferences || {};
    } else {
      const preferencesBySalon: Record<string, Record<string, unknown>> = {};
      for (const record of customerRecords) {
        if (record.salonId && record.preferences) {
          preferencesBySalon[record.salonId] = record.preferences;
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
        preferences: record.preferences,
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

/**
 * Busca o ID do profissional baseado no nome
 * @param name - Nome do profissional (busca case-insensitive)
 * @param salonId - ID do salão (opcional, mas recomendado para garantir unicidade)
 * @returns O ID do profissional (UUID) ou null se não encontrado
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados ou se houver múltiplos profissionais com o mesmo nome
 */
export async function getProfessionalIdByName(
  name: string,
  salonId?: string
): Promise<string | null> {
  // Valida se o nome não está vazio
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Nome do profissional não pode ser vazio");
  }

  try {
    // Monta as condições de busca
    const conditions = salonId
      ? and(ilike(professionals.name, trimmedName), eq(professionals.salonId, salonId))
      : ilike(professionals.name, trimmedName);

    // Busca o profissional pelo nome (case-insensitive)
    const professional = await db.query.professionals.findFirst({
      where: conditions,
      columns: { id: true },
    });

    // Se encontrou, retorna o ID
    if (professional) {
      return professional.id;
    }

    // Se não encontrou e não foi especificado salonId, verifica se há múltiplos profissionais com o mesmo nome
    if (!salonId) {
      const allProfessionals = await db.query.professionals.findMany({
        where: ilike(professionals.name, trimmedName),
        columns: { id: true, salonId: true },
      });

      if (allProfessionals.length > 1) {
        throw new Error(
          `Múltiplos profissionais encontrados com o nome "${trimmedName}". Por favor, especifique o salonId para garantir unicidade.`
        );
      }
    }

    // Retorna null se não encontrado
    return null;
  } catch (error) {
    // Re-lança o erro com contexto adicional
    if (error instanceof Error && error.message.includes("Múltiplos profissionais")) {
      throw error;
    }
    throw new Error(
      `Erro ao buscar profissional por nome: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Gera uma data aleatória no futuro em formato ISO
 * A data será sempre em dias úteis (segunda a sexta) e entre 9h e 18h
 * @param daysFromNow - Número mínimo de dias a partir de hoje (padrão: 1)
 * @param maxDaysFromNow - Número máximo de dias a partir de hoje (padrão: 365)
 * @returns Data aleatória no futuro em formato ISO string (YYYY-MM-DDTHH:mm)
 */
export function getRandomFutureDate(
  daysFromNow: number = 1,
  maxDaysFromNow: number = 365
): string {
  // Valida os parâmetros
  if (daysFromNow < 0) {
    throw new Error("daysFromNow deve ser maior ou igual a zero");
  }
  if (maxDaysFromNow <= daysFromNow) {
    throw new Error("maxDaysFromNow deve ser maior que daysFromNow");
  }

  // Horário comercial fixo: 9h às 18h
  const minHour = 9;
  const maxHour = 18;

  // Função auxiliar para verificar se é dia útil (segunda=1 a sexta=5)
  const isWeekday = (date: Date): boolean => {
    const day = date.getDay(); // 0=domingo, 1=segunda, ..., 6=sábado
    return day >= 1 && day <= 5; // Segunda a sexta
  };

  // Função auxiliar para avançar para o próximo dia útil
  const nextWeekday = (date: Date): Date => {
    const next = new Date(date);
    while (!isWeekday(next)) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  };

  // Obtém a data atual
  const today = new Date();
  
  // Calcula a data mínima (hoje + daysFromNow) e garante que seja dia útil
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + daysFromNow);
  minDate.setHours(minHour, 0, 0, 0);
  if (!isWeekday(minDate)) {
    const adjusted = nextWeekday(minDate);
    minDate.setTime(adjusted.getTime());
  }
  
  // Calcula a data máxima (hoje + maxDaysFromNow) e garante que seja dia útil
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + maxDaysFromNow);
  maxDate.setHours(maxHour, 59, 59, 999);
  if (!isWeekday(maxDate)) {
    // Se a data máxima cair em fim de semana, retrocede para a sexta anterior
    while (!isWeekday(maxDate)) {
      maxDate.setDate(maxDate.getDate() - 1);
    }
    maxDate.setHours(maxHour, 59, 59, 999);
  }
  
  // Gera um número aleatório entre as duas datas
  const minTime = minDate.getTime();
  const maxTime = maxDate.getTime();
  
  if (minTime > maxTime) {
    throw new Error("Não foi possível gerar uma data válida no intervalo especificado");
  }
  
  // Gera uma data aleatória
  let randomTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  let randomDate = new Date(randomTime);
  
  // Se não for dia útil, ajusta para o próximo dia útil
  if (!isWeekday(randomDate)) {
    randomDate = nextWeekday(randomDate);
    // Se ultrapassou o limite máximo, usa a data máxima
    if (randomDate.getTime() > maxTime) {
      randomDate = new Date(maxDate);
    }
  }
  
  // Garante que a hora esteja entre 9h e 18h
  const randomHour = Math.floor(Math.random() * (maxHour - minHour + 1)) + minHour;
  const randomMinute = Math.floor(Math.random() * 60); // Minutos aleatórios (0-59)
  
  randomDate.setHours(randomHour, randomMinute, 0, 0);
  
  // Formata como ISO string (YYYY-MM-DDTHH:mm)
  const year = randomDate.getFullYear();
  const month = String(randomDate.getMonth() + 1).padStart(2, '0');
  const day = String(randomDate.getDate()).padStart(2, '0');
  const hour = String(randomDate.getHours()).padStart(2, '0');
  const minute = String(randomDate.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

