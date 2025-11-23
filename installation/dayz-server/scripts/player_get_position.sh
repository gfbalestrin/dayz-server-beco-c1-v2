#!/bin/bash

# apt install xxd bc

# Carrega as variáveis
source ./config.sh

# Verifica se o parâmetro foi passado
if [[ -z "$1" ]]; then
  echo "Erro: Você deve fornecer o PlayerId como parâmetro."
  echo "Uso: $0 <PlayerId>"
  exit 1
fi

PlayerId="$1"

# Verifica se o PlayerId tem exatamente 44 caracteres
if [[ ${#PlayerId} -ne 44 ]]; then
  echo "Erro: O PlayerId deve conter exatamente 44 caracteres."
  exit 2
fi

Result=$(GET_DAYZ_PLAYER_POSITION $PlayerId)
CoordX=$(echo "$Result" | cut -d';' -f1)
CoordZ=$(echo "$Result" | cut -d';' -f2)
CoordY=$(echo "$Result" | cut -d';' -f3)

if [[ -z "$CoordX" || -z "$CoordZ" || -z "$CoordY" ]]; then
    echo "Erro: uma ou mais coordenadas estão vazias."
    exit 3
fi

# Criando o JSON de resposta
JSON=$(cat <<EOF
{
  "CoordX": "$CoordX",
  "CoordY": "$CoordY",
  "CoordZ": "$CoordZ",
  "Url": "https://dayz.xam.nu/#location=$CoordX;$CoordY;5"
}
EOF
)

# Exibe o JSON
echo "$JSON"