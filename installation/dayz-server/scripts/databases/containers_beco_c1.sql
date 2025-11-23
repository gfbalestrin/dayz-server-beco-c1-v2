-- ============================================================
-- BANCO DE DADOS: containers_beco_c1.db
-- Descrição: Armazena tracking de containers
-- ============================================================

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

