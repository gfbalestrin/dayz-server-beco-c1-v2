#!/bin/bash

handle_invalid_number_nan() {
    local line="$1"
    local content="$2"

    INSERT_CUSTOM_LOG "Erro crítico detectado - jogador bugado no respawn: $content" "ERROR" "$ScriptName"

    local ErrorMessage
    ErrorMessage="🚨 **ERRO CRÍTICO**: Jogador bugado no respawn - $content"

    HANDLER_CONTENT="$ErrorMessage"
}

