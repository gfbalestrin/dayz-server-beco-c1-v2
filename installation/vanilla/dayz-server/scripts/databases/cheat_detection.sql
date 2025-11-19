PRAGMA foreign_keys = ON;

-- Tabela para armazenar pontuação de suspeição de cheaters por jogador
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

-- Tabela para armazenar eventos suspeitos detectados
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

