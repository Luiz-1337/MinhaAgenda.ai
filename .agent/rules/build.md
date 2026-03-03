---
trigger: model_decision
description: Toda vez que for necessário navegar pelo projeto, utilize esse guia para se localizar e saber exatamente o que procurar e onde alterar
---

Guia de Navegação e Arquitetura do Projeto
Este projeto utiliza uma arquitetura de Monorepo gerenciada pelo Turborepo. A base de código está dividida logicamente entre aplicativos voltados para o usuário (/apps) e pacotes de domínio/infraestrutura compartilhados (/packages).

Apps (/apps)
Contém as aplicações front-end e APIs de consumo.

/apps/web: A aplicação principal do SaaS, construída com Next.js (App Router).

/app/[salonId]: Core do sistema. Contém todas as telas do painel de controle do salão (agenda, chat, clientes, serviços, configurações).

/app/api: Camada de endpoints e webhooks. É aqui que residem integrações vitais de comunicação, como os webhooks do WhatsApp, Evolution API, autenticação do Google e rotas de processamento de chat da IA.

/components: Componentes React divididos por contexto (ex: /dashboard, /features, /whatsapp, /landing).

/lib: Funções utilitárias, schemas de validação (Zod) e serviços específicos da web que lidam com a UI.

/apps/mobile: O aplicativo móvel construído em React Native (Expo) para uso mobile (painel do profissional/cliente).

Packages (/packages)
Módulos independentes e reutilizáveis que encapsulam a lógica de negócios e integrações, blindando o front-end da complexidade dos dados.

/packages/db: O coração dos dados e das regras de negócio pesadas.

/src/schema.ts e /drizzle: Definições das tabelas (users, salons, appointments, agents, etc.) e as migrations do Drizzle ORM.

/src/services e /src/application: Contém a lógica isolada de domínio. É aqui que ficam as integrações de agenda complexas (sincronização com Trinks, Google Calendar), validação de horários disponíveis e o despachante de marketing.

/packages/mcp-server: Servidor do Model Context Protocol (MCP).

Expõe as capacidades do sistema para a IA. Contém os tools (ferramentas) e presenters que permitem que os agentes de IA leiam a agenda, busquem serviços do catálogo e qualifiquem leads de forma autônoma sem tocar diretamente no banco.

/packages/ui: Design System e componentes visuais base genéricos e compartilhados entre as aplicações.

/packages/typescript-config: Configurações base do TypeScript (Next.js, React, Node) centralizadas para manter a tipagem estrita e consistente em todo o monorepo.

Infraestrutura, Scripts e Documentação
/supabase/migrations: Contém migrations SQL cruas e específicas para o Supabase (como funções RPC, extensões como o pgvector para RAG, triggers e políticas de RLS).

/scripts: Coleção de scripts utilitários em Node/TypeScript usados para testes isolados (diagnosticar Evolution API, testar RAG), semeadura de banco de dados (seed.mjs) e manutenção.

/Tutoriais: Documentação técnica detalhada, especificações de arquitetura, fluxos de autenticação e guias para configuração do ambiente MCP e AI SDK.

.agent/ / .claude/ / .cursorrules: Diretórios de regras locais para alinhar as respostas dos assistentes de código e agentes de desenvolvimento ao padrão do projeto.