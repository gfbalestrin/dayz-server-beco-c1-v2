# Servidores DayZ - Beco Gaming

Este repositório contém os arquivos e documentação de dois servidores DayZ customizados.

## 📚 Documentação

### [🎯 Servidor Deathmatch](deathmatch/docs/README.md)
Servidor PvP com funcionalidades avançadas:
- Sistema de mapas rotativos com votação
- Loadouts personalizáveis
- Votação de kick democrática
- Zonas de combate delimitadas
- Limpeza automática de corpos e armas
- Clima controlado
- Integração com sistemas externos

**[→ Ver documentação completa do Deathmatch](deathmatch/docs/README.md)**

---

### [🌲 Servidor Vanilla](vanilla/docs/README.md)
Servidor com experiência tradicional DayZ:
- Sistema administrativo
- Loadout especial para admins
- Rastreamento de jogadores
- Sistema de mensagens
- Integração externa
- Comandos básicos

**[→ Ver documentação completa do Vanilla](vanilla/docs/README.md)**

---

## 🔧 Estrutura do Projeto

```
dayz-server-beco-c1-v2/
├── deathmatch/
│   ├── dayz-server/
│   │   └── mpmissions/
│   │       └── dayzOffline.chernarusplus/
│   │           ├── init.c
│   │           └── admin/
│   │               ├── Commands.c
│   │               ├── Construction.c
│   │               ├── DeathMatchConfig.c
│   │               ├── ExternalActions.c
│   │               ├── Functions.c
│   │               ├── Globals.c
│   │               ├── Log.c
│   │               ├── Messages.c
│   │               ├── PlayersLoadout.c
│   │               ├── VehicleSpawner.c
│   │               ├── VoteKickManager.c
│   │               ├── VoteMapManager.c
│   │               ├── files/
│   │               ├── loadouts/
│   │               └── models/
│   └── docs/
│       └── README.md          # 📄 Documentação Deathmatch
│
└── vanilla/
    ├── dayz-server/
    │   └── mpmissions/
    │       └── dayzOffline.chernarusplus/
    │           ├── init.c
    │           └── admin/
    │               ├── Commands.c
    │               ├── ExternalActions.c
    │               ├── Functions.c
    │               ├── Globals.c
    │               ├── Log.c
    │               ├── Messages.c
    │               ├── PlayersLoadout.c
    │               ├── VehicleSpawner.c
    │               ├── files/
    │               ├── loadouts/
    │               └── models/
    └── docs/
        └── README.md          # 📄 Documentação Vanilla
```

---

## 🎮 Servidores

### Deathmatch
**Características**: PvP intenso, mapas rotativos, loadouts customizáveis  
**Ideal para**: Jogadores que buscam ação constante  
**Complexidade**: Alta  

### Vanilla
**Características**: Experiência tradicional DayZ com ferramentas administrativas  
**Ideal para**: Jogadores que preferem sobrevivência clássica  
**Complexidade**: Baixa  

---

## 📊 Comparação Rápida

| Funcionalidade | Deathmatch | Vanilla |
|----------------|------------|---------|
| Mapas Rotativos | ✅ | ❌ |
| Votação de Mapas | ✅ | ❌ |
| Votação de Kick | ✅ | ❌ |
| Loadouts Personalizáveis | ✅ | ❌ |
| Zonas de Combate | ✅ | ❌ |
| Limpeza Automática | ✅ | ❌ |
| Clima Controlado | ✅ | ❌ |
| Sistema Admin | ✅ | ✅ |
| Integração Externa | ✅ | ✅ |
| Sistema de Mensagens | ✅ | ✅ |
| Rastreamento Jogadores | ✅ | ✅ |

---

## 🚀 Início Rápido

### Para Administradores

1. **Adicionar seu ID como admin**:
   ```bash
   # Deathmatch
   echo "76561198XXXXXXXXX" >> deathmatch/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt
   
   # Vanilla
   echo "76561198XXXXXXXXX" >> vanilla/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/files/admin_ids.txt
   ```

2. **Configurar loadout admin** (editar JSON):
   ```bash
   # Deathmatch
   nano deathmatch/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/loadouts/admin.json
   
   # Vanilla
   nano vanilla/dayz-server/mpmissions/dayzOffline.chernarusplus/admin/loadouts/admin.json
   ```

3. **Ver logs em tempo real**:
   ```bash
   tail -f [caminho-do-servidor]/profiles/init.log
   ```

### Para Desenvolvedores

1. **Instalar dependências**: Nenhuma (Enforce Script é compilado pelo servidor)

2. **Testar mudanças**:
   - Editar arquivos `.c`
   - Reiniciar servidor DayZ
   - Verificar logs

3. **Backup antes de mudanças**:
   ```bash
   tar -czf backup_$(date +%Y%m%d).tar.gz deathmatch/ vanilla/
   ```

---

## 📝 Comandos Úteis (No Jogo)

### Jogadores Comuns

```
!help           # Lista comandos disponíveis
!kill           # Suicídio
```

### Comandos Exclusivos Deathmatch

```
!loadouts       # Lista seus loadouts
!loadout nome   # Ativa um loadout
!maps           # Lista mapas disponíveis
!votemap 1      # Vota no mapa 1
!players        # Lista jogadores online
!votekick ID    # Inicia votação de kick
```

### Administradores

```
!heal                          # Se cura
!godmode / !ungodmode         # Ativa/desativa invencibilidade
!giveitem Item Qtd            # Cria itens
!spawnvehicle Tipo            # Cria veículo
!teleport X Y Z               # Teleporta
!getposition                  # Mostra coordenadas
!settime Hora Min             # Altera horário (Deathmatch)
!setweather clear/rain/foggy  # Altera clima (Deathmatch)
```

---

## 🔗 Integração Externa

Ambos os servidores se comunicam com sistemas externos através de arquivos JSON.

### Arquivo de Ações (Leitura)
```
admin/files/external_actions.txt
```

Eventos enviados pelo servidor (JSON, uma linha por evento):
```json
{"action":"player_connected","player_id":"76561198XXXXXXXXX"}
{"action":"player_disconnected","player_id":"76561198XXXXXXXXX"}
{"action":"event_restarting"}
```

### Arquivo de Comandos (Escrita)
```
admin/files/commands_to_execute.txt
```

Comandos para o servidor executar:
```
76561198XXXXXXXXX heal
76561198XXXXXXXXX giveitem M4A1 1
```

### Arquivo de Mensagens (Escrita)

**Mensagens globais**:
```
admin/files/messages_to_send.txt
```

**Mensagens privadas**:
```
admin/files/messages_private_to_send.txt
```

Formato: `<player_id>;<mensagem>`

---

## 🛠️ Manutenção

### Logs

Localização padrão:
```
[ServidorDayZ]/profiles/init.log
[ServidorDayZ]/profiles/position.log
```

### Backup Recomendado

Fazer backup de:
- Arquivos `admin/files/*.txt`
- Arquivos `admin/loadouts/*.json`
- Scripts `admin/*.c`
- Arquivo `init.c`

### Troubleshooting

**Problema**: Comandos não funcionam  
**Solução**: Verificar `commands_to_execute.txt` e logs

**Problema**: Loadout admin não aplica  
**Solução**: Validar JSON em https://jsonlint.com/

**Problema**: Jogadores não são detectados  
**Solução**: Verificar `lastSeenPlayers` em logs

Para mais detalhes, consulte as documentações específicas de cada servidor.

---

## 📖 Documentação Técnica

- **Linguagem**: Enforce Script (similar a C++)
- **Engine**: Enfusion (Bohemia Interactive)
- **Versão DayZ**: 1.x
- **Sistema de Arquivos**: Leitura/escrita de arquivos texto e JSON

### Recursos Úteis

- [Documentação Oficial DayZ](https://community.bistudio.com/wiki/DayZ)
- [Enforce Script Syntax](https://community.bistudio.com/wiki/Enfusion:Enforce_Script_Syntax)
- [DayZ Server Configuration](https://community.bistudio.com/wiki/DayZ:Server_Configuration)

---

## 🤝 Contribuindo

Para contribuir com melhorias:

1. Criar branch para feature/correção
2. Testar em servidor local
3. Documentar mudanças
4. Criar pull request

---

## 📄 Licença

Uso privado - Beco Gaming  
Arquivos protegidos por direitos autorais conforme legislação aplicável.

---

## 📞 Contato

Para dúvidas ou suporte:
- Sistema de loadouts: http://beco.servegame.com:54321/
- Logs do servidor para troubleshooting

---

*Última atualização: 2025-10-12*

