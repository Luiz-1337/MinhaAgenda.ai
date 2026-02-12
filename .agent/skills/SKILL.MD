---
name: minha-agenda-architect
description: Expert developer skill for "Minha Agenda Ai" SaaS. Focuses on Clean Architecture consistency, Evolution API (WhatsApp) integration, and preventing codebase complexity to reduce developer cognitive load.
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

### Architecture Rules
- **Dependency Rule**: The Domain layer MUST NOT import from Infrastructure or Presentation.
- **Error Handling**: Use the `Result` pattern (monad) instead of throwing exceptions in business logic to keep control flow predictable.

### Tech Stack Specifics
- **Database**: Supabase with Drizzle ORM.
- **Messaging**: Evolution API (via Docker).
- **Environment**: TypeScript/Node.js context.

## Optional scripts and resources the agent can use

- **Scaffolding**: Use existing file templates for "Use Cases" to avoid writing boilerplate from scratch.
- **Documentation**: Refer to Supabase and Evolution API docs for connection string parameters and endpoint validation.

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