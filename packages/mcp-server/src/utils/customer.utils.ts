import { db, profiles } from "@repo/db"
import { eq } from "drizzle-orm"

/**
 * Cria um novo cliente no sistema
 * 
 * @param name - Nome completo do cliente
 * @param phone - Número de telefone do cliente
 * @returns Objeto com id, name e phone do cliente criado, ou null se já existir
 */
export async function createCustomer(name: string, phone: string): Promise<{ id: string; name: string; phone: string } | null> {
    // Verifica se o cliente já existe pelo telefone
    const existing = await db.query.profiles.findFirst({
        where: eq(profiles.phone, phone),
        columns: { id: true, fullName: true, phone: true },
    })

    if (existing) {
        // Cliente já existe, retorna null para indicar que não foi criado
        return null
    }

    // Cria novo cliente
    // Email temporário baseado no telefone (schema requer email notNull)
    const [newProfile] = await db
        .insert(profiles)
        .values({
            phone,
            fullName: name,
            email: `${phone.replace(/\D/g, '')}@temp.com`, // Remove caracteres não numéricos do telefone
        })
        .returning({ 
            id: profiles.id, 
            fullName: profiles.fullName, 
            phone: profiles.phone 
        })

    return {
        id: newProfile.id,
        name: newProfile.fullName || name,
        phone: newProfile.phone || phone,
    }
}







