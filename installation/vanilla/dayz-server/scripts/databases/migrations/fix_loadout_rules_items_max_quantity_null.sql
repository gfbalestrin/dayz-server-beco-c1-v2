-- Migração: Permitir NULL na coluna max_quantity da tabela loadout_rules_items
-- Isso é necessário para poder banir items (max_quantity IS NULL = banido)

BEGIN TRANSACTION;

-- Criar nova tabela com max_quantity permitindo NULL
CREATE TABLE IF NOT EXISTS loadout_rules_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER UNIQUE NOT NULL,
    max_quantity INTEGER, -- Permite NULL (NULL = banido, valor = permitido com limite)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES item(id) ON DELETE CASCADE
);

-- Copiar dados da tabela antiga para a nova
-- Se max_quantity tinha valor DEFAULT 1, manter esse valor
-- Se estava NULL (não deveria acontecer, mas por segurança), manter NULL
INSERT INTO loadout_rules_items_new (id, item_id, max_quantity, created_at)
SELECT id, item_id, max_quantity, created_at
FROM loadout_rules_items;

-- Dropar tabela antiga
DROP TABLE loadout_rules_items;

-- Renomear nova tabela para o nome original
ALTER TABLE loadout_rules_items_new RENAME TO loadout_rules_items;

COMMIT;

