#!/usr/bin/env python3
"""
Script para aplicar migrations ao banco de dados
"""
import sqlite3
import os
from pathlib import Path

# Caminho do banco de dados
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "databases", "players_beco_c1.db")

# Caminho das migrations
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "databases", "migrations")

def apply_migration(migration_file: str) -> bool:
    """Aplica uma migration específica"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # Ler arquivo SQL
            with open(migration_file, 'r', encoding='utf-8') as f:
                sql_content = f.read()
            
            # Executar SQL
            conn.executescript(sql_content)
            conn.commit()
            print(f"✓ Migration aplicada: {os.path.basename(migration_file)}")
            return True
    except Exception as e:
        print(f"✗ Erro ao aplicar migration {os.path.basename(migration_file)}: {str(e)}")
        return False

def check_column_exists(table_name: str, column_name: str) -> bool:
    """Verifica se uma coluna existe em uma tabela"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [row[1] for row in cursor.fetchall()]
            return column_name in columns
    except Exception as e:
        print(f"Erro ao verificar coluna: {str(e)}")
        return False

def main():
    """Função principal"""
    print("=" * 60)
    print("APLICAR MIGRATIONS - BANCO DE DADOS PLAYERS")
    print("=" * 60)
    print(f"\nBanco de dados: {DB_PATH}")
    print(f"Diretório de migrations: {MIGRATIONS_DIR}\n")
    
    # Verificar se o banco existe
    if not os.path.exists(DB_PATH):
        print(f"✗ Erro: Banco de dados não encontrado em {DB_PATH}")
        return 1
    
    migrations_applied = 0
    migrations_skipped = 0
    
    # Lista de migrations na ordem correta
    migrations = [
        ("create_users_table.sql", "users", "UserID"),
        ("add_must_change_password_field.sql", None, "MustChangePassword")
    ]
    
    for migration_file, table_check, column_check in migrations:
        migration_path = os.path.join(MIGRATIONS_DIR, migration_file)
        
        if not os.path.exists(migration_path):
            print(f"⚠ Migration não encontrada: {migration_file}")
            migrations_skipped += 1
            continue
        
        # Verificar se já foi aplicada
        should_skip = False
        if table_check:
            # Verificar se tabela/coluna já existe
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.cursor()
                try:
                    cursor.execute(f"SELECT {column_check} FROM {table_check} LIMIT 1")
                    should_skip = True
                except:
                    should_skip = False
        
        if should_skip:
            print(f"✓ Migration já aplicada: {migration_file}")
            migrations_skipped += 1
            continue
        
        print(f"Aplicando: {migration_file}...")
        
        if apply_migration(migration_path):
            migrations_applied += 1
        else:
            print(f"✗ Falha ao aplicar: {migration_file}")
            return 1
    
    print(f"\n✓ Migrations aplicadas: {migrations_applied}")
    if migrations_skipped > 0:
        print(f"⚠ Migrations já aplicadas: {migrations_skipped}")
    print("\n✓ Processo concluído com sucesso!")
    return 0

if __name__ == "__main__":
    exit(main())

