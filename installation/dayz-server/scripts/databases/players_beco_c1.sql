-- ============================================================
-- BANCO DE DADOS: players_beco_c1.db
-- Descrição: Armazena dados de jogadores, estatísticas e loadouts
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- TABELAS DE JOGADORES
-- ============================================================

CREATE TABLE IF NOT EXISTS players_database (
    PlayerID TEXT PRIMARY KEY NOT NULL,
    PlayerName TEXT,
    SteamID TEXT,
    SteamName TEXT,
    RconGuid TEXT
);

-- Tabela players_killfeed
CREATE TABLE IF NOT EXISTS players_killfeed (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerIDKiller TEXT,
    PlayerIDKilled TEXT,
    Weapon TEXT,
    DistanceMeter REAL,
    Data DATETIME, -- Use formato ISO 8601 ao inserir (YYYY-MM-DD HH:MM:SS)
    PosKiller TEXT,
    PosKilled TEXT,
    FOREIGN KEY (PlayerIDKiller) REFERENCES players_database(PlayerID) ON DELETE CASCADE,
    FOREIGN KEY (PlayerIDKilled) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_killfeed_killer ON players_killfeed(PlayerIDKiller);
CREATE INDEX IF NOT EXISTS idx_killfeed_killed ON players_killfeed(PlayerIDKilled);

-- Tabela players_online
CREATE TABLE IF NOT EXISTS players_online (
    PlayerID TEXT PRIMARY KEY,
    DataConnect DATETIME NOT NULL,
    Country TEXT,
    City TEXT,
    Lat REAL,
    Lon REAL,
    Port INTEGER,
    Ping INTEGER,
    IP TEXT,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Tabela players_stats: Usada apenas por shell scripts
-- Não é utilizada diretamente pela aplicação admin-interface
CREATE TABLE IF NOT EXISTS players_stats (
    PlayerID TEXT NOT NULL,
    Longest_survivor_hit REAL,
    Players_killed INTEGER,
    Infected_killed INTEGER,
    Playtime REAL,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Tabela ranking_infected_killed: Não encontrado uso direto
-- Mantida para compatibilidade com scripts externos
CREATE TABLE IF NOT EXISTS ranking_infected_killed (
    PlayerID TEXT NOT NULL,
    Longest_survivor_hit REAL,
    Players_killed INTEGER,
    Infected_killed INTEGER,
    Playtime REAL,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID)
);

-- Tabela players_name_history: Usada apenas por shell scripts (config.sh)
-- Não é utilizada diretamente pela aplicação admin-interface
CREATE TABLE IF NOT EXISTS players_name_history (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerID TEXT NOT NULL,
    PlayerName TEXT NOT NULL,
    SteamID TEXT,
    SteamName TEXT,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Tabela players_coord
CREATE TABLE IF NOT EXISTS players_coord (
    PlayerCoordId INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerID TEXT NOT NULL,
    CoordX REAL NOT NULL,
    CoordZ REAL NOT NULL,
    CoordY REAL NOT NULL,
    Data DATETIME,
    Health REAL,
    Blood REAL,
    Shock REAL,
    Energy REAL,
    Water REAL,
    IsAlive INTEGER,
    IsAdmin INTEGER,
    Stamina REAL,
    StaminaMax REAL,
    ItemsInHands TEXT,
    ItemsCount INTEGER,
    MainItems TEXT,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_players_coords_playerid ON players_coord(PlayerID);

-- Tabela players_coord_backup
CREATE TABLE IF NOT EXISTS players_coord_backup (
    PlayerCoordId INTEGER NOT NULL,
    Backup BLOB,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (PlayerCoordId) REFERENCES players_coord(PlayerCoordId) ON DELETE CASCADE
);

-- Tabela players_damage
CREATE TABLE IF NOT EXISTS players_damage (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerIDAttacker TEXT NOT NULL,
    PlayerIDVictim TEXT NOT NULL,
    PosAttacker TEXT,
    PosVictim TEXT,
    LocalDamage TEXT,
    HitType TEXT,
    Damage REAL,
    Health REAL,
    Data DATETIME,     
    Weapon TEXT,
    DistanceMeter REAL DEFAULT 0,
    FOREIGN KEY (PlayerIDAttacker) REFERENCES players_database(PlayerID) ON DELETE CASCADE,
    FOREIGN KEY (PlayerIDVictim) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_damage_killer ON players_damage(PlayerIDAttacker);
CREATE INDEX IF NOT EXISTS idx_damage_killed ON players_damage(PlayerIDVictim);

-- ============================================================
-- TABELAS DE USUÁRIOS E AUTENTICAÇÃO
-- ============================================================

-- Tabela de usuários para gerenciar diferentes perfis (super_admin, admin, player)
CREATE TABLE IF NOT EXISTS users (
    UserID INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT UNIQUE NOT NULL,
    Password TEXT NOT NULL,
    UserType TEXT NOT NULL,  -- 'super_admin', 'admin', 'player'
    PlayerID TEXT,           -- FK para players_database (apenas para tipo 'player')
    IsActive INTEGER DEFAULT 1,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    LastLogin DATETIME,
    MustChangePassword INTEGER DEFAULT 1,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(Username);
CREATE INDEX IF NOT EXISTS idx_users_playerid ON users(PlayerID);
CREATE INDEX IF NOT EXISTS idx_users_usertype ON users(UserType);

-- ============================================================
-- TABELAS DE LOADOUTS
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_loadouts_custom_name ON loadouts_custom(name);
CREATE INDEX IF NOT EXISTS idx_loadouts_custom_is_active ON loadouts_custom(is_active);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_player_id ON loadouts_players(player_id);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_loadout_id ON loadouts_players(loadout_id);
CREATE INDEX IF NOT EXISTS idx_loadouts_players_is_active ON loadouts_players(player_id, is_active);

-- ============================================================
-- TABELAS DE DETECÇÃO DE CHEAT
-- ============================================================

CREATE TABLE IF NOT EXISTS cheat_detection_scores (
    PlayerID TEXT PRIMARY KEY NOT NULL,
    TotalScore REAL DEFAULT 0,
    LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
    RiskLevel TEXT DEFAULT 'normal',  -- 'normal', 'suspicious', 'high_risk', 'critical'
    IsBanned INTEGER DEFAULT 0,
    BannedAt DATETIME,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cheat_scores_risk_level ON cheat_detection_scores(RiskLevel);
CREATE INDEX IF NOT EXISTS idx_cheat_scores_total_score ON cheat_detection_scores(TotalScore);
CREATE INDEX IF NOT EXISTS idx_cheat_scores_is_banned ON cheat_detection_scores(IsBanned);

CREATE TABLE IF NOT EXISTS cheat_detection_events (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerID TEXT NOT NULL,
    EventType TEXT NOT NULL,  -- 'teleport', 'speed_hack', 'aimbot', 'loot_hack', etc.
    Score REAL NOT NULL,
    Details TEXT,  -- JSON com detalhes do evento
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    Reviewed INTEGER DEFAULT 0,
    ReviewedBy TEXT,
    ReviewResult TEXT,  -- 'confirmed', 'false_positive', NULL
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cheat_events_player_id ON cheat_detection_events(PlayerID);
CREATE INDEX IF NOT EXISTS idx_cheat_events_event_type ON cheat_detection_events(EventType);
CREATE INDEX IF NOT EXISTS idx_cheat_events_timestamp ON cheat_detection_events(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_cheat_events_reviewed ON cheat_detection_events(Reviewed);

-- ============================================================
-- TABELA DE HISTÓRICO DE EVENTOS DE JOGADORES
-- ============================================================

-- Tabela players_events: Registra histórico completo de eventos relacionados aos jogadores
CREATE TABLE IF NOT EXISTS players_events (
    EventId INTEGER PRIMARY KEY AUTOINCREMENT,
    PlayerID TEXT NOT NULL,
    EventType TEXT NOT NULL,  -- Tipo do evento (player_connected, player_death, item_found, etc.)
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    CoordX REAL,  -- Coordenada X (opcional)
    CoordY REAL,  -- Coordenada Y (opcional)
    CoordZ REAL,  -- Coordenada Z/Altura (opcional)
    Details TEXT,  -- JSON com detalhes adicionais do evento
    RelatedPlayerID TEXT,  -- FK opcional para outro jogador envolvido no evento
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE,
    FOREIGN KEY (RelatedPlayerID) REFERENCES players_database(PlayerID) ON DELETE SET NULL
);

-- Índices para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_events_player_id ON players_events(PlayerID);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON players_events(EventType);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON players_events(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_events_player_type ON players_events(PlayerID, EventType);
CREATE INDEX IF NOT EXISTS idx_events_related_player ON players_events(RelatedPlayerID);
