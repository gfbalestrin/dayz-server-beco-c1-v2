"""
Blueprint de API de Configurações do Servidor
Rotas de API para gerenciamento de configurações do servidor DayZ (cfggameplay.json)
"""
from flask import Blueprint, request, jsonify
import os
import json
import logging
import re
import config
from blueprints.auth import admin_required, super_admin_required

logger = logging.getLogger(__name__)

api_server_config_bp = Blueprint('api_server_config', __name__)


def _read_gameplay_config():
    """Lê o arquivo de configuração de gameplay"""
    with open(config.CFGGAMEPLAY_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def _write_gameplay_config(data):
    """Escreve o arquivo de configuração de gameplay"""
    with open(config.CFGGAMEPLAY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def _validate_gameplay_config(data):
    """Valida a estrutura e valores do arquivo de configuração"""
    errors = []
    
    # Validar estrutura básica
    if not isinstance(data, dict):
        errors.append("Configuração deve ser um objeto JSON")
        return errors
    
    # Validar version
    if 'version' not in data:
        errors.append("Campo 'version' é obrigatório")
    elif not isinstance(data['version'], int):
        errors.append("Campo 'version' deve ser um número inteiro")
    
    # Validar GeneralData
    if 'GeneralData' in data:
        general = data['GeneralData']
        if not isinstance(general, dict):
            errors.append("GeneralData deve ser um objeto")
        else:
            for key in ['disableBaseDamage', 'disableContainerDamage', 'disableRespawnDialog', 'disableRespawnInUnconsciousness']:
                if key in general and not isinstance(general[key], bool):
                    errors.append(f"GeneralData.{key} deve ser um booleano")
    
    # Validar PlayerData
    if 'PlayerData' in data:
        player = data['PlayerData']
        if not isinstance(player, dict):
            errors.append("PlayerData deve ser um objeto")
        else:
            # disablePersonalLight
            if 'disablePersonalLight' in player and not isinstance(player['disablePersonalLight'], bool):
                errors.append("PlayerData.disablePersonalLight deve ser um booleano")
            
            # StaminaData
            if 'StaminaData' in player:
                stamina = player['StaminaData']
                if not isinstance(stamina, dict):
                    errors.append("PlayerData.StaminaData deve ser um objeto")
                else:
                    stamina_fields = {
                        'sprintStaminaModifierErc': (float, 0.0, 10.0),
                        'sprintStaminaModifierCro': (float, 0.0, 10.0),
                        'staminaWeightLimitThreshold': (float, 0.0, 100000.0),
                        'staminaMax': (float, 0.0, 1000.0),
                        'staminaKgToStaminaPercentPenalty': (float, 0.0, 10.0),
                        'staminaMinCap': (float, 0.0, 100.0),
                        'sprintSwimmingStaminaModifier': (float, 0.0, 10.0),
                        'sprintLadderStaminaModifier': (float, 0.0, 10.0),
                        'meleeStaminaModifier': (float, 0.0, 10.0),
                        'obstacleTraversalStaminaModifier': (float, 0.0, 10.0),
                        'holdBreathStaminaModifier': (float, 0.0, 10.0)
                    }
                    for key, (type_check, min_val, max_val) in stamina_fields.items():
                        if key in stamina:
                            if not isinstance(stamina[key], (int, float)):
                                errors.append(f"PlayerData.StaminaData.{key} deve ser um número")
                            elif not (min_val <= float(stamina[key]) <= max_val):
                                errors.append(f"PlayerData.StaminaData.{key} deve estar entre {min_val} e {max_val}")
            
            # ShockHandlingData
            if 'ShockHandlingData' in player:
                shock = player['ShockHandlingData']
                if not isinstance(shock, dict):
                    errors.append("PlayerData.ShockHandlingData deve ser um objeto")
                else:
                    if 'shockRefillSpeedConscious' in shock:
                        if not isinstance(shock['shockRefillSpeedConscious'], (int, float)) or not (0.0 <= float(shock['shockRefillSpeedConscious']) <= 100.0):
                            errors.append("PlayerData.ShockHandlingData.shockRefillSpeedConscious deve ser um número entre 0.0 e 100.0")
                    if 'shockRefillSpeedUnconscious' in shock:
                        if not isinstance(shock['shockRefillSpeedUnconscious'], (int, float)) or not (0.0 <= float(shock['shockRefillSpeedUnconscious']) <= 100.0):
                            errors.append("PlayerData.ShockHandlingData.shockRefillSpeedUnconscious deve ser um número entre 0.0 e 100.0")
                    if 'allowRefillSpeedModifier' in shock and not isinstance(shock['allowRefillSpeedModifier'], bool):
                        errors.append("PlayerData.ShockHandlingData.allowRefillSpeedModifier deve ser um booleano")
            
            # MovementData
            if 'MovementData' in player:
                movement = player['MovementData']
                if not isinstance(movement, dict):
                    errors.append("PlayerData.MovementData deve ser um objeto")
                else:
                    movement_fields = {
                        'timeToStrafeJog': (float, 0.0, 10.0),
                        'rotationSpeedJog': (float, 0.0, 10.0),
                        'timeToSprint': (float, 0.0, 10.0),
                        'timeToStrafeSprint': (float, 0.0, 10.0),
                        'rotationSpeedSprint': (float, 0.0, 10.0)
                    }
                    for key, (type_check, min_val, max_val) in movement_fields.items():
                        if key in movement:
                            if not isinstance(movement[key], (int, float)):
                                errors.append(f"PlayerData.MovementData.{key} deve ser um número")
                            elif not (min_val <= float(movement[key]) <= max_val):
                                errors.append(f"PlayerData.MovementData.{key} deve estar entre {min_val} e {max_val}")
                    if 'allowStaminaAffectInertia' in movement and not isinstance(movement['allowStaminaAffectInertia'], bool):
                        errors.append("PlayerData.MovementData.allowStaminaAffectInertia deve ser um booleano")
            
            # DrowningData
            if 'DrowningData' in player:
                drowning = player['DrowningData']
                if not isinstance(drowning, dict):
                    errors.append("PlayerData.DrowningData deve ser um objeto")
                else:
                    drowning_fields = {
                        'staminaDepletionSpeed': (float, 0.0, 100.0),
                        'healthDepletionSpeed': (float, 0.0, 100.0),
                        'shockDepletionSpeed': (float, 0.0, 100.0)
                    }
                    for key, (type_check, min_val, max_val) in drowning_fields.items():
                        if key in drowning:
                            if not isinstance(drowning[key], (int, float)):
                                errors.append(f"PlayerData.DrowningData.{key} deve ser um número")
                            elif not (min_val <= float(drowning[key]) <= max_val):
                                errors.append(f"PlayerData.DrowningData.{key} deve estar entre {min_val} e {max_val}")
            
            # WeaponObstructionData
            if 'WeaponObstructionData' in player:
                weapon = player['WeaponObstructionData']
                if not isinstance(weapon, dict):
                    errors.append("PlayerData.WeaponObstructionData deve ser um objeto")
                else:
                    if 'staticMode' in weapon:
                        val = weapon['staticMode']
                        if not isinstance(val, int) or not (0 <= val <= 2):
                            errors.append("PlayerData.WeaponObstructionData.staticMode deve ser um inteiro entre 0 e 2")
                    if 'dynamicMode' in weapon:
                        val = weapon['dynamicMode']
                        if not isinstance(val, int) or not (0 <= val <= 2):
                            errors.append("PlayerData.WeaponObstructionData.dynamicMode deve ser um inteiro entre 0 e 2")
    
    # Validar WorldsData
    if 'WorldsData' in data:
        worlds = data['WorldsData']
        if not isinstance(worlds, dict):
            errors.append("WorldsData deve ser um objeto")
        else:
            if 'lightingConfig' in worlds:
                val = worlds['lightingConfig']
                if not isinstance(val, int) or not (0 <= val <= 2):
                    errors.append("WorldsData.lightingConfig deve ser um inteiro entre 0 e 2")
            if 'objectSpawnersArr' in worlds and not isinstance(worlds['objectSpawnersArr'], list):
                errors.append("WorldsData.objectSpawnersArr deve ser um array")
            if 'environmentMinTemps' in worlds:
                temps = worlds['environmentMinTemps']
                if not isinstance(temps, list) or len(temps) != 12:
                    errors.append("WorldsData.environmentMinTemps deve ser um array com 12 elementos")
                else:
                    for i, temp in enumerate(temps):
                        if not isinstance(temp, (int, float)):
                            errors.append(f"WorldsData.environmentMinTemps[{i}] deve ser um número")
            if 'environmentMaxTemps' in worlds:
                temps = worlds['environmentMaxTemps']
                if not isinstance(temps, list) or len(temps) != 12:
                    errors.append("WorldsData.environmentMaxTemps deve ser um array com 12 elementos")
                else:
                    for i, temp in enumerate(temps):
                        if not isinstance(temp, (int, float)):
                            errors.append(f"WorldsData.environmentMaxTemps[{i}] deve ser um número")
            if 'wetnessWeightModifiers' in worlds:
                modifiers = worlds['wetnessWeightModifiers']
                if not isinstance(modifiers, list) or len(modifiers) != 5:
                    errors.append("WorldsData.wetnessWeightModifiers deve ser um array com 5 elementos")
                else:
                    for i, mod in enumerate(modifiers):
                        if not isinstance(mod, (int, float)) or not (0.0 <= float(mod) <= 10.0):
                            errors.append(f"WorldsData.wetnessWeightModifiers[{i}] deve ser um número entre 0.0 e 10.0")
    
    # Validar BaseBuildingData
    if 'BaseBuildingData' in data:
        building = data['BaseBuildingData']
        if not isinstance(building, dict):
            errors.append("BaseBuildingData deve ser um objeto")
        else:
            # HologramData
            if 'HologramData' in building:
                hologram = building['HologramData']
                if not isinstance(hologram, dict):
                    errors.append("BaseBuildingData.HologramData deve ser um objeto")
                else:
                    hologram_bool_fields = [
                        'disableIsCollidingBBoxCheck', 'disableIsCollidingPlayerCheck',
                        'disableIsClippingRoofCheck', 'disableIsBaseViableCheck',
                        'disableIsCollidingGPlotCheck', 'disableIsCollidingAngleCheck',
                        'disableIsPlacementPermittedCheck', 'disableHeightPlacementCheck',
                        'disableIsUnderwaterCheck', 'disableIsInTerrainCheck',
                        'disableColdAreaBuildingCheck'
                    ]
                    for key in hologram_bool_fields:
                        if key in hologram and not isinstance(hologram[key], bool):
                            errors.append(f"BaseBuildingData.HologramData.{key} deve ser um booleano")
                    if 'disallowedTypesInUnderground' in hologram:
                        if not isinstance(hologram['disallowedTypesInUnderground'], list):
                            errors.append("BaseBuildingData.HologramData.disallowedTypesInUnderground deve ser um array")
                        else:
                            for item in hologram['disallowedTypesInUnderground']:
                                if not isinstance(item, str):
                                    errors.append("BaseBuildingData.HologramData.disallowedTypesInUnderground deve conter apenas strings")
            
            # ConstructionData
            if 'ConstructionData' in building:
                construction = building['ConstructionData']
                if not isinstance(construction, dict):
                    errors.append("BaseBuildingData.ConstructionData deve ser um objeto")
                else:
                    construction_bool_fields = [
                        'disablePerformRoofCheck', 'disableIsCollidingCheck', 'disableDistanceCheck'
                    ]
                    for key in construction_bool_fields:
                        if key in construction and not isinstance(construction[key], bool):
                            errors.append(f"BaseBuildingData.ConstructionData.{key} deve ser um booleano")
    
    # Validar UIData
    if 'UIData' in data:
        ui = data['UIData']
        if not isinstance(ui, dict):
            errors.append("UIData deve ser um objeto")
        else:
            if 'use3DMap' in ui and not isinstance(ui['use3DMap'], bool):
                errors.append("UIData.use3DMap deve ser um booleano")
            
            # HitIndicationData
            if 'HitIndicationData' in ui:
                hit = ui['HitIndicationData']
                if not isinstance(hit, dict):
                    errors.append("UIData.HitIndicationData deve ser um objeto")
                else:
                    if 'hitDirectionOverrideEnabled' in hit and not isinstance(hit['hitDirectionOverrideEnabled'], bool):
                        errors.append("UIData.HitIndicationData.hitDirectionOverrideEnabled deve ser um booleano")
                    if 'hitDirectionBehaviour' in hit:
                        val = hit['hitDirectionBehaviour']
                        if not isinstance(val, int) or not (0 <= val <= 2):
                            errors.append("UIData.HitIndicationData.hitDirectionBehaviour deve ser um inteiro entre 0 e 2")
                    if 'hitDirectionStyle' in hit:
                        val = hit['hitDirectionStyle']
                        if not isinstance(val, int) or not (0 <= val <= 2):
                            errors.append("UIData.HitIndicationData.hitDirectionStyle deve ser um inteiro entre 0 e 2")
                    if 'hitDirectionIndicatorColorStr' in hit and not isinstance(hit['hitDirectionIndicatorColorStr'], str):
                        errors.append("UIData.HitIndicationData.hitDirectionIndicatorColorStr deve ser uma string")
                    if 'hitDirectionMaxDuration' in hit:
                        if not isinstance(hit['hitDirectionMaxDuration'], (int, float)) or not (0.0 <= float(hit['hitDirectionMaxDuration']) <= 10.0):
                            errors.append("UIData.HitIndicationData.hitDirectionMaxDuration deve ser um número entre 0.0 e 10.0")
                    if 'hitDirectionBreakPointRelative' in hit:
                        if not isinstance(hit['hitDirectionBreakPointRelative'], (int, float)) or not (0.0 <= float(hit['hitDirectionBreakPointRelative']) <= 1.0):
                            errors.append("UIData.HitIndicationData.hitDirectionBreakPointRelative deve ser um número entre 0.0 e 1.0")
                    if 'hitDirectionScatter' in hit:
                        if not isinstance(hit['hitDirectionScatter'], (int, float)) or not (0.0 <= float(hit['hitDirectionScatter']) <= 100.0):
                            errors.append("UIData.HitIndicationData.hitDirectionScatter deve ser um número entre 0.0 e 100.0")
                    if 'hitIndicationPostProcessEnabled' in hit and not isinstance(hit['hitIndicationPostProcessEnabled'], bool):
                        errors.append("UIData.HitIndicationData.hitIndicationPostProcessEnabled deve ser um booleano")
    
    # Validar MapData
    if 'MapData' in data:
        map_data = data['MapData']
        if not isinstance(map_data, dict):
            errors.append("MapData deve ser um objeto")
        else:
            map_bool_fields = [
                'ignoreMapOwnership', 'ignoreNavItemsOwnership',
                'displayPlayerPosition', 'displayNavInfo'
            ]
            for key in map_bool_fields:
                if key in map_data and not isinstance(map_data[key], bool):
                    errors.append(f"MapData.{key} deve ser um booleano")
    
    # Validar VehicleData
    if 'VehicleData' in data:
        vehicle = data['VehicleData']
        if not isinstance(vehicle, dict):
            errors.append("VehicleData deve ser um objeto")
        else:
            if 'boatDecayMultiplier' in vehicle:
                val = vehicle['boatDecayMultiplier']
                if not isinstance(val, (int, float)) or not (0.0 <= float(val) <= 10.0):
                    errors.append("VehicleData.boatDecayMultiplier deve ser um número entre 0.0 e 10.0")
    
    return errors


@api_server_config_bp.route('/api/server-config/gameplay', methods=['GET'])
@admin_required
def api_get_gameplay_config():
    """Retorna as configurações atuais de gameplay"""
    try:
        if not os.path.exists(config.CFGGAMEPLAY_FILE):
            return jsonify({'error': 'Arquivo de configuração não encontrado'}), 404
        
        data = _read_gameplay_config()
        return jsonify(data)
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON: {e}")
        return jsonify({'error': f'Erro ao decodificar JSON: {str(e)}'}), 500
    except Exception as e:
        logger.exception(f"Erro ao ler configuração: {e}")
        return jsonify({'error': f'Falha ao ler configuração: {str(e)}'}), 500


@api_server_config_bp.route('/api/server-config/gameplay', methods=['POST'])
@super_admin_required
def api_save_gameplay_config():
    """Salva as configurações de gameplay com validação"""
    try:
        payload = request.get_json(silent=True)
        if not payload:
            return jsonify({'error': 'Dados JSON inválidos ou vazios'}), 400
        
        # Validar configuração
        errors = _validate_gameplay_config(payload)
        if errors:
            return jsonify({'error': 'Erros de validação', 'details': errors}), 400
        
        # Salvar configuração
        _write_gameplay_config(payload)
        
        return jsonify({'message': 'Configuração salva com sucesso'})
    except Exception as e:
        logger.exception(f"Erro ao salvar configuração: {e}")
        return jsonify({'error': f'Falha ao salvar configuração: {str(e)}'}), 500


# ============================================================================
# FUNÇÕES PARA SERVERDZ.CFG
# ============================================================================

def _read_serverdz_config():
    """Lê e faz parse do arquivo serverDZ.cfg"""
    config_data = {}
    original_lines = []
    
    try:
        with open(config.SERVERDZ_CFG_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            original_lines = lines.copy()
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Pular linhas vazias e comentários completos
            if not line or line.startswith('//'):
                i += 1
                continue
            
            # Parse de arrays (motd[])
            if '[]' in line:
                key = line.split('[]')[0].strip()
                # Encontrar o conteúdo do array
                array_start = line.find('{')
                if array_start == -1:
                    # Array pode estar na próxima linha
                    i += 1
                    if i < len(lines):
                        line = lines[i].strip()
                        array_start = line.find('{')
                
                if array_start != -1:
                    array_content = line[array_start:]
                    # Continuar nas próximas linhas se necessário
                    while '}' not in array_content and i + 1 < len(lines):
                        i += 1
                        array_content += ' ' + lines[i].strip()
                    
                    # Extrair valores do array
                    array_values = []
                    if '{' in array_content and '}' in array_content:
                        array_str = array_content[array_content.find('{')+1:array_content.find('}')]
                        # Parse de strings entre aspas
                        array_values = re.findall(r'"([^"]*)"', array_str)
                    
                    config_data[key] = array_values
                i += 1
                continue
            
            # Parse de blocos (class Missions)
            if line.startswith('class '):
                class_name = line.split()[1].split('{')[0].strip()
                # Procurar por template dentro do bloco
                i += 1
                while i < len(lines) and '}' not in lines[i]:
                    inner_line = lines[i].strip()
                    if 'template=' in inner_line:
                        # Extrair valor do template
                        template_match = re.search(r'template="([^"]+)"', inner_line)
                        if template_match:
                            config_data['missionTemplate'] = template_match.group(1)
                    i += 1
                i += 1
                continue
            
            # Parse de linhas de configuração normais (chave = valor;)
            if '=' in line:
                # Remover comentário inline
                if '//' in line:
                    line = line[:line.index('//')].strip()
                
                # Remover ponto e vírgula final
                if line.endswith(';'):
                    line = line[:-1].strip()
                
                parts = line.split('=', 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    value = parts[1].strip()
                    
                    # Remover aspas de strings
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    # Converter números
                    elif value.isdigit():
                        value = int(value)
                    elif '.' in value and value.replace('.', '').isdigit():
                        value = float(value)
                    # Converter booleanos (0/1)
                    elif value in ['0', '1']:
                        value = int(value)
                    
                    config_data[key] = value
            
            i += 1
        
        return config_data
    except Exception as e:
        logger.exception(f"Erro ao ler serverDZ.cfg: {e}")
        raise


def _write_serverdz_config(data):
    """Escreve o arquivo serverDZ.cfg mantendo formato e comentários"""
    import re
    
    # Ler arquivo original para preservar comentários e estrutura
    try:
        with open(config.SERVERDZ_CFG_FILE, 'r', encoding='utf-8') as f:
            original_lines = f.readlines()
    except:
        original_lines = []
    
    output_lines = []
    i = 0
    in_motd_array = False
    in_missions_block = False
    
    while i < len(original_lines):
        line = original_lines[i]
        stripped = line.strip()
        
        # Preservar comentários completos e linhas vazias
        if not stripped or stripped.startswith('//'):
            output_lines.append(line)
            i += 1
            continue
        
        # Processar array motd[]
        if 'motd[]' in stripped:
            # Manter indentação original
            indent = len(line) - len(line.lstrip())
            output_lines.append(' ' * indent + 'motd[] = { ')
            if 'motd' in data and isinstance(data['motd'], list):
                motd_values = data['motd']
                if motd_values:
                    for j, val in enumerate(motd_values):
                        if j > 0:
                            output_lines.append(', ')
                        output_lines.append(f'"{val}"')
                else:
                    output_lines.append('""')
            else:
                # Tentar extrair do original
                array_match = re.search(r'\{([^}]+)\}', stripped)
                if array_match:
                    output_lines.append(array_match.group(1))
                else:
                    output_lines.append('""')
            output_lines.append(' };\n')
            i += 1
            continue
        
        # Processar bloco class Missions
        if stripped.startswith('class Missions'):
            output_lines.append(line)
            i += 1
            # Adicionar linha de abertura se não existir
            if '{' not in stripped:
                output_lines.append('{\n')
            
            # Processar linhas dentro do bloco
            while i < len(original_lines) and '}' not in original_lines[i]:
                inner_line = original_lines[i]
                if 'template=' in inner_line:
                    template = data.get('missionTemplate', 'dayzOffline.chernarusplus')
                    output_lines.append(f'        template="{template}"; // Mission to load on server startup. <MissionName>.<TerrainName>\n')
                    output_lines.append('                                      // Vanilla mission: dayzOffline.chernarusplus\n')
                    output_lines.append('                                      // DLC mission: dayzOffline.enoch\n')
                    i += 1
                    # Pular comentários relacionados
                    while i < len(original_lines) and (original_lines[i].strip().startswith('//') or not original_lines[i].strip()):
                        i += 1
                    continue
                else:
                    output_lines.append(inner_line)
                i += 1
            
            # Adicionar fechamento do bloco
            if i < len(original_lines):
                output_lines.append(original_lines[i])
            i += 1
            continue
        
        # Processar linhas de configuração normais
        if '=' in stripped:
            # Remover comentário inline para processar
            comment = ''
            if '//' in stripped:
                comment_part = stripped[stripped.index('//'):]
                stripped = stripped[:stripped.index('//')].strip()
                comment = ' ' + comment_part
            
            if stripped.endswith(';'):
                stripped = stripped[:-1].strip()
            
            parts = stripped.split('=', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                if key in data:
                    value = data[key]
                    # Formatar valor
                    if isinstance(value, str):
                        formatted_value = f'"{value}"'
                    elif isinstance(value, bool):
                        formatted_value = '1' if value else '0'
                    else:
                        formatted_value = str(value)
                    
                    # Manter indentação original
                    indent = len(line) - len(line.lstrip())
                    output_lines.append(' ' * indent + f'{key} = {formatted_value};{comment}\n')
                    i += 1
                    continue
        
        # Linha não processada, manter original
        output_lines.append(line)
        i += 1
    
    # Escrever arquivo
    with open(config.SERVERDZ_CFG_FILE, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)


@api_server_config_bp.route('/api/server-config/serverdz', methods=['GET'])
@admin_required
def api_get_serverdz_config():
    """Retorna as configurações atuais do serverDZ.cfg"""
    try:
        if not os.path.exists(config.SERVERDZ_CFG_FILE):
            return jsonify({'error': 'Arquivo de configuração não encontrado'}), 404
        
        data = _read_serverdz_config()
        return jsonify(data)
    except Exception as e:
        logger.exception(f"Erro ao ler configuração serverDZ.cfg: {e}")
        return jsonify({'error': f'Falha ao ler configuração: {str(e)}'}), 500


@api_server_config_bp.route('/api/server-config/serverdz', methods=['POST'])
@super_admin_required
def api_save_serverdz_config():
    """Salva as configurações do serverDZ.cfg"""
    try:
        payload = request.get_json(silent=True)
        if not payload:
            return jsonify({'error': 'Dados JSON inválidos ou vazios'}), 400
        
        # Salvar configuração
        _write_serverdz_config(payload)
        
        return jsonify({'message': 'Configuração salva com sucesso'})
    except Exception as e:
        logger.exception(f"Erro ao salvar configuração serverDZ.cfg: {e}")
        return jsonify({'error': f'Falha ao salvar configuração: {str(e)}'}), 500

