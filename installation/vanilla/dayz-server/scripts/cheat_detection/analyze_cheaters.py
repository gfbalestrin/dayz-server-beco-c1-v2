#!/usr/bin/env python3
"""
Script de análise periódica para detecção de cheaters
Executar a cada 5-10 minutos via cron job
"""
import sys
import os

# Adicionar o diretório admin-interface ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'admin-interface'))

import database
import config
from datetime import datetime

def analyze_all_players(hours_back: int = 2):
    """Analisa todos os jogadores online para detectar atividades suspeitas"""
    
    # Buscar jogadores online
    online_players = database.get_online_players()
    
    if not online_players:
        print(f"[{datetime.now()}] Nenhum jogador online para analisar")
        return
    
    print(f"[{datetime.now()}] Iniciando análise de {len(online_players)} jogadores online...")
    
    total_events = 0
    players_with_events = 0
    
    for player in online_players:
        player_id = player.get('PlayerID')
        if not player_id:
            continue
        
        # Detectar teleportação/speed hack
        teleport_events = database.detect_teleportation(player_id, hours_back)
        for event in teleport_events:
            database.update_player_score(
                player_id,
                event['event_type'],
                event['score'],
                event['details']
            )
            total_events += 1
        
        # Detectar aimbot
        aimbot_events = database.detect_aimbot(player_id, hours_back)
        for event in aimbot_events:
            database.update_player_score(
                player_id,
                event['event_type'],
                event['score'],
                event['details']
            )
            total_events += 1
        
        # Detectar loot hack
        loot_hack_events = database.detect_loot_hack(player_id, hours_back)
        for event in loot_hack_events:
            database.update_player_score(
                player_id,
                event['event_type'],
                event['score'],
                event['details']
            )
            total_events += 1
        
        if len(teleport_events) > 0 or len(aimbot_events) > 0 or len(loot_hack_events) > 0:
            players_with_events += 1
    
    print(f"[{datetime.now()}] Análise concluída: {total_events} eventos detectados em {players_with_events} jogadores")
    
    # Verificar jogadores com score alto e gerar alertas
    high_risk_players = database.get_cheat_detection_scores(limit=50, risk_level='high_risk')
    critical_players = database.get_cheat_detection_scores(limit=50, risk_level='critical')
    
    if critical_players:
        print(f"[{datetime.now()}] ALERTA: {len(critical_players)} jogadores com risco CRÍTICO detectados!")
        for player in critical_players:
            print(f"  - {player.get('PlayerName', 'Unknown')} ({player.get('PlayerID')}): Score={player.get('TotalScore', 0):.2f}")
    
    if high_risk_players:
        print(f"[{datetime.now()}] {len(high_risk_players)} jogadores com risco ALTO detectados")
        for player in high_risk_players:
            print(f"  - {player.get('PlayerName', 'Unknown')} ({player.get('PlayerID')}): Score={player.get('TotalScore', 0):.2f}")

if __name__ == '__main__':
    try:
        # Analisar últimas 2 horas
        analyze_all_players(hours_back=2)
    except Exception as e:
        print(f"[{datetime.now()}] ERRO na análise: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

