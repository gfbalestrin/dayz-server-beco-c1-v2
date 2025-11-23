-- ============================================================
-- BANCO DE DADOS: server_beco_c1_logs.db
-- Descrição: Armazena apenas logs do servidor
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
