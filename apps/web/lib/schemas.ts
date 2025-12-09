import { z } from "zod"

export const createSalonSchema = z.object({
  name: z.string().min(3),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
})

export type CreateSalonSchema = z.infer<typeof createSalonSchema>

