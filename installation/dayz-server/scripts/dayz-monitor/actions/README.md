# Scripts de Ação - DEPRECADOS

## Status

Estes scripts de ação **não são mais usados** pelo `dayz_command_watcher.sh`.

O `dayz_command_watcher.sh` foi simplificado para publicar diretamente no RabbitMQ sem processamento local. Todo o parsing e processamento é feito no servidor de monitoramento pelos consumers.

## Scripts

Os seguintes scripts podem ser removidos ou mantidos apenas para referência:

- `players_positions.sh` - DEPRECADO (publicado em `data.players.positions`)
- `vehicles_positions.sh` - DEPRECADO (publicado em `data.vehicles.positions`)
- `containers_positions.sh` - DEPRECADO (publicado em `data.containers.positions`)
- `fences_positions.sh` - DEPRECADO (publicado em `data.structures.positions`)
- `watchtowers_positions.sh` - DEPRECADO (publicado em `data.structures.positions`)
- `flags_positions.sh` - DEPRECADO (publicado em `data.structures.positions`)
- `reset_password.sh` - DEPRECADO (publicado em `users.management`)
- `player_connected.sh` - DEPRECADO (publicado em `events.players`)
- `player_disconnected.sh` - DEPRECADO (publicado em `events.players`)
- `player_respawned.sh` - DEPRECADO (publicado em `events.players`)
- `active_loadout.sh` - DEPRECADO (publicado em `events.server`)
- `update_player.sh` - DEPRECADO (publicado em `events.server`)
- `restart_server.sh` - DEPRECADO (publicado em `events.server`)
- `event_restarting.sh` - DEPRECADO (publicado em `events.server`)
- `event_start_finished.sh` - DEPRECADO (publicado em `events.server`)
- `event_minutes_to_restart.sh` - DEPRECADO (publicado em `events.server`)
- `send_log_discord.sh` - DEPRECADO (publicado em `events.server`)

## Mapeamento Action -> Queue

O mapeamento está definido em `dayz_command_watcher.sh` na função `get_rabbitmq_queue()`:

- `players_positions` → `data.players.positions`
- `vehicles_positions` → `data.vehicles.positions`
- `containers_positions` → `data.containers.positions`
- `fences_positions`, `watchtowers_positions`, `flags_positions` → `data.structures.positions`
- `reset_password` → `users.management`
- `player_connected`, `player_disconnected`, `player_respawned` → `events.players`
- Outras ações → `events.server` ou `events.unknown`

## Backups de Players

A lógica de backups de players foi movida para um consumer separado:
- `players_backup_consumer.py` - Consome `data.players.positions` e faz backups localmente
- `players_backup_consumer.sh` - Wrapper shell para iniciar o consumer

