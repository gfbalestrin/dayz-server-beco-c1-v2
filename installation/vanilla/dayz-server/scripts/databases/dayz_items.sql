PRAGMA foreign_keys = ON;

-- ============================================================
-- TABELAS BASE - Categorias principais de itens
-- ============================================================

-- Tabela de armas
CREATE TABLE IF NOT EXISTS weapons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    feed_type TEXT NOT NULL,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL
);

-- Tabela de calibres
CREATE TABLE IF NOT EXISTS calibers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL        
);

-- Tabela de munições
CREATE TABLE IF NOT EXISTS ammunitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    caliber_id INTEGER NOT NULL,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL,
    FOREIGN KEY (caliber_id) REFERENCES weapons(id)
);

-- Tabela de pentes/carregadores
CREATE TABLE IF NOT EXISTS magazines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    capacity INTEGER,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL
);

-- Tabela de acessórios para armas
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL,
    battery INTEGER NOT NULL DEFAULT 0
);

-- Tabela de explosivos
CREATE TABLE IF NOT EXISTS explosives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL
);

-- Tabela de tipos de itens
CREATE TABLE IF NOT EXISTS item_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Tabela de itens genéricos
CREATE TABLE IF NOT EXISTS item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    name_type TEXT UNIQUE NOT NULL,
    type_id INTEGER NOT NULL,
    slots INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    img TEXT NOT NULL,
    storage_slots INTEGER DEFAULT 0,
    storage_width INTEGER DEFAULT 0,
    storage_height INTEGER DEFAULT 0,
    localization TEXT,
    FOREIGN KEY (type_id) REFERENCES item_types(id)
);

-- Tabela de logins de jogadores
CREATE TABLE IF NOT EXISTS player_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT UNIQUE NOT NULL,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    token TEXT,
    active INTEGER DEFAULT 0,
    admin INTEGER DEFAULT 0
);

-- ============================================================
-- TABELAS DE RELACIONAMENTO
-- ============================================================

-- Tabela de relação arma/acessório
CREATE TABLE IF NOT EXISTS weapon_attachments (
    weapon_id INTEGER,
    attachment_id INTEGER,
    PRIMARY KEY (weapon_id, attachment_id),
    FOREIGN KEY (weapon_id) REFERENCES weapons(id),
    FOREIGN KEY (attachment_id) REFERENCES attachments(id)
);

-- Tabela de relação arma/pente
CREATE TABLE IF NOT EXISTS weapon_magazines (
    weapon_id INTEGER,
    magazine_id INTEGER,
    PRIMARY KEY (weapon_id, magazine_id),
    FOREIGN KEY (weapon_id) REFERENCES weapons(id),
    FOREIGN KEY (magazine_id) REFERENCES magazines(id)
);

-- Tabela de relação arma/munição
CREATE TABLE IF NOT EXISTS weapon_ammunitions (
    weapon_id INTEGER,
    ammo_id INTEGER,
    PRIMARY KEY (weapon_id, ammo_id),
    FOREIGN KEY (weapon_id) REFERENCES weapons(id),
    FOREIGN KEY (ammo_id) REFERENCES ammunitions(id)
);

-- Tabela de compatibilidade entre itens
CREATE TABLE IF NOT EXISTS item_compatibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_item_id INTEGER NOT NULL, -- item que "recebe"
    child_item_id INTEGER NOT NULL,  -- item que "encaixa"
    FOREIGN KEY (parent_item_id) REFERENCES item(id),
    FOREIGN KEY (child_item_id) REFERENCES item(id),
    UNIQUE (parent_item_id, child_item_id) -- evita duplicatas
);

-- ============================================================
-- TABELAS DE REGRAS E CONFIGURAÇÃO
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

-- ============================================================
-- TABELAS DE KITS DE ARMA
-- ============================================================

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

-- Tabela de acessórios dos kits de arma
CREATE TABLE IF NOT EXISTS weapon_kit_attachments (
    kit_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    PRIMARY KEY (kit_id, attachment_id),
    FOREIGN KEY (kit_id) REFERENCES weapon_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);

-- ============================================================
-- TABELAS DE KITS DE LOOT
-- ============================================================

-- Tabela de kits de loot/containeres
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

-- Tabela de pentes no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_magazines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    magazine_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (magazine_id) REFERENCES magazines(id) ON DELETE CASCADE
);

-- Tabela de acessórios no kit de loot
CREATE TABLE IF NOT EXISTS loot_kit_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loot_kit_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (loot_kit_id) REFERENCES loot_kits(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
