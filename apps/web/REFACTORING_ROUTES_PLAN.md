# Plano de Refatoração: Rotas com [salonId] como Path Parameter

## 📋 Objetivo

Migrar a estrutura de rotas do projeto para incluir `salonId` como parte do path da URL, em vez de usar query string (`?salonId=...`).

**Estrutura Atual:**
```
/dashboard?salonId=xxx
/dashboard/chat?salonId=xxx
/dashboard/services?salonId=xxx
```

**Estrutura Proposta:**
```
/[salonId]/dashboard
/[salonId]/dashboard/chat
/[salonId]/dashboard/services
```

## 🎯 Benefícios

1. **URLs mais limpas e compartilháveis**
2. **Melhor SEO e indexação**
3. **Navegação mais intuitiva**
4. **Validação de acesso no nível de rota**
5. **Facilita implementação de breadcrumbs**

## 📁 Estrutura de Arquivos Proposta

### Antes (Atual)
```
apps/web/app/
  ├── dashboard/
  │   ├── layout.tsx
  │   ├── page.tsx
  │   ├── chat/
  │   │   └── page.tsx
  │   ├── agents/
  │   │   └── page.tsx
  │   ├── contacts/
  │   │   └── page.tsx
  │   ├── team/
  │   │   └── page.tsx
  │   ├── billing/
  │   │   └── page.tsx
  │   ├── services/
  │   │   ├── page.tsx
  │   │   └── ServiceList.tsx
  │   └── settings/
  │       └── page.tsx
```

### Depois (Proposta)
```
apps/web/app/
  ├── [salonId]/
  │   ├── layout.tsx              (NOVO - validação de acesso)
  │   ├── dashboard/
  │   │   ├── layout.tsx           (MOVIDO - mantém sidebar)
  │   │   ├── page.tsx             (MOVIDO)
  │   │   ├── chat/
  │   │   │   └── page.tsx         (MOVIDO)
  │   │   ├── agents/
  │   │   │   └── page.tsx         (MOVIDO)
  │   │   ├── contacts/
  │   │   │   └── page.tsx         (MOVIDO)
  │   │   ├── team/
  │   │   │   └── page.tsx         (MOVIDO)
  │   │   ├── billing/
  │   │   │   └── page.tsx         (MOVIDO)
  │   │   ├── services/
  │   │   │   ├── page.tsx         (MOVIDO)
  │   │   │   └── ServiceList.tsx  (MOVIDO)
  │   │   └── settings/
  │   │       └── page.tsx         (MOVIDO)
```

## 🔄 Passos de Migração

### Fase 1: Preparação

1. **Criar pasta `[salonId]`**
   ```bash
   mkdir -p apps/web/app/\[salonId\]
   ```

2. **Criar layout de validação em `[salonId]/layout.tsx`**
   - Validar se o `salonId` existe
   - Verificar se o usuário tem acesso ao salão
   - Redirecionar se não tiver acesso

### Fase 2: Migração de Arquivos

3. **Mover pasta `dashboard` para dentro de `[salonId]`**
   ```bash
   mv apps/web/app/dashboard apps/web/app/\[salonId\]/dashboard
   ```

### Fase 3: Atualização de Código

4. **Atualizar `[salonId]/layout.tsx`**
   - Ler `params.salonId` em vez de `searchParams.salonId`
   - Validar acesso ao salão
   - Passar `salonId` via contexto ou props

5. **Atualizar todas as páginas do dashboard**
   - Remover lógica de `searchParams.salonId`
   - Usar `params.salonId` do layout/parent
   - Atualizar chamadas de API que usam `salonId`

6. **Atualizar `SidebarNav`**
   - Construir links com `/${salonId}/dashboard/...`
   - Usar `useParams()` para obter `salonId` atual

7. **Atualizar `SalonContext`**
   - Ajustar lógica de navegação para usar path em vez de query string
   - Atualizar `setActiveSalon` para navegar para nova URL

8. **Atualizar `SalonSelector`**
   - Navegar para `/${newSalonId}/dashboard` ao trocar salão

### Fase 4: Redirecionamentos e Compatibilidade

9. **Criar middleware ou página de redirecionamento**
   - Redirecionar `/dashboard?salonId=xxx` → `/[salonId]/dashboard`
   - Manter compatibilidade temporária

10. **Atualizar links externos e bookmarks**
    - Verificar se há links hardcoded que precisam ser atualizados

## 📝 Detalhamento Técnico

### 1. Layout de Validação (`[salonId]/layout.tsx`)

```typescript
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"

export default async function SalonLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { salonId: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Valida se o salão existe e se o usuário tem acesso
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, params.salonId),
    columns: { id: true, ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    // Redireciona para o primeiro salão disponível ou onboarding
    const firstSalon = await db.query.salons.findFirst({
      where: eq(salons.ownerId, user.id),
      columns: { id: true },
    })
    
    if (firstSalon) {
      redirect(`/${firstSalon.id}/dashboard`)
    } else {
      redirect("/onboarding")
    }
  }

  return <>{children}</>
}
```

### 2. Atualização do Sidebar

```typescript
import { useParams } from "next/navigation"

export function SidebarNav() {
  const params = useParams()
  const salonId = params.salonId as string
  
  const navItems = [
    { href: `/${salonId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/${salonId}/dashboard/chat`, label: "Conversas", icon: MessageSquare },
    // ... outros itens
  ]
  
  // ...
}
```

### 3. Atualização do SalonContext

```typescript
const setActiveSalon = useCallback((salon: SalonListItem | null) => {
  if (salon && pathname) {
    // Extrai a rota atual sem o salonId
    const route = pathname.replace(/^\/[^/]+/, "")
    router.replace(`/${salon.id}${route}`)
  }
}, [router, pathname])
```

### 4. Atualização das Páginas

**Antes:**
```typescript
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { salonId?: string }
}) {
  const salonId = searchParams.salonId
  // ...
}
```

**Depois:**
```typescript
export default async function ServicesPage({
  params,
}: {
  params: { salonId: string }
}) {
  const salonId = params.salonId
  // ...
}
```

## ⚠️ Pontos de Atenção

1. **Rotas públicas** (`/login`, `/register`, `/onboarding`) devem permanecer fora de `[salonId]`
2. **API routes** (`/api/...`) não devem ser movidas
3. **Middleware** pode ser necessário para redirecionamentos automáticos
4. **Testes** devem ser atualizados para refletir nova estrutura
5. **Bookmarks** de usuários serão quebrados (necessário redirecionamento)

## 🧪 Checklist de Validação

- [ ] Todas as rotas do dashboard funcionam com novo formato
- [ ] Validação de acesso funciona corretamente
- [ ] Sidebar navega corretamente entre salões
- [ ] SalonSelector troca salão corretamente
- [ ] Redirecionamentos de rotas antigas funcionam
- [ ] Links externos são atualizados
- [ ] Testes passam
- [ ] Sem erros de lint/TypeScript

## 🚀 Ordem de Execução Recomendada

1. ✅ Criar estrutura de pastas `[salonId]`
2. ✅ Criar layout de validação
3. ✅ Mover arquivos do dashboard
4. ✅ Atualizar imports e referências
5. ✅ Atualizar Sidebar e SalonContext
6. ✅ Testar navegação
7. ✅ Implementar redirecionamentos
8. ✅ Atualizar documentação

## 📌 Notas Importantes

- **Backup**: Fazer commit antes de iniciar a migração
- **Branch**: Considerar criar branch específica para esta refatoração
- **Testes**: Testar cada página individualmente após mover
- **Rollback**: Manter plano de rollback caso algo dê errado

---

**Status:** Aguardando aprovação para iniciar migração

