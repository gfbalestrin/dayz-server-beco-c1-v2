#!/usr/bin/env python3
"""
Script de teste para validar conexão com bancos de dados
"""
import os
import sys
import sqlite3

def test_database(db_path, db_name):
    """Testa conexão com um banco de dados"""
    print(f"\n📊 Testando {db_name}...")
    
    if not os.path.exists(db_path):
        print(f"   ❌ Arquivo não encontrado: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Listar todas as tabelas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"   ✅ Conexão bem-sucedida!")
        print(f"   📋 Tabelas encontradas: {len(tables)}")
        for table in tables:
            print(f"      - {table[0]}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"   ❌ Erro ao conectar: {e}")
        return False

def main():
    """Função principal"""
    print("=" * 60)
    print("  Teste de Conexão - DayZ Admin Interface")
    print("=" * 60)
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    databases_dir = os.path.join(base_dir, "..", "databases")
    
    # Caminhos dos bancos
    db_players = os.path.join(databases_dir, "players_beco_c1.db")
    db_logs = os.path.join(databases_dir, "server_beco_c1_logs.db")
    
    success = True
    
    # Testar banco de jogadores
    if not test_database(db_players, "players_beco_c1.db"):
        success = False
    
    # Testar banco de logs
    if not test_database(db_logs, "server_beco_c1_logs.db"):
        success = False
    
    print("\n" + "=" * 60)
    if success:
        print("✅ Todos os bancos de dados estão acessíveis!")
        print("🚀 Você pode iniciar o servidor com: python3 app.py")
    else:
        print("❌ Alguns bancos de dados não foram encontrados.")
        print("   Verifique os caminhos em config.py")
    print("=" * 60)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
