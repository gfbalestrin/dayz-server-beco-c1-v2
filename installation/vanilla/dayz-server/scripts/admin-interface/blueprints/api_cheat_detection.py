"""
Blueprint de API de Cheat Detection
Rotas de API para detecção de cheats
"""
from flask import Blueprint, request, jsonify, session
import json
from database import (
    get_cheat_detection_scores, get_player_cheat_details,
    get_cheat_detection_events, review_cheat_event,
    clear_player_cheat_events, log_user_action
)
from blueprints.auth import admin_required, get_client_ip
from blueprints.helpers import convert_timestamp_to_br, current_time_br

api_cheat_detection_bp = Blueprint('api_cheat_detection', __name__)


@api_cheat_detection_bp.route('/api/cheat-detection/scores', methods=['GET'])
@admin_required
def api_cheat_detection_scores():
    """Lista jogadores suspeitos ordenados por pontuação"""
    try:
        limit = int(request.args.get('limit', 100))
        risk_level = request.args.get('risk_level')
        
        scores = get_cheat_detection_scores(limit=limit, risk_level=risk_level if risk_level else None)
        for score in scores:
            score['LastUpdated'] = convert_timestamp_to_br(score.get('LastUpdated'))
            score['BannedAt'] = convert_timestamp_to_br(score.get('BannedAt'))
        
        return jsonify({
            'success': True,
            'scores': scores,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_cheat_detection_bp.route('/api/cheat-detection/player/<player_id>', methods=['GET'])
@admin_required
def api_cheat_detection_player(player_id):
    """Retorna detalhes completos de suspeição de um jogador"""
    try:
        details = get_player_cheat_details(player_id)
        
        if not details:
            return jsonify({'success': False, 'message': 'Jogador não encontrado'}), 404
        
        details['LastUpdated'] = convert_timestamp_to_br(details.get('LastUpdated'))
        details['BannedAt'] = convert_timestamp_to_br(details.get('BannedAt'))
        
        # Parse JSON details dos eventos e ajustar timezone
        for event in details.get('events', []):
            if event.get('Details'):
                try:
                    event['details_parsed'] = json.loads(event['Details'])
                except:
                    event['details_parsed'] = None
            event['TimeStamp'] = convert_timestamp_to_br(event.get('TimeStamp'))
        
        return jsonify({
            'success': True,
            'player': details,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_cheat_detection_bp.route('/api/cheat-detection/events', methods=['GET'])
@admin_required
def api_cheat_detection_events():
    """Lista eventos de detecção de cheaters"""
    try:
        limit = int(request.args.get('limit', 100))
        player_id = request.args.get('player_id')
        event_type = request.args.get('event_type')
        
        events = get_cheat_detection_events(
            player_id=player_id if player_id else None,
            limit=limit,
            event_type=event_type if event_type else None
        )
        
        # Parse JSON details
        for event in events:
            if event.get('Details'):
                try:
                    event['details_parsed'] = json.loads(event['Details'])
                except:
                    event['details_parsed'] = None
            event['TimeStamp'] = convert_timestamp_to_br(event.get('TimeStamp'))
        
        return jsonify({
            'success': True,
            'events': events,
            'timestamp': current_time_br()
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_cheat_detection_bp.route('/api/cheat-detection/review-event/<int:event_id>', methods=['POST'])
@admin_required
def api_cheat_detection_review_event(event_id):
    """Marca um evento como revisado"""
    try:
        data = request.get_json()
        review_result = data.get('review_result')  # 'confirmed' ou 'false_positive'
        reviewed_by = session.get('username', 'Unknown')
        
        if review_result not in ['confirmed', 'false_positive']:
            return jsonify({'success': False, 'message': 'review_result deve ser "confirmed" ou "false_positive"'}), 400
        
        success = review_cheat_event(event_id, reviewed_by, review_result)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Evento marcado como revisado com sucesso'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Erro ao marcar evento como revisado'
            }), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@api_cheat_detection_bp.route('/api/cheat-detection/player/<player_id>/clear', methods=['POST'])
@admin_required
def api_cheat_detection_clear_player(player_id):
    """Remove eventos e reseta score de um jogador"""
    try:
        success = clear_player_cheat_events(player_id)
        if success:
            log_user_action(
                session.get('user_id'),
                session.get('username', 'Unknown'),
                'CLEAR_CHEAT_EVENTS',
                {'player_id': player_id},
                get_client_ip()
            )
            message = 'Eventos e pontuação limpos com sucesso'
        else:
            message = 'Nenhum evento ou pontuação foi encontrado para este jogador'
        
        return jsonify({'success': True, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
