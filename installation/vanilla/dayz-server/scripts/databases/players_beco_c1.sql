PRAGMA foreign_keys = ON;

-- Tabela players_database
CREATE TABLE IF NOT EXISTS players_database (
    PlayerID TEXT PRIMARY KEY NOT NULL,
    PlayerName TEXT,
    SteamID TEXT,
    SteamName TEXT
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
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Tabela players_stats
CREATE TABLE IF NOT EXISTS players_stats (
    PlayerID TEXT NOT NULL,
    Longest_survivor_hit REAL,
    Players_killed INTEGER,
    Infected_killed INTEGER,
    Playtime REAL,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID) ON DELETE CASCADE
);

-- Criação da tabela ranking_infected_killed
CREATE TABLE IF NOT EXISTS ranking_infected_killed (
    PlayerID TEXT NOT NULL,
    Longest_survivor_hit REAL,
    Players_killed INTEGER,
    Infected_killed INTEGER,
    Playtime REAL,
    FOREIGN KEY (PlayerID) REFERENCES players_database(PlayerID)
);

-- Tabela players_name_history
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