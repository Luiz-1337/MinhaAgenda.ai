# Como Resolver Problema de Instalação do pnpm

## Problema
Ao executar `pnpm install`, aparece apenas:
```
Progress: resolved 0, reused 1, downloaded 0, added 0
```

## Soluções (tente nesta ordem)

### 1. Limpar cache e reinstalar
```powershell
# Limpar cache do pnpm
pnpm store prune

# Remover node_modules de todos os workspaces
Remove-Item -Recurse -Force apps\*\node_modules, packages\*\node_modules, node_modules -ErrorAction SilentlyContinue

# Reinstalar tudo
pnpm install
```

### 2. Forçar instalação limpa
```powershell
# Remover lockfile se existir
Remove-Item pnpm-lock.yaml -ErrorAction SilentlyContinue

# Instalar forçando download
pnpm install --force
```

### 3. Verificar versão do pnpm
```powershell
# Verificar versão
pnpm --version

# Se não for 10.24.0, atualizar
npm install -g pnpm@10.24.0
```

### 4. Instalar dependências de um workspace específico
```powershell
# Instalar apenas do workspace web
pnpm --filter web install

# Ou instalar todos os workspaces
pnpm -r install
```

### 5. Se nada funcionar, usar npm temporariamente
```powershell
# No diretório raiz
npm install

# Depois voltar para pnpm
pnpm import
```

## Verificação
Após instalar, verifique se os módulos foram instalados:
```powershell
# Verificar se node_modules existe
Test-Path apps\web\node_modules

# Verificar se o pacote 'ai' foi instalado
Test-Path apps\web\node_modules\ai
```

