-- Migration: Criar tabelas para sistema de kits
-- Descrição: Tabelas para armazenar kits de armas e kits de loot

-- Tabela de kits de arma
CREATE TABLE IF NOT EXISTS weapon_kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    weapon_id INTEGER NOT NULL,
    magazine_id INTEGER,  -- Apenas 1 magazine permitido
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (weapon_id) REFERENCES weapons(id) ON DELETE CASCADE,
    FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE SET NULL
);

-- Tabela de attachments dos kits de arma (múltiplos, mas 1 por tipo)
CREATE TABLE IF NOT EXISTS weapon_kit_attachments (
    kit_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    PRIMARY KEY (kit_id, attachment_id),
    FOREIGN KEY (kit_id) REFERENCES weapon_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

-- Tabela de kits de loot
CREATE TABLE IF NOT EXISTS loot_kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    container_item_id INTEGER NOT NULL,  -- WoodenCrate, Barrel_*, SeaChest
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (container_item_id) REFERENCES item(id) ON DELETE CASCADE
);

-- Tabela de itens avulsos no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,  -- Referência para tabela item
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE
);

-- Tabela de kits de arma dentro do kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_weapon_kits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    weapon_kit_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (weapon_kit_id) REFERENCES weapon_kits(id) ON DELETE CASCADE
);

