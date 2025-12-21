# Scripts de Ação de Log - DEPRECADOS

## Status

Estes scripts de ação **não são mais usados** pelos monitores de log (`dayz_log_monitor.sh` e `dayz_err_monitor.sh`).

Os monitores foram simplificados para publicar linhas brutas dos logs diretamente no RabbitMQ. Todo o parsing e processamento é feito no servidor de monitoramento pelos consumers.

## Scripts

Os seguintes scripts podem ser removidos ou mantidos apenas para referência:

### Log Monitor (dayz_log_monitor.sh)
- `death_event.sh` - DEPRECADO (publicado em `logs.adm`)
- `hit_player.sh` - DEPRECADO (publicado em `logs.adm`)
- `killed_by_player.sh` - DEPRECADO (publicado em `logs.adm`)
- `built_fence.sh` - DEPRECADO (publicado em `logs.adm`)
- `built_watchtower.sh` - DEPRECADO (publicado em `logs.adm`)
- `built_flag.sh` - DEPRECADO (publicado em `logs.adm`)
- `built_shelter.sh` - DEPRECADO (publicado em `logs.adm`)
- `dismantled_fence.sh` - DEPRECADO (publicado em `logs.adm`)
- `dismantled_upper_wall.sh` - DEPRECADO (publicado em `logs.adm`)
- `dismantled_upper_frame.sh` - DEPRECADO (publicado em `logs.adm`)
- `chat_command.sh` - DEPRECADO (publicado em `logs.adm`)

### Error Monitor (dayz_err_monitor.sh)
- `compile_error.sh` - DEPRECADO (publicado em `logs.err`)
- `invalid_number_nan.sh` - DEPRECADO (publicado em `logs.err`)
- `admin_kick.sh` - DEPRECADO (publicado em `logs.err`)

## Lógica Mantida Localmente

Apenas a lógica mínima de enfileiramento de comandos é mantida localmente no `dayz_log_monitor.sh`:

- **built_fence** → Extrai posição → `SYSTEM registerfence`
- **built_watchtower** → Extrai posição → `SYSTEM registerwatchtower`
- **built_flag** → Extrai posição → `SYSTEM registerflag`
- **built_shelter** → Extrai posição → `SYSTEM registercontainer`
- **chat_command** → Extrai PlayerId e Command → `PlayerId Command` (apenas para admins ou comandos permitidos em deathmatch)

Esta lógica é necessária porque os comandos precisam ser escritos no `DayzAdminCmdsFile` local que o servidor DayZ lê.

## Estrutura de Filas RabbitMQ

- `logs.adm` - Logs administrativos (dayz_log_monitor.sh)
- `logs.err` - Logs de erro (dayz_err_monitor.sh)

## Formato de Mensagens

```json
{
  "log_type": "adm|err",
  "log_file": "nome_do_arquivo.log",
  "line": "linha completa do log",
  "content": "linha sem timestamp (apenas para logs.adm)",
  "timestamp": "2024-01-01 12:00:00"
}
```

## Processamento no Consumer

O consumer no servidor de monitoramento fará:
- Parsing completo das linhas de log
- Correlação de eventos (ex: morte por ambiente com dano recente)
- Consultas SQLite para buscar informações de players
- Formatação de mensagens para Discord
- Gravação de eventos no banco de dados
- Todo processamento complexo que estava nos handlers

