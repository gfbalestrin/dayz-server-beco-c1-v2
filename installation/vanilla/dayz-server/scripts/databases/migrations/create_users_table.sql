-- Migration: Criar tabela de usuários
-- Descrição: Tabela para gerenciar usuários com diferentes perfis (super_admin, admin, player)

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT UNIQUE NOT NULL,
    Password TEXT NOT NULL,
    UserType TEXT NOT NULL,  -- 'super_admin', 'admin', 'player'
    PlayerID TEXT,           -- FK para players_database (apenas para tipo 'player')
    IsActive INTEGER DEFAULT 1,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    LastLogin DATETIME,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE SET NULL
);

-- Índice para busca rápida por username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(Username);

-- Índice para busca rápida por PlayerID
CREATE INDEX IF NOT EXISTS idx_users_playerid ON users(PlayerID);

-- Índice para busca rápida por UserType
CREATE INDEX IF NOT EXISTS idx_users_usertype ON users(UserType);

