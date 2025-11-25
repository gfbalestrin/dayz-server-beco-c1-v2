-- ============================================================
-- BANCO DE DADOS: vehicles_beco_c1.db
-- Descrição: Armazena tracking de veículos
-- ============================================================

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
    FuelTankHealth REAL,
    IsPartialUpdate INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_vehicle_id ON vehicles_tracking(VehicleId);
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_timestamp ON vehicles_tracking(TimeStamp);
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_destroyed ON vehicles_tracking(IsDestroyed);
-- Índice composto otimizado para busca de últimos registros por veículo (não destruídos)
-- Nota: SQLite não suporta DESC na definição do índice, mas ORDER BY DESC na query ainda usa o índice eficientemente
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_lookup ON vehicles_tracking(VehicleId, TimeStamp, IsDestroyed);
-- Índice para otimizar busca de último registro completo (IsPartialUpdate = 0)
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_partial ON vehicles_tracking(VehicleId, IsPartialUpdate, TimeStamp);

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

