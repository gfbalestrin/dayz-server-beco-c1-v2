#!/bin/bash

# Caminho do ambiente virtual
VENV_DIR="./venv"

# Ativa config
source ./config.sh 2>/dev/null || {
  echo '{"error": "Falha ao carregar config.sh"}'
  exit 1
}

URL_LOADOUT="$AppUrlAppLoadout"
DAYZ_ITEMS_DB="$AppFolder/$AppDayzItemsDbFile"
PLAYERS_BECO_C1_DB="$AppFolder/$AppPlayerBecoC1DbFile"
CURRENT_DATE=$(date "+%d/%m/%Y %H:%M:%S")

# Função de ajuda
usage() {
  echo "Uso: $0 [--player-id \"ID_DO_JOGADOR\"] [--reset-password] [--loadout-name \"NOME\"] [--active]"
  exit 1
}

# Variáveis de controle
PLAYER_ID=""
RESET_PASSWORD=0
LOADOUT_NAME=""
ACTIVATE_LOADOUT=0

# Processa os argumentos
while [[ "$#" -gt 0 ]]; do
  case "$1" in
  --player-id)
    PLAYER_ID="$2"
    shift 2
    ;;
  --reset-password)
    RESET_PASSWORD=1
    shift
    ;;
  --loadout-name)
    LOADOUT_NAME="$2"
    shift 2
    ;;
  --active)
    ACTIVATE_LOADOUT=1
    shift
    ;;
  *)
    echo "{\"error\": \"Parâmetro desconhecido: $1\"}"
    usage
    ;;
  esac
done

# Valida player_id
if [[ -z "$PLAYER_ID" ]]; then
  echo "{\"error\": \"PlayerID não foi identificado\"}"
  exit 1
fi

# Cria e ativa o ambiente virtual se necessário
if [ ! -d "$VENV_DIR" ]; then
  echo "Criando ambiente virtual..." >&2
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
  "$VENV_DIR/bin/pip" install werkzeug >/dev/null
fi
source "$VENV_DIR/bin/activate"

# Verifica se o jogador existe no banco principal
PlayerExists=$(sqlite3 -separator "|" "$PLAYERS_BECO_C1_DB" "SELECT 1 FROM players_database WHERE PlayerID = '$PLAYER_ID' LIMIT 1;")
if [[ -z "$PlayerExists" ]]; then
  echo "{\"error\": \"PlayerID não consta na database de jogadores. Ative sua conta antes.\"}"
  exit 1
fi

# RESET PASSWORD
if [[ "$RESET_PASSWORD" == "1" ]]; then
  # Obtém SteamName
  PlayerRow=$(sqlite3 -separator "|" "$PLAYERS_BECO_C1_DB" "SELECT PlayerName, SteamID, SteamName FROM players_database WHERE PlayerID = '$PLAYER_ID';")
  SteamName=$(echo "$PlayerRow" | cut -d'|' -f3 | sed 's/[^a-zA-Z0-9_-]//g' | xargs)

  # Verifica se já está na tabela player_logins
  PlayerLoginRow=$(sqlite3 -separator "|" "$DAYZ_ITEMS_DB" "SELECT login FROM player_logins WHERE player_id = '$PLAYER_ID';")

  if [[ -z "$PlayerLoginRow" ]]; then
    # Gerar senha aleatória e hash
    senha=$(head -c 100 /dev/urandom | tr -dc 'a-z0-9' | head -c 8)
    hash=$(python3 -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('$senha'))")

    # Gerar login inicial a partir do SteamName
    base_login=$(echo "$SteamName" | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9' | cut -c1-16)
    if [[ -z "$base_login" ]]; then base_login="survivor"; fi
    login="$base_login"

    # Verificar se login já existe e gerar novo com sufixo incremental
    suffix=1
    while sqlite3 "$DAYZ_ITEMS_DB" "SELECT 1 FROM player_logins WHERE login = '$login' LIMIT 1;" | grep -q 1; do
      login="${base_login}${suffix}"
      suffix=$((suffix + 1))
    done

    # Inserir login único no banco
    sqlite3 "$DAYZ_ITEMS_DB" "INSERT INTO player_logins (player_id, login, password, active, admin) VALUES ('$PLAYER_ID', '$login', '$hash', 1, 0);"
  else
    # Atualizar senha de login já existente
    login=$(echo "$PlayerLoginRow" | cut -d'|' -f1 | xargs)
    senha=$(head -c 100 /dev/urandom | tr -dc 'a-z0-9' | head -c 8)
    hash=$(python3 -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('$senha'))")
    sqlite3 "$DAYZ_ITEMS_DB" "UPDATE player_logins SET password = '$hash' WHERE player_id = '$PLAYER_ID';"
  fi

  # Resposta final
  echo "{\"login\": \"$login\", \"senha\": \"$senha\", \"url\": \"$URL_LOADOUT\"}"
  exit 0

fi

# ACTIVATE LOADOUT
if [[ "$ACTIVATE_LOADOUT" == "1" ]]; then
  if [[ -z "$LOADOUT_NAME" ]]; then
    echo "{\"error\": \"Loadout name não fornecido\"}"
    exit 1
  fi

  # Atualiza os flags de ativação
  sqlite3 "$DAYZ_ITEMS_DB" "UPDATE player_loadouts SET is_active = 0 WHERE player_id = '$PLAYER_ID';"
  sqlite3 "$DAYZ_ITEMS_DB" "UPDATE player_loadouts SET is_active = 1 WHERE player_id = '$PLAYER_ID' AND name = '$LOADOUT_NAME';"

  rows_updated=$(sqlite3 "$DAYZ_ITEMS_DB" "SELECT COUNT(*) FROM player_loadouts WHERE player_id = '$PLAYER_ID' AND name = '$LOADOUT_NAME' AND is_active = 1;")

  if [[ "$rows_updated" -eq 1 ]]; then
    echo "{\"status\": \"ok\", \"message\": \"Loadout '$LOADOUT_NAME' ativado com sucesso\"}"
  else
    echo "{\"error\": \"Falha ao ativar o loadout '$LOADOUT_NAME' para o jogador\"}"
  fi

  exit 0
fi

# Nenhuma ação reconhecida
echo "{\"error\": \"Nenhuma ação válida foi solicitada\"}"
exit 1