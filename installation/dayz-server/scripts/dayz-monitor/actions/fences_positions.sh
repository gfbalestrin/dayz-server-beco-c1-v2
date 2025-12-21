#!/bin/bash

handle_fences_positions() {
    local line="$1"
    local captured_timestamp="$2"  # Timestamp capturado no momento da leitura

    echo ">> Recebendo posições das portões: $line"

    local current_timestamp CurrentDate
    # Se timestamp não foi fornecido, usar timestamp atual como fallback
    if [[ -n "$captured_timestamp" ]]; then
        current_timestamp="$captured_timestamp"
    else
        current_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi
    CurrentDate=$(date "+%d/%m/%Y %H:%M:%S")

    # Toda lógica SQLite foi movida para o consumer no servidor de monitoramento
    # Aqui apenas publicamos o JSON original no RabbitMQ

    if ! echo "$line" | jq -e '.fence_data' >/dev/null 2>&1; then
        echo ">> Nenhum fence encontrado no JSON"
        INSERT_CUSTOM_LOG "JSON de fences vazio ou inválido" "INFO" "$ScriptName"
        return
    fi

    # Publicar dados no RabbitMQ (toda lógica SQLite será feita no consumer)
    local fence_count
    fence_count=$(echo "$line" | jq '.fence_data | length // 0')
    
    if [[ -n "$line" ]]; then
        local rabbitmq_payload
        rabbitmq_payload=$(echo "$line" | jq -c . 2>/dev/null)
        if [[ -n "$rabbitmq_payload" ]]; then
            PUBLISH_TO_RABBITMQ "data.structures.positions" "$rabbitmq_payload"
            INSERT_CUSTOM_LOG "Dados de fences publicados no RabbitMQ (fences: $fence_count)" "INFO" "$ScriptName"
        fi
    fi
}

