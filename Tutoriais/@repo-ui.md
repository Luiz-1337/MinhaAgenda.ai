# @repo/ui

Pacote para componentes UI compartilhados entre web e mobile.

## Status

Este pacote está preparado para uso futuro. Quando necessário, componentes compartilhados podem ser movidos para cá.

## Estrutura Planejada

```
src/
  components/     # Componentes compartilhados
  hooks/          # Hooks compartilhados
  utils/          # Utilitários de UI
  types/          # Tipos TypeScript
```

## Nota

Atualmente, os componentes UI estão separados:
- **Web**: `apps/web/components/` (shadcn/ui)
- **Mobile**: `apps/mobile/components/` (React Native)

Quando houver necessidade de componentes verdadeiramente compartilhados, eles serão movidos para este pacote.

