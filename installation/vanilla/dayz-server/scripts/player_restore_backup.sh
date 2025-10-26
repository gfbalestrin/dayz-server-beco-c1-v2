#!/bin/bash

source ./config.sh

PlayerId=$1
PlayerCoordId=$2

# Validação de parâmetros
if [[ -z "$PlayerId" || -z "$PlayerCoordId" ]]; then
    echo "Erro: Os parâmetros PlayerId e PlayerCoordId são obrigatórios."
    echo "Uso: $0 <PlayerId> <PlayerCoordId>"
    exit 1
fi

# Valida PlayerId (44 caracteres)
if [[ ${#PlayerId} -ne 44 ]]; then
    echo "Erro: PlayerId deve conter exatamente 44 caracteres."
    exit 1
fi

# Valida PlayerCoordId (número inteiro maior que 0)
if ! [[ "$PlayerCoordId" =~ ^[1-9][0-9]*$ ]]; then
    echo "Erro: PlayerCoordId deve ser um número inteiro maior que 0."
    exit 1
fi

PlayerCoordBackup=$(sqlite3 -separator "|" "$AppFolder/$AppPlayerBecoC1DbFile" "SELECT Backup,TimeStamp FROM players_coord_backup WHERE PlayerCoordId = '$PlayerCoordId' LIMIT 1;")
if [[ -z "$PlayerCoordBackup" ]]; then
    echo "Erro: PlayerCoordId não encontrado no banco de dados."
    exit 1
fi

Backup=$(echo "$PlayerCoordBackup" | cut -d'|' -f1)
TimeStamp=$(echo "$PlayerCoordBackup" | cut -d'|' -f2)

if [[ -z "$Backup" ]]; then
    echo "Erro: Backup está vazio."
    exit 1
fi
echo "Realizando backup do estado atual do jogador $PlayerId..."
PlayerBackup=$(GET_DAYZ_PLAYER_DATA $PlayerId)
if [[ -z "$PlayerBackup" ]]; then
    echo "Erro: Não foi possível obter os dados atuais do jogador."
    exit 1
fi

echo "$PlayerBackup" > /tmp/PlayerBackup.txt

sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players SET Alive = 1 WHERE UID = '$PlayerId';"
sqlite3 "$DayzServerFolder/$DayzPlayerDbFile" "UPDATE Players SET Data = X'$Backup' WHERE UID = '$PlayerId';"
