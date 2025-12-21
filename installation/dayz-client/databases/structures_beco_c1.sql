-- ============================================================
-- BANCO DE DADOS: structures_beco_c1.db
-- Descrição: Armazena tracking de construções (cercas, torres, bandeiras)
-- ============================================================

-- ============================================================
-- TABELAS DE TRACKING DE CERCAS
-- ============================================================

CREATE TABLE IF NOT EXISTS fences_tracking (
    IdFenceTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    FenceId TEXT NOT NULL,
    FenceName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    HasBase INTEGER,
    LowerPanelBuilt INTEGER,
    UpperPanelBuilt INTEGER,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME
);

CREATE INDEX IF NOT EXISTS idx_fences_tracking_fence_id ON fences_tracking(FenceId);
CREATE INDEX IF NOT EXISTS idx_fences_tracking_timestamp ON fences_tracking(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_fences_tracking_destroyed ON fences_tracking(IsDestroyed);

-- ============================================================
-- TABELAS DE TRACKING DE TORRES DE OBSERVAÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS watchtowers_tracking (
    WatchtowerTrackingId INTEGER PRIMARY KEY AUTOINCREMENT,
    WatchtowerId TEXT NOT NULL,
    WatchtowerName TEXT,
    PositionX REAL,
    PositionZ REAL,
    PositionY REAL,
    OrientationX REAL,
    OrientationY REAL,
    OrientationZ REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    HasBase INTEGER,
    Level1BaseBuilt INTEGER,
    Level2BaseBuilt INTEGER,
    Level3BaseBuilt INTEGER,
    Level1StairsBuilt INTEGER,
    Level2StairsBuilt INTEGER,
    HasRoof INTEGER,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME,
    Level1Wall1LowerBuilt INTEGER,
    Level1Wall1UpperBuilt INTEGER,
    Level1Wall2LowerBuilt INTEGER,
    Level1Wall2UpperBuilt INTEGER,
    Level1Wall3LowerBuilt INTEGER,
    Level1Wall3UpperBuilt INTEGER,
    Level2Wall1LowerBuilt INTEGER,
    Level2Wall1UpperBuilt INTEGER,
    Level2Wall2LowerBuilt INTEGER,
    Level2Wall2UpperBuilt INTEGER,
    Level2Wall3LowerBuilt INTEGER,
    Level2Wall3UpperBuilt INTEGER,
    Level3Wall1LowerBuilt INTEGER,
    Level3Wall1UpperBuilt INTEGER,
    Level3Wall2LowerBuilt INTEGER,
    Level3Wall2UpperBuilt INTEGER,
    Level3Wall3LowerBuilt INTEGER,
    Level3Wall3UpperBuilt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_watchtowers_tracking_watchtower_id ON watchtowers_tracking(WatchtowerId);
CREATE INDEX IF NOT EXISTS idx_watchtowers_tracking_timestamp ON watchtowers_tracking(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_watchtowers_tracking_destroyed ON watchtowers_tracking(IsDestroyed);

-- ============================================================
-- TABELAS DE TRACKING DE BANDEIRAS
-- ============================================================

CREATE TABLE IF NOT EXISTS flags_tracking (
    FlagTrackingId INTEGER PRIMARY KEY AUTOINCREMENT,
    FlagId TEXT NOT NULL,
    FlagName TEXT,
    PositionX REAL,
    PositionZ REAL,
    PositionY REAL,
    OrientationX REAL,
    OrientationY REAL,
    OrientationZ REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    HasBase INTEGER,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME,
    HasFlagBase INTEGER,
    FlagRaised INTEGER,
    FlagHeight REAL
);

CREATE INDEX IF NOT EXISTS idx_flags_tracking_flag_id ON flags_tracking(FlagId);
CREATE INDEX IF NOT EXISTS idx_flags_tracking_timestamp ON flags_tracking(TimeStamp);

