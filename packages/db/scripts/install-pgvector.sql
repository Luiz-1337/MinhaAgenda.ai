-- Script para instalar a extensão pgvector no banco de dados
-- Execute este script se encontrar o erro "type vector does not exist"
-- Pode ser executado via psql ou qualquer cliente PostgreSQL

CREATE EXTENSION IF NOT EXISTS vector;

