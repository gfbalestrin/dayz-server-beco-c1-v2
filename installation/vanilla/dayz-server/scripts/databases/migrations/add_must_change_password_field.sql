-- Migration: Adicionar campo MustChangePassword à tabela users
-- Descrição: Campo para forçar troca de senha no primeiro login

-- Adicionar coluna MustChangePassword
ALTER TABLE users ADD COLUMN MustChangePassword INTEGER DEFAULT 1;

-- Atualizar usuários existentes para não pedir troca de senha (segurança)
-- Manter DEFAULT 1 para novos usuários
UPDATE users SET MustChangePassword = 0 WHERE MustChangePassword IS NULL;

