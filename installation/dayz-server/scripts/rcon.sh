#!/bin/bash

# Instalacao
curl -#SfLo /usr/bin/bercon-cli \
  https://github.com/WoozyMasta/bercon-cli/releases/latest/download/bercon-cli-linux-amd64
chmod +x /usr/bin/bercon-cli
bercon-cli -h && bercon-cli -v

# Exemplos

# Listando players
bercon-cli -i 127.0.0.1 -p 2305 -P senhadorcon -j players

# Kickando player
bercon-cli -i 127.0.0.1 -p 2305 -P senhadorcon 'Kick 0 Repocionando seu personagem. Logue novamente'

# Mensagem global
bercon-cli -i 127.0.0.1 -p 2305 -P senhadorcon 'say -1 "vagabundos"'

# Mensagm privada
bercon-cli -i 127.0.0.1 -p 2305 -P senhadorcon 'say -0 "vagabundo de id 0"'
