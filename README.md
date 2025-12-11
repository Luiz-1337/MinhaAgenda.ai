# Minha Agenda AI v2

SaaS multi-tenant para gestão completa de barbearias e salões de beleza.

## 🏗️ Estrutura do Monorepo

Este projeto utiliza **Turborepo** com **pnpm workspaces** para gerenciar múltiplos pacotes e aplicações.

```
minhaagendaai_v2/
├── apps/
│   ├── web/          # Aplicação Next.js (Dashboard Web)
│   └── mobile/       # Aplicação React Native (Expo)
├── packages/
│   ├── db/           # Schema e migrações Drizzle ORM (@repo/db)
│   ├── ui/           # Componentes UI compartilhados (@repo/ui) - preparado
│   └── typescript-config/  # Configurações TypeScript compartilhadas
└── supabase/
    └── migrations/   # Migrações SQL manuais do Supabase
```

## 📦 Workspaces

### Apps
- `web` - Aplicação web Next.js 16 (App Router)
- `mobile` - Aplicação mobile React Native (Expo)

### Packages
- `@repo/db` - Schema de banco de dados (Drizzle ORM)
- `@repo/ui` - Componentes UI compartilhados (preparado para uso futuro)
- `@repo/typescript-config` - Configurações TypeScript compartilhadas

## 🚀 Comandos Principais

```bash
# Instalar dependências
pnpm install

# Desenvolvimento (todos os apps)
pnpm dev

# Build (todos os apps)
pnpm build

# Lint
pnpm lint

# Banco de dados
pnpm db:generate    # Gerar migrações
pnpm db:push        # Aplicar schema
pnpm db:smoke       # Testar conexão
pnpm db:seed        # Popular com dados de teste
```

## 🔧 Configuração

### Requisitos
- Node.js 20.18.0 (ver `.nvmrc`)
- pnpm 10.24.0

### Variáveis de Ambiente
Crie arquivos `.env.local` nos workspaces necessários:
- `apps/web/.env.local`
- `packages/db/.env.local`

## 📝 Notas sobre Migrações

Este projeto utiliza duas estratégias de migração:
1. **Drizzle** (`packages/db/drizzle/`) - Para schema de tabelas
2. **Supabase** (`supabase/migrations/`) - Para RLS, triggers, funções SQL

Veja `packages/db/README.md` para mais detalhes.

## 🎯 Próximos Passos

Consulte `TECH_SPEC.md` para a especificação técnica completa e roadmap.

