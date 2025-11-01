-- Migration: Adicionar tabelas para novos tipos de itens no kit de loot
-- Descrição: Tabelas para armazenar explosivos, munições, magazines e attachments nos kits de loot

-- Tabela de explosivos no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_explosives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    explosive_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (explosive_id) REFERENCES explosives(id) ON DELETE CASCADE
);

-- Tabela de munições no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_ammunitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    ammunition_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (ammunition_id) REFERENCES ammunitions(id) ON DELETE CASCADE
);

-- Tabela de magazines no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_magazines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    magazine_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE
);

-- Tabela de attachments no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

