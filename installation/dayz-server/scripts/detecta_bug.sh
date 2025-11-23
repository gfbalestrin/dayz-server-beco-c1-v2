#!/bin/bash

# CONFIGURAÇÕES
LOG_PATH="/home/dayzadmin/servers/dayz-server/profiles/dayz-server.err"          # Caminho para o log do servidor
POSITION_SCRIPT="./player_replace_position.sh"       # Caminho do script de posição
GET_POSITION_SCRIPT="./player_get_position.sh"
BERCON_CLI="/usr/bin/bercon-cli"
RCON_IP="127.0.0.1"
RCON_PORT="2305"
RCON_PASSWORD="senhadorcon"
KICK_DELAY=5  # segundos para aguardar após mover posição

# Função para buscar ID do jogador ativo via bercon
get_player_id_by_name() {
  local player_name="$1"
  $BERCON_CLI -i "$RCON_IP" -p "$RCON_PORT" -P "$RCON_PASSWORD" -j players | \
    jq -r ".[] | select(.name==\"$player_name\") | .id"
}

echo "[*] Iniciando watchdog. Monitorando log: $LOG_PATH"

# Monitorar o log para a mensagem "Invalid number -nan"
tail -Fn0 "$LOG_PATH" | while read -r line; do
  if echo "$line" | grep -q "Invalid number -nan"; then
    echo ""
    echo "[!] Bug detectado: Posição inválida encontrada!"
    
    # Extrair as últimas linhas de log relacionadas ao bug
    context=$(tac "$LOG_PATH" | grep -B 50 "Invalid number -nan" | tac)
    
    # Extrair o UID e o nome do jogador do contexto
    uid=$(echo "$context" | grep -oP 'uid\s\K[\w=-]{30,}' | head -1)
    name=$(echo "$context" | grep -oP 'Player\s+\K\w+(?=\s+\(dpnid)' | head -1)

    if [[ -z "$uid" || -z "$name" ]]; then
      echo "[x] Falha ao extrair dados do log. UID: $uid | Nome: $name"
      continue
    fi

    echo "[*] UID detectado: $uid"
    echo "[*] Jogador: $name"

    # Obter as coordenadas do jogador usando o script player_get_position.sh
    pos_info=$($GET_POSITION_SCRIPT "$uid")
    
    # Extração das coordenadas do JSON retornado
    coord_x=$(echo "$pos_info" | jq -r '.CoordX')
    coord_y=$(echo "$pos_info" | jq -r '.CoordY')
    coord_z=$(echo "$pos_info" | jq -r '.CoordZ')

    echo "[*] Coordenadas originais: X=$coord_x Z=$coord_z Y=$coord_y"

    # Sempre somar 2 metros à coordenada Y
    new_coord_z=$(echo "$coord_z + 1" | bc)
    
    echo "[*] Nova posição corrigida: X=$coord_x Z=$new_coord_z Y=$coord_y"

    # Substituir a posição do jogador usando o script de reposicionamento
    $POSITION_SCRIPT "$uid" "$coord_x" "$new_coord_z" "$coord_y"
    
    sleep "$KICK_DELAY"

    # Obter o ID do jogador via RCON
    player_id=$(get_player_id_by_name "$name")
    if [ -z "$player_id" ]; then
      echo "[x] ID do jogador '$name' não encontrado via RCON. Kick falhou."
      continue
    fi

    echo "[*] Kickando jogador ID=$player_id ($name)"
    $BERCON_CLI -i "$RCON_IP" -p "$RCON_PORT" -P "$RCON_PASSWORD" "kick $player_id 'Repocionando seu personagem. Logue novamente'"
    echo "[✓] Jogador kickado com sucesso."
    echo ""
  fi
done
