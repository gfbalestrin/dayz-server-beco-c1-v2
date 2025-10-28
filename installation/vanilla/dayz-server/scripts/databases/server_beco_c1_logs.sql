CREATE TABLE IF NOT EXISTS logs_adm (
    IdLogAdm INTEGER PRIMARY KEY AUTOINCREMENT,
    Message TEXT NOT NULL,
    LogLevel TEXT DEFAULT 'INFO',
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_adm_timestamp ON logs_adm(TimeStamp);

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

CREATE TABLE IF NOT EXISTS vehicles_tracking (
    IdVehicleTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    VehicleId TEXT NOT NULL,
    VehicleName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_vehicle_id ON vehicles_tracking(VehicleId);
CREATE INDEX IF NOT EXISTS idx_vehicles_tracking_timestamp ON vehicles_tracking(TimeStamp);

CREATE TABLE IF NOT EXISTS containers_tracking (
    IdContainerTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    ContainerId TEXT NOT NULL,
    ContainerName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_containers_tracking_container_id ON containers_tracking(ContainerId);
CREATE INDEX IF NOT EXISTS idx_containers_tracking_timestamp ON containers_tracking(TimeStamp); 

CREATE TABLE IF NOT EXISTS fences_tracking (
    IdFenceTracking INTEGER PRIMARY KEY AUTOINCREMENT,
    FenceId TEXT NOT NULL,
    FenceName TEXT NOT NULL,
    PositionX REAL NOT NULL,
    PositionZ REAL NOT NULL,
    PositionY REAL NOT NULL,
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fences_tracking_fence_id ON fences_tracking(FenceId);
CREATE INDEX IF NOT EXISTS idx_fences_tracking_timestamp ON fences_tracking(TimeStamp);