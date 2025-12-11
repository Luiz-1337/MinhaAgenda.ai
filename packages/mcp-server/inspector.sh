#!/bin/bash
# Script para executar o MCP Inspector com DATABASE_URL

if [ -z "$1" ]; then
    echo "Uso: ./inspector.sh <DATABASE_URL>"
    echo "Exemplo: ./inspector.sh 'postgresql://postgres:password@host:5432/postgres'"
    exit 1
fi

export DATABASE_URL="$1"
npx @modelcontextprotocol/inspector npx -y tsx "$(dirname "$0")/src/index.ts"






