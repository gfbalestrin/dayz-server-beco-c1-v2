#!/bin/bash

# Script para gerenciar eventos sazonais do DayZ
# Uso: ./economy_update.sh [christmas|halloween|valentines|payday|default]

# Carrega as variáveis
source ./config.sh

# ============================================================================
# CONFIGURAÇÕES DE DATAS DOS EVENTOS
# ============================================================================

# Christmas: 15 de Dezembro até 31 de Dezembro
CHRISTMAS_START_MONTH=12
CHRISTMAS_START_DAY=15
CHRISTMAS_END_MONTH=12
CHRISTMAS_END_DAY=31

# Halloween: 20 de Outubro até 31 de Outubro
HALLOWEEN_START_MONTH=10
HALLOWEEN_START_DAY=20
HALLOWEEN_END_MONTH=10
HALLOWEEN_END_DAY=31

# Valentine's: 10 de Fevereiro até 14 de Fevereiro
VALENTINES_START_MONTH=2
VALENTINES_START_DAY=10
VALENTINES_END_MONTH=2
VALENTINES_END_DAY=14

# Payday: 25 a 28 de cada mês
PAYDAY_START_DAY=25
PAYDAY_END_DAY=28

# ============================================================================
# CONFIGURAÇÕES DE DIRETÓRIOS
# ============================================================================

REPO_URL="https://github.com/BohemiaInteractive/DayZ-Central-Economy.git"
REPO_DIR="$AppFolder/DayZ-Central-Economy"
DEST_DIR="$DayzServerFolder/$DayzMapFolder"

# ============================================================================
# FUNÇÕES DE LOG
# ============================================================================

LOG_INFO() {
    INSERT_CUSTOM_LOG "$1" "INFO" "economy_update.sh"
}

LOG_ERROR() {
    INSERT_CUSTOM_LOG "$1" "ERROR" "economy_update.sh"
}

LOG_DEBUG() {
    INSERT_CUSTOM_LOG "$1" "DEBUG" "economy_update.sh"
}

# ============================================================================
# FUNÇÕES DE REPOSITÓRIO GIT
# ============================================================================

update_repository() {
    LOG_INFO "Verificando repositório DayZ-Central-Economy..."
    
    if [ ! -d "$REPO_DIR" ]; then
        LOG_INFO "Repositório não encontrado. Clonando do GitHub..."
        
        if git clone "$REPO_URL" "$REPO_DIR"; then
            LOG_INFO "Repositório clonado com sucesso!"
            return 0
        else
            LOG_ERROR "Falha ao clonar repositório do GitHub!"
            return 1
        fi
    else
        LOG_INFO "Repositório encontrado. Atualizando com git pull..."
        
        cd "$REPO_DIR" || return 1
        
        if git pull; then
            LOG_INFO "Repositório atualizado com sucesso!"
            cd - > /dev/null || return 1
            return 0
        else
            LOG_ERROR "Falha ao atualizar repositório com git pull!"
            cd - > /dev/null || return 1
            return 1
        fi
    fi
}

# ============================================================================
# FUNÇÕES DE DETECÇÃO DE EVENTOS
# ============================================================================

detect_active_event() {
    local current_month=$(date +%-m)
    local current_day=$(date +%-d)
    
    LOG_DEBUG "Data atual: $current_day/$current_month"
    
    # Verificar Christmas
    if [ "$current_month" -eq "$CHRISTMAS_START_MONTH" ]; then
        if [ "$current_day" -ge "$CHRISTMAS_START_DAY" ] && [ "$current_day" -le "$CHRISTMAS_END_DAY" ]; then
            echo "christmas"
            return 0
        fi
    fi
    
    # Verificar Halloween
    if [ "$current_month" -eq "$HALLOWEEN_START_MONTH" ]; then
        if [ "$current_day" -ge "$HALLOWEEN_START_DAY" ] && [ "$current_day" -le "$HALLOWEEN_END_DAY" ]; then
            echo "halloween"
            return 0
        fi
    fi
    
    # Verificar Valentine's
    if [ "$current_month" -eq "$VALENTINES_START_MONTH" ]; then
        if [ "$current_day" -ge "$VALENTINES_START_DAY" ] && [ "$current_day" -le "$VALENTINES_END_DAY" ]; then
            echo "valentines"
            return 0
        fi
    fi
    
    # Verificar Payday (qualquer mês)
    if [ "$current_day" -ge "$PAYDAY_START_DAY" ] && [ "$current_day" -le "$PAYDAY_END_DAY" ]; then
        echo "payday"
        return 0
    fi
    
    # Nenhum evento ativo
    echo "default"
    return 0
}

# ============================================================================
# FUNÇÕES DE CÓPIA DE ARQUIVOS
# ============================================================================

copy_files() {
    local event=$1
    local source_dir=""
    local files_to_copy=()
    
    case "$event" in
        "christmas")
            source_dir="$REPO_DIR/ChristmasOffline.ChernarusPlus"
            files_to_copy=(
                "db/events.xml"
                "db/types.xml"
                "cfgrandompresets.xml"
            )
            ;;
        "halloween")
            source_dir="$REPO_DIR/halloweenOffline.ChernarusPlus"
            files_to_copy=(
                "db/events.xml"
                "db/types.xml"
                "env/zombie_territories.xml"
                "cfgeffectarea.json"
                "cfgspawnabletypes.xml"
            )
            ;;
        "valentines")
            source_dir="$REPO_DIR/valentinesOffline.ChernarusPlus"
            files_to_copy=(
                "db/types.xml"
            )
            ;;
        "payday")
            source_dir="$REPO_DIR/PaydayOffline.ChernarusPlus"
            files_to_copy=(
                "db/types.xml"
            )
            ;;
        "default")
            source_dir="$REPO_DIR/dayzOffline.chernarusplus"
            # Copiar todos os arquivos do diretório padrão
            files_to_copy=(
                "db/economy.xml"
                "db/events.xml"
                "db/globals.xml"
                "db/messages.xml"
                "db/types.xml"
                "env/bear_territories.xml"
                "env/cattle_territories.xml"
                "env/domestic_animals_territories.xml"
                "env/fox_territories.xml"
                "env/hare_territories.xml"
                "env/hen_territories.xml"
                "env/pig_territories.xml"
                "env/red_deer_territories.xml"
                "env/roe_deer_territories.xml"
                "env/sheep_goat_territories.xml"
                "env/wild_boar_territories.xml"
                "env/wolf_territories.xml"
                "env/zombie_territories.xml"
                "areaflags.map"
                "cfgEffectArea.json"
                "cfgIgnoreList.xml"
                "cfgeconomycore.xml"
                "cfgenvironment.xml"
                "cfgeventgroups.xml"
                "cfgeventspawns.xml"
                "cfggameplay.json"
                "cfglimitsdefinition.xml"
                "cfglimitsdefinitionuser.xml"
                "cfgplayerspawnpoints.xml"
                "cfgrandompresets.xml"
                "cfgspawnabletypes.xml"
                "cfgundergroundtriggers.json"
                "cfgweather.xml"
                "mapclusterproto.xml"
                "mapgroupcluster.xml"
                "mapgroupcluster01.xml"
                "mapgroupcluster02.xml"
                "mapgroupcluster03.xml"
                "mapgroupcluster04.xml"
                "mapgroupdirt.xml"
                "mapgrouppos.xml"
                "mapgroupproto.xml"
            )
            ;;
        *)
            LOG_ERROR "Evento desconhecido: $event"
            return 1
            ;;
    esac
    
    if [ ! -d "$source_dir" ]; then
        LOG_ERROR "Diretório de origem não encontrado: $source_dir"
        return 1
    fi
    
    LOG_INFO "Copiando arquivos para evento: $event"
    LOG_DEBUG "Origem: $source_dir"
    LOG_DEBUG "Destino: $DEST_DIR"
    
    local files_copied=0
    local files_failed=0
    
    for file in "${files_to_copy[@]}"; do
        local source_file="$source_dir/$file"
        local dest_file="$DEST_DIR/$file"
        local dest_dir=$(dirname "$dest_file")
        
        if [ -f "$source_file" ]; then
            # Criar diretório de destino se não existir
            mkdir -p "$dest_dir"
            
            # Verificar se o arquivo de destino já existe para preservar permissões e dono
            if [ -f "$dest_file" ]; then
                # Obter permissões, dono e grupo do arquivo de destino atual
                local current_perms=$(stat -c "%a" "$dest_file")
                local current_owner=$(stat -c "%U" "$dest_file")
                local current_group=$(stat -c "%G" "$dest_file")
                
                # Copiar o arquivo
                if cp "$source_file" "$dest_file" 2>/dev/null; then
                    # Restaurar permissões, dono e grupo
                    chmod "$current_perms" "$dest_file" 2>/dev/null
                    chown "$current_owner:$current_group" "$dest_file" 2>/dev/null
                    
                    files_copied=$((files_copied + 1))
                    LOG_DEBUG "Copiado: $file (perm: $current_perms, owner: $current_owner:$current_group)"
                else
                    files_failed=$((files_failed + 1))
                    LOG_ERROR "Falha ao copiar: $file"
                fi
            else
                # Arquivo novo - copiar e manter permissões padrão do diretório
                if cp "$source_file" "$dest_file" 2>/dev/null; then
                    files_copied=$((files_copied + 1))
                    LOG_DEBUG "Copiado: $file (arquivo novo)"
                else
                    files_failed=$((files_failed + 1))
                    LOG_ERROR "Falha ao copiar: $file"
                fi
            fi
        else
            LOG_ERROR "Arquivo não encontrado: $source_file"
            files_failed=$((files_failed + 1))
        fi
    done
    
    if [ "$files_failed" -eq 0 ]; then
        LOG_INFO "Arquivos copiados com sucesso! Total: $files_copied"
        return 0
    else
        LOG_ERROR "Alguns arquivos falharam ao copiar. Sucesso: $files_copied, Falhas: $files_failed"
        return 1
    fi
}

# ============================================================================
# VALIDAÇÕES
# ============================================================================

validate_directories() {
    if [ ! -d "$DayzServerFolder" ]; then
        LOG_ERROR "Diretório do servidor não encontrado: $DayzServerFolder"
        return 1
    fi
    
    if [ ! -d "$DEST_DIR" ]; then
        LOG_ERROR "Diretório de destino não encontrado: $DEST_DIR"
        return 1
    fi
    
    LOG_INFO "Diretórios validados com sucesso"
    return 0
}

# ============================================================================
# FUNÇÃO PRINCIPAL
# ============================================================================

main() {
    local selected_event=""
    
    # Processar parâmetros de linha de comando
    if [ $# -eq 0 ]; then
        selected_event=$(detect_active_event)
        LOG_INFO "Nenhum parâmetro fornecido. Detectando evento pela data atual: $selected_event"
    else
        case "$1" in
            "christmas"|"halloween"|"valentines"|"payday"|"default")
                selected_event="$1"
                LOG_INFO "Evento selecionado via parâmetro: $selected_event"
                ;;
            *)
                LOG_ERROR "Parâmetro inválido: $1"
                echo "Uso: $0 [christmas|halloween|valentines|payday|default]"
                exit 1
                ;;
        esac
    fi
    
    LOG_INFO "Iniciando atualização de economia para evento: $selected_event"
    
    # Validar diretórios
    if ! validate_directories; then
        exit 1
    fi
    
    # Atualizar repositório
    if ! update_repository; then
        LOG_ERROR "Falha ao atualizar repositório. Abortando."
        exit 1
    fi
    
    # Copiar arquivos do evento
    if ! copy_files "$selected_event"; then
        LOG_ERROR "Falha ao copiar arquivos. Verifique os logs."
        exit 1
    fi
    
    LOG_INFO "Atualização de economia concluída com sucesso para evento: $selected_event"
    echo "✅ Evento aplicado: $selected_event"
}

# Executar função principal
main "$@"
