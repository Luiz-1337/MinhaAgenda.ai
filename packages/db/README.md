# @repo/db

Pacote compartilhado de banco de dados usando Drizzle ORM.

## Estrutura de Migrações

Este projeto utiliza **duas estratégias de migração**:

### 1. Migrações Drizzle (Recomendado)
- **Localização**: `drizzle/`
- **Uso**: Migrações geradas automaticamente pelo Drizzle Kit
- **Comandos**:
  - `pnpm db:generate` - Gera migrações baseadas no schema
  - `pnpm db:push` - Aplica mudanças diretamente ao banco (desenvolvimento)

### 2. Migrações Supabase (SQL Manual)
- **Localização**: `../../supabase/migrations/`
- **Uso**: Migrações SQL manuais para recursos específicos do Supabase (Auth, RLS, etc.)
- **Aplicação**: Executadas automaticamente pelo Supabase CLI ou via dashboard

## Quando usar cada uma?

- **Drizzle**: Para mudanças no schema de tabelas, colunas, índices, relações
- **Supabase**: Para políticas RLS, triggers, funções SQL, configurações de Auth

## Scripts Disponíveis

- `generate` - Gera migrações do Drizzle
- `push` - Aplica schema ao banco (dev)
- `studio` - Abre Drizzle Studio
- `smoke` - Testa conexão com o banco
- `seed` - Popula banco com dados de teste
- `reset` - Reseta o banco (cuidado!)

