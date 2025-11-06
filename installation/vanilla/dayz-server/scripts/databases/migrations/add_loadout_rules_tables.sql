-- Migration: Adiciona tabelas de regras para loadouts de players
-- Data: 2024

PRAGMA foreign_keys = ON;

-- ============================================================
-- TABELAS DE REGRAS PARA LOADOUTS DE PLAYERS
-- ============================================================

-- Tabela de blacklist de armas (com max_quantity para uso futuro)
CREATE TABLE IF NOT EXISTS loadout_rules_weapons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weapon_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = sem limite (para uso futuro)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (weapon_id) REFERENCES weapons(id) ON DELETE CASCADE
);

-- Tabela de blacklist de magazines (com max_quantity para uso futuro)
CREATE TABLE IF NOT EXISTS loadout_rules_magazines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magazine_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = sem limite (para uso futuro)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE
);

-- Tabela de blacklist de ammunitions (com max_quantity para uso futuro)
CREATE TABLE IF NOT EXISTS loadout_rules_ammunitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ammunition_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = sem limite (para uso futuro)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ammunition_id) REFERENCES ammunitions(id) ON DELETE CASCADE
);

-- Tabela de blacklist de attachments (com max_quantity para uso futuro)
CREATE TABLE IF NOT EXISTS loadout_rules_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attachment_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = sem limite (para uso futuro)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

-- Tabela de blacklist de explosivos com controle de quantidade
CREATE TABLE IF NOT EXISTS loadout_rules_explosives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    explosive_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = sem limite
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (explosive_id) REFERENCES explosives(id) ON DELETE CASCADE
);

-- Tabela de limite global de quantidade total de explosivos
-- Apenas 1 registro deve existir (configuração global)
CREATE TABLE IF NOT EXISTS loadout_rules_explosives_global (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    max_total_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de blacklist de itens individuais com controle de quantidade
CREATE TABLE IF NOT EXISTS loadout_rules_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- NULL = banido, valor = permitido com limite, não na tabela = padrão 1
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE
);

-- Tabela de blacklist de tipos de itens
-- Quando um tipo é banido, todos os itens daquele tipo são banidos
CREATE TABLE IF NOT EXISTS loadout_rules_item_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type_id INTEGER UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_type_id) REFERENCES item_types(id) ON DELETE CASCADE
);

-- Criar índice único para garantir apenas 1 registro na tabela global
CREATE UNIQUE INDEX IF NOT EXISTS idx_loadout_rules_explosives_global_single 
ON loadout_rules_explosives_global(id) WHERE id = 1;

