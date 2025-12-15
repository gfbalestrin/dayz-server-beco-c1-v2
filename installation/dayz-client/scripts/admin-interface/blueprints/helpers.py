"""
Funções auxiliares compartilhadas entre blueprints
"""
from datetime import datetime
from zoneinfo import ZoneInfo
import os
import time
import re
import json
from database import get_active_vehicle_name_counts
import vehicle_limits

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

UTC_TZ = ZoneInfo("UTC")
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")


def convert_timestamp_to_br(timestamp_str):
    """Converte string de data/hora para America/Sao_Paulo"""
    if not timestamp_str:
        return None
    value = str(timestamp_str).strip()
    if value == "":
        return None
    
    normalized = value
    if value.endswith('Z'):
        normalized = value[:-1] + '+00:00'
    
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            cleaned = value.replace('T', ' ')
            dt = datetime.strptime(cleaned, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return value
    
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC_TZ)
    
    return dt.astimezone(SAO_PAULO_TZ).strftime('%Y-%m-%d %H:%M:%S')


def current_time_br():
    return datetime.now(SAO_PAULO_TZ).strftime('%Y-%m-%d %H:%M:%S')


def evaluate_vehicle_limit(vehicle_type: str):
    """Valida se é permitido spawnar o veículo considerando os limites do events.xml"""
    counts = get_active_vehicle_name_counts()
    limit_info = vehicle_limits.can_spawn_vehicle(vehicle_type, counts)
    allowed = limit_info.get('allowed', True)
    return allowed, limit_info


def format_limit_block_message(limit_info: dict) -> str:
    event_name = limit_info.get('event') or 'Evento desconhecido'
    current = limit_info.get('current')
    max_allowed = limit_info.get('max')
    if current is not None and max_allowed is not None:
        return f'Limite do {event_name} atingido ({current}/{max_allowed})'
    return f'Limite do {event_name} atingido'


def stream_log_file(log_path: str):
    """Gera eventos SSE com o conteúdo de um arquivo de log, simulando tail -F."""
    def iterator():
        log_descriptor = None
        current_position = 0
        last_heartbeat = time.time()
        heartbeat_interval = 10.0
        try:
            while True:
                if log_descriptor is None:
                    try:
                        log_descriptor = open(log_path, 'r', encoding='utf-8', errors='replace')
                        log_descriptor.seek(0, os.SEEK_END)
                        file_size = log_descriptor.tell()
                        if file_size > 0:
                            window_size = 16384
                            start_position = file_size - window_size
                            if start_position < 0:
                                start_position = 0
                            log_descriptor.seek(start_position, os.SEEK_SET)
                            if start_position > 0:
                                log_descriptor.readline()
                            for recent_line in log_descriptor.readlines():
                                sanitized_recent = recent_line.rstrip('\r\n')
                                yield f"data: {sanitized_recent}\n\n"
                            current_position = log_descriptor.tell()
                        else:
                            current_position = 0
                            yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                    except FileNotFoundError:
                        yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                        time.sleep(1.0)
                        continue
                    except Exception as open_error:
                        try:
                            from flask import current_app
                            current_app.logger.error(f'Falha ao abrir log {log_path}: {open_error}')
                        except:
                            print(f'Falha ao abrir log {log_path}: {open_error}')
                        yield "data: __heartbeat__\n\n"
                        last_heartbeat = time.time()
                        time.sleep(1.0)
                        continue
                line_text = log_descriptor.readline()
                if line_text:
                    current_position = log_descriptor.tell()
                    sanitized_line = line_text.rstrip('\r\n')
                    yield f"data: {sanitized_line}\n\n"
                    last_heartbeat = time.time()
                    continue
                time.sleep(0.5)
                try:
                    file_size = os.path.getsize(log_path)
                except FileNotFoundError:
                    log_descriptor.close()
                    log_descriptor = None
                    current_position = 0
                    continue
                except Exception as stat_error:
                    try:
                        from flask import current_app
                        current_app.logger.error(f'Falha ao verificar log {log_path}: {stat_error}')
                    except:
                        print(f'Falha ao verificar log {log_path}: {stat_error}')
                    continue
                if file_size < current_position:
                    log_descriptor.close()
                    log_descriptor = None
                    current_position = 0
                    yield "data: __heartbeat__\n\n"
                    last_heartbeat = time.time()
                    continue
                now = time.time()
                if now - last_heartbeat >= heartbeat_interval:
                    yield "data: __heartbeat__\n\n"
                    last_heartbeat = now
        finally:
            if log_descriptor:
                log_descriptor.close()
    return iterator()


def sanitize_loadout_name(name):
    """
    Sanitiza o nome do loadout para permitir apenas letras minúsculas, números e hífen.
    Substitui espaços por hífen e remove caracteres inválidos.
    
    Args:
        name: Nome do loadout a ser sanitizado
        
    Returns:
        str: Nome sanitizado ou None se estiver vazio após sanitização
    """
    if not name:
        return None
    
    # Converter para minúsculas
    sanitized = name.lower()
    
    # Substituir espaços (um ou mais) por um único hífen
    sanitized = re.sub(r'\s+', '-', sanitized)
    
    # Remover caracteres inválidos (manter apenas letras minúsculas, números e hífen)
    sanitized = re.sub(r'[^a-z0-9-]', '', sanitized)
    
    # Remover hífens múltiplos consecutivos
    sanitized = re.sub(r'-+', '-', sanitized)
    
    # Remover hífens no início e no fim
    sanitized = sanitized.strip('-')
    
    # Validar se está vazio após sanitização
    if not sanitized:
        return None
    
    # Validar formato final (apenas letras minúsculas, números e hífen)
    if not re.match(r'^[a-z0-9-]+$', sanitized):
        return None
    
    return sanitized


def build_weapon_kit_json(weapon_kit):
    """
    Monta JSON para weapon kit no formato aceito por createcontainer
    
    Estrutura:
    {
      "type": "WeaponName",
      "attachments": [
        {"type": "MagazineName"},
        {"type": "AttachmentName"},
        ...
      ]
    }
    """
    json_obj = {
        "type": weapon_kit['weapon_name_type']
    }
    
    attachments = []
    
    # Magazine primeiro
    if weapon_kit.get('magazine_name_type'):
        attachments.append({"type": weapon_kit['magazine_name_type']})
    
    # Attachments da arma
    for att in weapon_kit.get('attachments', []):
        attachments.append({"type": att['name_type']})
    
    if attachments:
        json_obj['attachments'] = attachments
    
    return json.dumps(json_obj, separators=(',', ':'))

