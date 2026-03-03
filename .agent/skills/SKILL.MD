---
name: minha-agenda-architect
description: Expert developer skill for "Minha Agenda Ai" SaaS. Focuses on Clean Architecture consistency, Monorepo workspace rules, Evolution API (WhatsApp) integration, and preventing codebase complexity.
---

# Minha Agenda Ai - Development Architect

## Instructions for how to approach a specific type of task

### 1. Implementing New Features (The Clean Flow)
To maintain architectural integrity and reduce mental fatigue, follow this strict "Outside-In" flow:
1.  **Domain Layer**: Define the *Entity* and the *Gateway Interface* (Repository) first. Do not touch the database yet.
2.  **Use Case Layer**: Implement the business logic. It must strictly depend only on the Domain.
3.  **Infrastructure Layer**: Implement the *Gateway* using Supabase/Drizzle or Evolution API.
4.  **Presentation Layer**: Connect the Controller/UI.

### 2. Debugging Evolution API (WhatsApp)
When dealing with message failures or "MCP" tool errors:
1.  **Check Containers**: Verify if the Docker container for Evolution API is healthy before checking code.
2.  **Isolation**: Ensure the `WhatsAppGateway` isolates the external API code. Never let Axios/HTTP calls leak into the Use Cases.

### 3. Refactoring & Complexity Management
- **Atomic Changes**: If a task feels overwhelming, break it down into changes affecting max 3 files at a time.
- **Legacy Code**: If you encounter code violating Clean Arch, flag it. Do not refactor it unless explicitly asked.

## Best practices and conventions to follow

### Architecture Rules & Monorepo Context
- **Workspace Separation**: The Domain, DB, and core Use Cases MUST reside in `/packages/db`. The Presentation layer and controllers belong in `/apps/web` (Next.js) or `/apps/mobile` (Expo).
- **Dependency Rule**: Modules in `/apps` can import from `/packages`, but `/packages` MUST NEVER import from `/apps`. The Domain layer MUST NOT import from Infrastructure or Presentation.
- **Error Handling**: Use the `Result` pattern (monad) instead of throwing exceptions in business logic to keep control flow predictable.

### Tech Stack & Integrations
- **Database**: Supabase with Drizzle ORM.
- **Messaging & Sync**: Evolution API (WhatsApp). When handling scheduling sync across multiple sources (like Trinks or Google Calendar), isolate the external API logic inside Gateway adapters in the Infrastructure layer.
- **Environment**: TypeScript/Node.js context with Turborepo workspaces.

## Optional scripts and resources the agent can use

- **Scaffolding**: Use existing file templates for "Use Cases" to avoid writing boilerplate from scratch.
- **Documentation**: Refer to Supabase and Evolution API docs for connection string parameters and endpoint validation.

---
name: minha-agenda-frontend
description: Frontend expert for Next.js (App Router) and React Native (Expo). Focuses on Server Actions, Tailwind CSS, and optimized UI rendering.
---

# Frontend Skill

When writing or refactoring UI components, follow these strict rules:

## Next.js (Web) Rules
1. **Server vs Client Components**: Default to Server Components. Only use `"use client"` when interactivity (hooks, state, event listeners) is strictly required.
2. **Data Mutations**: Always use Server Actions placed in `apps/web/app/actions` for mutations instead of creating generic API routes.
3. **Styling**: Use Tailwind CSS and Shadcn UI components (located in `packages/ui` or local components). Avoid custom CSS files.
4. **Loading States**: Always implement `loading.tsx` or wrap async components in `<Suspense>` to prevent blocking the UI.

## React Native (Mobile) Rules
1. **Navigation**: Use Expo Router conventions.
2. **Performance**: Avoid inline arrow functions in render methods. Use `React.memo` for heavy lists.

---
name: mcp-tool-builder
description: Expert in building tools for the Model Context Protocol (MCP). Ensures tools are secure, strictly typed, and don't expose sensitive DB operations.
---

# MCP Tool Builder Skill

When creating or modifying tools in `packages/mcp-server` for the AI agent to use:

## Implementation Rules
1. **Input Validation**: Every tool MUST have strict input validation using Zod. Never trust the LLM's raw input.
2. **Read-Only by Default**: Tools should primarily read data (e.g., check availability, list services). If a mutation is required (e.g., book appointment), ensure strict user authorization checks are in place before execution.
3. **Clear Descriptions**: The `description` field of the tool is for the LLM. It must be highly descriptive, detailing exactly when the LLM should use the tool and what format it expects.
4. **No Direct DB Access**: Tools MUST use the Use Cases defined in `packages/db`. Do not write raw Drizzle queries inside the MCP tool definition.

---
name: code-review
description: Reviews code changes for bugs, style issues, and best practices. Use when reviewing PRs or checking code quality.
---

# Code Review Skill

When reviewing code, follow these steps:

## Review checklist

1. **Correctness**: Does the code do what it's supposed to?
2. **Edge cases**: Are error conditions handled?
3. **Style**: Does it follow project conventions?
4. **Performance**: Are there obvious inefficiencies?

## How to provide feedback

- Be specific about what needs to change
- Explain why, not just what
- Suggest alternatives when possible