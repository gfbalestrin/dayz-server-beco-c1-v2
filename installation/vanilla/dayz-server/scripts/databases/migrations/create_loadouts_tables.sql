-- Tabela loadouts_custom
CREATE TABLE IF NOT EXISTS loadouts_custom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    loadout_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela loadouts_players
CREATE TABLE IF NOT EXISTS loadouts_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    loadout_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    loadout_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players_database(PlayerID) ON DELETE CASCADE,
    UNIQUE(player_id, loadout_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_loadouts_custom_name ON loadouts_custom(name);
CREATE INDEX IF NOT EXISTS idx_loadouts_custom_is_active ON loadouts_custom(is_active);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_player_id ON loadouts_players(player_id);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_loadout_id ON loadouts_players(loadout_id);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_is_active ON loadouts_players(player_id, is_active);

