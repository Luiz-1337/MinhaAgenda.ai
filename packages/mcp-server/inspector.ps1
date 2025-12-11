# Script para executar o MCP Inspector com DATABASE_URL

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

$env:DATABASE_URL = $DatabaseUrl
npx @modelcontextprotocol/inspector npx -y tsx "$PSScriptRoot/src/index.ts"






