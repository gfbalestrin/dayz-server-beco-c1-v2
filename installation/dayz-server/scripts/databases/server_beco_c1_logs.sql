-- ============================================================
-- BANCO DE DADOS: server_beco_c1_logs.db
-- Descrição: Armazena logs do servidor e tracking de objetos
-- ============================================================

-- ============================================================
-- TABELAS DE LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS logs_adm (
    IdLogAdm INTEGER PRIMARY KEY AUTOINCREMENT,
    Message TEXT NOT NULL,
    LogLevel TEXT DEFAULT 'INFO',
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_adm_timestamp ON logs_adm(TimeStamp);

-- Tabela logs_rpt: Usada apenas por shell scripts (config.sh, clear_databases.sh)
-- Não é utilizada diretamente pela aplicação admin-interface
CREATE TABLE IF NOT EXISTS logs_rpt (
    IdLogRpt INTEGER PRIMARY KEY AUTOINCREMENT,
    Message TEXT NOT NULL,
    LogLevel TEXT DEFAULT 'INFO',
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_rpt_timestamp ON logs_rpt(TimeStamp);

CREATE TABLE IF NOT EXISTS logs_custom (
    IdLogCustom INTEGER PRIMARY KEY AUTOINCREMENT,
    Message TEXT NOT NULL,
    LogLevel TEXT DEFAULT 'INFO',
    Source TEXT,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_custom_timestamp ON logs_custom(TimeStamp);

-- ============================================================
-- TABELAS DE TRACKING DE VEÍCULOS
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles_tracking (
    IdVehicleTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleId TEXT NOT NULL,
    VehicleName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME,
    EngineHealth REAL,
    BodyHealth REAL,
    FuelTankHealth REAL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_vehicle_id ON vehicles_tracking(VehicleId);
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_timestamp ON vehicles_tracking(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_destroyed ON vehicles_tracking(IsDestroyed);
-- Índice composto otimizado para busca de últimos registros por veículo (não destruídos)
-- Nota: SQLite não suporta DESC na definição do índice, mas ORDER BY DESC na query ainda usa o índice eficientemente
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_lookup ON vehicles_tracking(VehicleId, TimeStamp, IsDestroyed);

CREATE TABLE IF NOT EXISTS vehicles_items (
    IdVehicleItem INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleTrackingId INTEGER NOT NULL,
    ItemType TEXT NOT NULL,
    ItemHealth REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (VehicleTrackingId) REFERENCES vehicles_tracking(IdVehicleTracking) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicles_items_vehicle ON vehicles_items(VehicleTrackingId);
CREATE INDEX IF NOT EXISTS idx_vehicles_items_type ON vehicles_items(ItemType);
CREATE INDEX IF NOT EXISTS idx_vehicles_items_timestamp ON vehicles_items(TimeStamp);

CREATE TABLE IF NOT EXISTS vehicles_attachments (
    IdVehicleAttachment INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleTrackingId INTEGER NOT NULL,
    AttachmentType TEXT NOT NULL,
    AttachmentHealth REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (VehicleTrackingId) REFERENCES vehicles_tracking(IdVehicleTracking) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicles_attachments_vehicle ON vehicles_attachments(VehicleTrackingId);
CREATE INDEX IF NOT EXISTS idx_vehicles_attachments_type ON vehicles_attachments(AttachmentType);
CREATE INDEX IF NOT EXISTS idx_vehicles_attachments_timestamp ON vehicles_attachments(TimeStamp);

-- View para obter os últimos veículos registrados
CREATE VIEW IF NOT EXISTS v_latest_vehicles AS
SELECT 
    VehicleId,
    VehicleName,
    PositionX,
    PositionY,
    PositionZ,
    TimeStamp
FROM vehicles_tracking
WHERE TimeStamp = (
    SELECT MAX(TimeStamp) FROM vehicles_tracking
);

-- ============================================================
-- TABELAS DE TRACKING DE CONTAINERS
-- ============================================================

CREATE TABLE IF NOT EXISTS containers_tracking (
    IdContainerTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    ContainerId TEXT NOT NULL,
    ContainerName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    IsDestroyed INTEGER DEFAULT 0,
    DestroyedAt DATETIME
);

CREATE INDEX IF NOT EXISTS idx_containers_tracking_container_id ON containers_tracking(ContainerId);
CREATE INDEX IF NOT EXISTS idx_containers_tracking_timestamp ON containers_tracking(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_containers_tracking_destroyed ON containers_tracking(IsDestroyed);

CREATE TABLE IF NOT EXISTS container_items_tracking (
    IdContainerItemTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    ContainerTrackingId INTEGER NOT NULL,
    ItemType TEXT NOT NULL,
    ItemHealth REAL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ContainerTrackingId) REFERENCES containers_tracking(IdContainerTracking) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_container_items_tracking_container ON container_items_tracking(ContainerTrackingId);
CREATE INDEX IF NOT EXISTS idx_container_items_tracking_type ON container_items_tracking(ItemType);
CREATE INDEX IF NOT EXISTS idx_container_items_tracking_timestamp ON container_items_tracking(TimeStamp);

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

-- ============================================================
-- TABELAS DE AUDITORIA
-- ============================================================

CREATE TABLE IF NOT EXISTS user_audit_logs (
    IdAuditLog INTEGER PRIMARY KEY AUTOINCREMENT,
    UserID INTEGER,
    Username TEXT NOT NULL,
    Action TEXT NOT NULL,
    Details TEXT,
    IPAddress TEXT,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user_id ON user_audit_logs(UserID);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_action ON user_audit_logs(Action);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_timestamp ON user_audit_logs(TimeStamp);
