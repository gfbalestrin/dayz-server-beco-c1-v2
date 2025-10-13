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
