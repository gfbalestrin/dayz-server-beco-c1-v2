#!/bin/bash

handle_admin_kick() {
    local line="$1"
    local content="$2"

    INSERT_CUSTOM_LOG "Admin Kick detectado: $content" "INFO" "$ScriptName"

    # Remove horário do início (formato "HH:MM:SS " - 9 caracteres)
    local ProcessedContent
    ProcessedContent=$(echo "$content" | sed 's/^[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\} //')

    HANDLER_CONTENT="$ProcessedContent"
}

