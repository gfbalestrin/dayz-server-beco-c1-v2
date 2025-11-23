#!/bin/bash

# Verifica se o parâmetro foi passado
if [[ -z "$1" ]]; then
  echo "Erro: Você deve fornecer o Message como parâmetro."
  echo "Uso: $0 <Message>"
  echo "Exemplo: Player ""Survivor"" (id=abcdefghijklmnopqrstuvxz pos=<2635.0, 1313.7, 22.9>)[HP: 75.919] hit by Player ""Survivor (2)"" (id=abcdefghijklmnopqrstuvxz pos=<2634.2, 1311.6, 23.0>) into Torso(30) for 24.081 damage (Bullet_545x39) with KA-74 from 2.27205 meters"
  exit 1
fi

Message="$1"
echo "$Message" | grep -q "\[HP: 0\]" && echo "Dano 0 será ignorado" && exit 1

# Extrai nome do atingido
ATINGIDO=$(echo "$Message" | sed -n 's/Player "\([^"]*\)".*/\1/p')
# Extrai nome do atacante
ATACANTE=$(echo "$Message" | sed -n 's/.*hit by Player "\([^"]*\)".*/\1/p')

# Ignora se algum dos nomes não foi capturado
[ -z "$ATINGIDO" ] && echo "Nome do player atingido não foi identificado" && exit 1
[ -z "$ATACANTE" ] && echo "Nome do player que atacou não foi identificado" && exit 1

# Captura os IDs dos jogadores
IDS=$(echo "$Message" | grep -oP 'id=\K[a-zA-Z0-9_\-=]+')
ID_ATINGIDO=$(echo "$IDS" | sed -n '1p')
ID_ATACANTE=$(echo "$IDS" | sed -n '2p')

# Extrai outras informações
HP=$(echo "$Message" | grep -oP '\[HP: \K[0-9.]+' || echo "Desconhecido")
LOCAL=$(echo "$Message" | grep -oP 'into \K[^ ]+' | sed 's/([0-9]*)//g')
DANO=$(echo "$Message" | grep -oP 'for \K[0-9.]+(?= damage)')
TIPO=$(echo "$Message" | grep -oP 'damage \(\K[^)]+' || echo "Desconhecido")
DISTANCIA=$(echo "$Message" | grep -oP 'from \K[0-9.]+(?= meters)' || echo "0")
DISTANCIA=$(echo $DISTANCIA | cut -d '.' -f 1)
ARMA=$(echo "$Message" | grep -oP 'with \K[^ ]+' || echo "Soco")

# Posições
POS_ATINGIDO=$(echo "$Message" | grep -oP 'pos=<[^>]+>' | sed -n '1p' | sed 's/pos=<//' | sed 's/>//' | sed 's/, */,/g')
POS_ATACANTE=$(echo "$Message" | grep -oP 'pos=<[^>]+>' | sed -n '2p' | sed 's/pos=<//' | sed 's/>//' | sed 's/, */,/g')

# Exibição
# echo "O jogador \"$ATINGIDO\" (ID: $ID_ATINGIDO) foi atingido por \"$ATACANTE\" (ID: $ID_ATACANTE)."
# echo "     Local atingido: $LOCAL"
# echo "     Tipo de ataque: $TIPO"
# echo "     Dano causado: $DANO"
# echo "     HP restante: $HP"
# echo "     Posição do atingido: $POS_ATINGIDO"
# echo "     Posição do atacante: $POS_ATACANTE"

#[ -n "$ARMA" ] && echo "     Arma usada: $ARMA"
#[ -n "$DISTANCIA" ] && echo "     Distância do disparo: $DISTANCIA metros"
echo "$ID_ATACANTE|$ID_ATINGIDO|$POS_ATACANTE|$POS_ATINGIDO|$LOCAL|$TIPO|$DANO|$HP|$ARMA|$DISTANCIA" 