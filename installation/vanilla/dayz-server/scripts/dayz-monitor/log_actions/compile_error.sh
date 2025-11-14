#!/bin/bash

handle_compile_error() {
    local line="$1"
    local content="$2"

    INSERT_CUSTOM_LOG "Erro crítico de compilação detectado: $content" "ERROR" "$ScriptName"

    local ErrorMessage
    ErrorMessage="🚨 **ERRO CRÍTICO**: $content"

    HANDLER_CONTENT="$ErrorMessage"
}

