"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Cake, Pencil } from "lucide-react"
import { updateCustomerProfile } from "@/app/actions/customer-profile"
import { Button } from "@/components/ui/button"
import {
  BRAZIL_STATES,
  customerAge,
  formatCpf,
  formatCustomerAddress,
  formatZipCode,
  isBirthday,
} from "@repo/db/src/domain/customer-profile"
import type { CustomerProfile } from "@repo/db"

const fieldClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"
const labelClass = "text-xs font-semibold text-muted-foreground"

const GENDER_LABEL: Record<NonNullable<CustomerProfile["gender"]>, string> = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
}

/** "YYYY-MM-DD" → "dd/mm/aaaa". */
function formatDay(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

/** Hoje em Brasília, "YYYY-MM-DD". */
function brazilToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

type Form = Record<keyof CustomerProfile, string>

function toForm(profile: CustomerProfile): Form {
  return {
    birthDate: profile.birthDate ?? "",
    cpf: profile.cpf ? formatCpf(profile.cpf) : "",
    gender: profile.gender ?? "",
    zipCode: profile.zipCode ? formatZipCode(profile.zipCode) : "",
    addressStreet: profile.addressStreet ?? "",
    addressNumber: profile.addressNumber ?? "",
    addressComplement: profile.addressComplement ?? "",
    addressDistrict: profile.addressDistrict ?? "",
    addressCity: profile.addressCity ?? "",
    addressState: profile.addressState ?? "",
    referralSource: profile.referralSource ?? "",
  }
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  )
}

/**
 * Dados cadastrais na ficha do cliente (docs/ROADMAP.md, fase 7, fatia 7a):
 * nascimento, CPF, gênero, endereço e "como conheceu".
 *
 * Quem não pode editar a ficha recebe o CPF já mascarado do servidor — este
 * componente só mostra o que chega.
 */
export function CustomerProfileCard({
  salonId,
  customerId,
  profile,
  canEdit,
  onSaved,
}: {
  salonId: string
  customerId: string
  profile: CustomerProfile
  canEdit: boolean
  onSaved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<Form | null>(null)

  const today = brazilToday()
  const age = customerAge(profile.birthDate, today)
  const address = formatCustomerAddress(profile)
  const isEmpty = !profile.birthDate && !profile.cpf && !profile.gender && !address && !profile.referralSource

  function set(key: keyof Form, value: string) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  function submit() {
    if (!form) return
    startTransition(async () => {
      const result = await updateCustomerProfile({
        salonId,
        customerId,
        birthDate: form.birthDate || null,
        cpf: form.cpf || null,
        gender: form.gender || null,
        zipCode: form.zipCode || null,
        addressStreet: form.addressStreet || null,
        addressNumber: form.addressNumber || null,
        addressComplement: form.addressComplement || null,
        addressDistrict: form.addressDistrict || null,
        addressCity: form.addressCity || null,
        addressState: form.addressState || null,
        referralSource: form.referralSource || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Dados cadastrais salvos")
      setForm(null)
      onSaved()
    })
  }

  return (
    <section className="bg-card border border-border rounded-xl p-4" aria-labelledby="customer-profile-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="customer-profile-title" className="text-sm font-bold text-foreground">
          Dados cadastrais
        </h3>
        {canEdit && !form && (
          <button
            type="button"
            onClick={() => setForm(toForm(profile))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <Pencil size={13} />
            Editar
          </button>
        )}
      </div>

      {!form ? (
        isEmpty ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhum dado cadastral além de nome e telefone.
            {canEdit ? " Use Editar para completar a ficha." : ""}
          </p>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <Item label="Nascimento">
              {profile.birthDate ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {formatDay(profile.birthDate)}
                  {age !== null && <span className="text-muted-foreground">({age} anos)</span>}
                  {isBirthday(profile.birthDate, today) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <Cake size={12} />
                      Aniversário hoje
                    </span>
                  )}
                </span>
              ) : (
                "—"
              )}
            </Item>
            {/* O CPF chega inteiro (só dígitos) ou já mascarado: formatCpf devolve o mascarado como veio. */}
            <Item label="CPF">{profile.cpf ? formatCpf(profile.cpf) : "—"}</Item>
            <Item label="Gênero">{profile.gender ? GENDER_LABEL[profile.gender] : "—"}</Item>
            <div className="sm:col-span-2">
              <Item label="Endereço">{address || "—"}</Item>
            </div>
            <Item label="Como conheceu">{profile.referralSource ?? "—"}</Item>
          </dl>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-birth" className={labelClass}>
                Nascimento
              </label>
              <input
                id="profile-birth"
                type="date"
                max={today}
                value={form.birthDate}
                disabled={isPending}
                onChange={(event) => set("birthDate", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-cpf" className={labelClass}>
                CPF
              </label>
              <input
                id="profile-cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                maxLength={14}
                value={form.cpf}
                disabled={isPending}
                onChange={(event) => set("cpf", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-gender" className={labelClass}>
                Gênero
              </label>
              <select
                id="profile-gender"
                value={form.gender}
                disabled={isPending}
                onChange={(event) => set("gender", event.target.value)}
                className={fieldClass}
              >
                <option value="">Não informado</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="profile-zip" className={labelClass}>
                CEP
              </label>
              <input
                id="profile-zip"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="00000-000"
                maxLength={9}
                value={form.zipCode}
                disabled={isPending}
                onChange={(event) => set("zipCode", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-3">
              <label htmlFor="profile-street" className={labelClass}>
                Endereço
              </label>
              <input
                id="profile-street"
                type="text"
                autoComplete="off"
                maxLength={120}
                value={form.addressStreet}
                disabled={isPending}
                onChange={(event) => set("addressStreet", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-number" className={labelClass}>
                Número
              </label>
              <input
                id="profile-number"
                type="text"
                autoComplete="off"
                maxLength={20}
                value={form.addressNumber}
                disabled={isPending}
                onChange={(event) => set("addressNumber", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="profile-complement" className={labelClass}>
                Complemento
              </label>
              <input
                id="profile-complement"
                type="text"
                autoComplete="off"
                maxLength={60}
                value={form.addressComplement}
                disabled={isPending}
                onChange={(event) => set("addressComplement", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor="profile-district" className={labelClass}>
                Bairro
              </label>
              <input
                id="profile-district"
                type="text"
                autoComplete="off"
                maxLength={60}
                value={form.addressDistrict}
                disabled={isPending}
                onChange={(event) => set("addressDistrict", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-city" className={labelClass}>
                Cidade
              </label>
              <input
                id="profile-city"
                type="text"
                autoComplete="off"
                maxLength={60}
                value={form.addressCity}
                disabled={isPending}
                onChange={(event) => set("addressCity", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="profile-state" className={labelClass}>
                UF
              </label>
              <select
                id="profile-state"
                value={form.addressState}
                disabled={isPending}
                onChange={(event) => set("addressState", event.target.value)}
                className={fieldClass}
              >
                <option value="">—</option>
                {BRAZIL_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="profile-referral" className={labelClass}>
              Como conheceu o salão
            </label>
            <input
              id="profile-referral"
              type="text"
              autoComplete="off"
              maxLength={80}
              placeholder="Indicação, Instagram, passou na frente…"
              value={form.referralSource}
              disabled={isPending}
              onChange={(event) => set("referralSource", event.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
