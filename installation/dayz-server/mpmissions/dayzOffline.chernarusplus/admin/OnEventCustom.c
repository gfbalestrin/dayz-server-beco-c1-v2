// Função helper para identificar o nome do EventType
string GetEventTypeName(EventType eventTypeId)
{
    // Eventos de Cliente/Conexão
    if (eventTypeId == ClientConnectedEventTypeID) return "ClientConnectedEventTypeID";
    if (eventTypeId == ClientDisconnectedEventTypeID) return "ClientDisconnectedEventTypeID";
    if (eventTypeId == ClientNewEventTypeID) return "ClientNewEventTypeID";
    if (eventTypeId == ClientReadyEventTypeID) return "ClientReadyEventTypeID";
    if (eventTypeId == ClientPrepareEventTypeID) return "ClientPrepareEventTypeID";
    if (eventTypeId == ClientRespawnEventTypeID) return "ClientRespawnEventTypeID";
    if (eventTypeId == ClientReconnectEventTypeID) return "ClientReconnectEventTypeID";
    
    // Eventos de Login/Logout
    if (eventTypeId == LoginTimeEventTypeID) return "LoginTimeEventTypeID";
    if (eventTypeId == LoginStatusEventTypeID) return "LoginStatusEventTypeID";
    if (eventTypeId == LogoutCancelEventTypeID) return "LogoutCancelEventTypeID";
    
    // Eventos de Spawn/Respawn
    if (eventTypeId == RespawnEventTypeID) return "RespawnEventTypeID";
    
    // Eventos de Câmera/Debug
    if (eventTypeId == SetFreeCameraEventTypeID) return "SetFreeCameraEventTypeID";
    
    // Eventos de Sistema
    if (eventTypeId == PreloadEventTypeID) return "PreloadEventTypeID";
    if (eventTypeId == ChatMessageEventTypeID) return "ChatMessageEventTypeID";
    
    // Eventos de Multiplayer/Sessão
    if (eventTypeId == MPSessionStartEventTypeID) return "MPSessionStartEventTypeID";
    if (eventTypeId == MPSessionEndEventTypeID) return "MPSessionEndEventTypeID";
    if (eventTypeId == MPSessionPlayerReadyEventTypeID) return "MPSessionPlayerReadyEventTypeID";
    if (eventTypeId == MPSessionFailEventTypeID) return "MPSessionFailEventTypeID";
    
    // Eventos de Rede
    if (eventTypeId == NetworkManagerClientEventTypeID) return "NetworkManagerClientEventTypeID";
    if (eventTypeId == NetworkManagerServerEventTypeID) return "NetworkManagerServerEventTypeID";
    
    // Eventos de Progresso
    if (eventTypeId == ProgressEventTypeID) return "ProgressEventTypeID";
    
    // Eventos de VON (Voice Over Network)
    if (eventTypeId == VONStateEventTypeID) return "VONStateEventTypeID";
    if (eventTypeId == VONStartSpeakingEventTypeID) return "VONStartSpeakingEventTypeID";
    if (eventTypeId == VONStopSpeakingEventTypeID) return "VONStopSpeakingEventTypeID";
    
    // Eventos de Mundo
    if (eventTypeId == WorldCleaupEventTypeID) return "WorldCleaupEventTypeID";

    //ConnectivityStatsUpdatedEventTypeID
    if (eventTypeId == ConnectivityStatsUpdatedEventTypeID) return "ConnectivityStatsUpdatedEventTypeID";
    //LogoutEventTypeID
    if (eventTypeId == LogoutEventTypeID) return "LogoutEventTypeID";
    //PlayerDeathEventTypeID
    if (eventTypeId == PlayerDeathEventTypeID) return "PlayerDeathEventTypeID";
    //ScriptLogEventTypeID
    if (eventTypeId == ScriptLogEventTypeID) return "ScriptLogEventTypeID";
    //ChatChannelEventTypeID
    if (eventTypeId == ChatChannelEventTypeID) return "ChatChannelEventTypeID";
    
    // Se não encontrou, retorna desconhecido
    return "UNKNOWN_EVENT_TYPE";
}

void OnEventCustom(EventType eventTypeId, Param params)
{
    // Variáveis compartilhadas entre os eventos
    PlayerIdentity identity;
    Man player;
    PlayerBase playerBase;
    string playerName;
    string playerId;
    string steamId;
    int logoutTime;
    bool authFailed;
    vector position;
    int channel;
    string text;
    string colorClass;
    ActivePlayer existingPlayer;
    Man playerMan;

    // ============================================================================
    // EVENTO: ClientConnectedEventTypeID
    // Disparado quando um cliente se conecta ao servidor (antes de spawn)
    // Params: <string, string> - Nome do jogador, SteamID
    // ============================================================================
    if (eventTypeId == ClientConnectedEventTypeID)
    {
        if (IsDeathmatchEnabled)
        {
            return;
        }
        WriteToLog("EVENT: ClientConnectedEventTypeID - Cliente conectando ao servidor", LogFile.INIT, false, LogType.INFO);
        ClientConnectedEventParams connectedParams = ClientConnectedEventParams.Cast(params);
        if (!connectedParams) {
            WriteToLog("ClientConnectedEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
            return;
        }
        
        playerName = connectedParams.param1;  // Nome do jogador
        steamId = connectedParams.param2;      // Steam ID
        
        WriteToLog("  -> Nome: " + playerName + " | SteamID: " + steamId, LogFile.INIT, false, LogType.DEBUG);
        
        // Aqui você pode adicionar lógica personalizada
        // Ex: verificar banimentos, whitelist, etc
        // NOTA: Jogador será adicionado à lista no ClientReadyEventTypeID
    }
    
    // ============================================================================
    // EVENTO: ClientDisconnectedEventTypeID
    // Disparado quando um cliente inicia a desconexão
    // Params: <PlayerIdentity, Man, int, bool> - Identity, Player, LogoutTime, AuthFailed
    // ============================================================================
    else if (eventTypeId == ClientDisconnectedEventTypeID)
    {
        WriteToLog("EVENT: ClientDisconnectedEventTypeID - Cliente desconectando", LogFile.INIT, false, LogType.INFO);
        ClientDisconnectedEventParams disconnectedParams = ClientDisconnectedEventParams.Cast(params);
        if (!disconnectedParams) {
            WriteToLog("ClientDisconnectedEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
            return;
        }
        
        identity = disconnectedParams.param1;      // PlayerIdentity
        player = disconnectedParams.param2;        // Man/PlayerBase
        logoutTime = disconnectedParams.param3;    // Tempo de logout (em segundos)
        authFailed = disconnectedParams.param4;    // Falha de autenticação
        
        if (identity)
        {
            playerId = identity.GetId();
            playerName = identity.GetName();
            WriteToLog("  -> Jogador iniciando desconexão: " + playerName + " | ID: " + playerId + " | LogoutTime: " + logoutTime + " | AuthFailed: " + authFailed, LogFile.INIT, false, LogType.INFO);
            
            // Se authFailed ou logoutTime == 0, desconecta imediatamente
            if (authFailed || logoutTime == 0)
            {
                WriteToLog("  -> Desconexão imediata (authFailed ou logoutTime=0)", LogFile.INIT, false, LogType.INFO);
                HandlePlayerDisconnect(playerId, identity, player);
                return;
            }
            
            // Marca como desconexão pendente e agenda verificação
            if (!PendingDisconnects)
                PendingDisconnects = new map<string, int>();
            
            int currentTime = GetGame().GetTime();
            int disconnectTime = currentTime + (logoutTime * 1000); // Converte segundos para milissegundos
            PendingDisconnects.Set(playerId, disconnectTime);
            WriteToLog("  -> Desconexão agendada para: " + disconnectTime + " (em " + logoutTime + " segundos)", LogFile.INIT, false, LogType.DEBUG);
            
            // Agenda verificação após o tempo de logout
            GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(CheckPendingDisconnect, logoutTime * 1000, false, playerId);
        }
    }
    
    // ============================================================================
    // EVENTO: ClientNewEventTypeID
    // Disparado quando um cliente novo (primeira vez) entra no servidor
    // IMPORTANTE: Quando jogador morre e entra novamente, apenas este evento é disparado
    // Params: <PlayerIdentity, vector, Serializer> - Identity, Position, Serializer (roupas)
    // ============================================================================
    else if (eventTypeId == ClientNewEventTypeID)
    {
        WriteToLog("EVENT: ClientNewEventTypeID - Novo jogador entrando", LogFile.INIT, false, LogType.INFO);
        ClientNewEventParams newParams = ClientNewEventParams.Cast(params);
        if (!newParams) {
            WriteToLog("ClientNewEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
            return;
        }
        
        identity = newParams.param1;   // PlayerIdentity
        position = newParams.param2;   // Posição de spawn
        
        if (identity)
        {
            playerId = identity.GetId();
            playerName = identity.GetName();
            WriteToLog("  -> Novo jogador: " + playerName + " | PlayerID: " + playerId + " | Posição: " + position.ToString(), LogFile.INIT, false, LogType.INFO);
            
            // Verifica se jogador já está em ActivePlayers
            existingPlayer = GetActivePlayerById(playerId);
            
            if (existingPlayer)
            {
                // Jogador já existe (pode ser reconexão após morte)
                WriteToLog("  -> Jogador já está em ActivePlayers, atualizando referência", LogFile.INIT, false, LogType.DEBUG);
                
                // Tenta obter o objeto Man através do PlayerIdentity
                playerMan = GetManFromIdentity(identity);
                if (playerMan)
                {
                    existingPlayer.SetPlayer(playerMan);
                    WriteToLog("  -> Referência de Man atualizada", LogFile.INIT, false, LogType.DEBUG);
                }
            }
            else
            {
                // Jogador não está em ActivePlayers - primeira conexão ou após morte
                WriteToLog("  -> Jogador não está em ActivePlayers, processando como nova conexão", LogFile.INIT, false, LogType.INFO);
                
                // Tenta obter o objeto Man através do PlayerIdentity
                playerMan = GetManFromIdentity(identity);
                
                // Usa a função reutilizável para processar o jogador
                ProcessPlayerReady(identity, playerMan);
            }
        }
    }
    
    // ============================================================================
    // EVENTO: ClientReadyEventTypeID
    // Disparado quando o cliente está totalmente carregado e pronto para jogar
    // IMPORTANTE: Este evento NÃO é disparado quando jogador morre e entra novamente
    // Params: <PlayerIdentity, Man> - Identity, Player
    // ============================================================================
    else if (eventTypeId == ClientReadyEventTypeID)
    {
        WriteToLog("EVENT: ClientReadyEventTypeID - Cliente pronto para jogar", LogFile.INIT, false, LogType.INFO);
        
        ClientReadyEventParams readyParams = ClientReadyEventParams.Cast(params);
        if (readyParams)
        {
            identity = readyParams.param1;
            player = readyParams.param2;
            
            if (identity)
            {
                playerId = identity.GetId();
                existingPlayer = GetActivePlayerById(playerId);
                
                if (existingPlayer)
                {
                    // Jogador já existe - apenas atualiza referência de Man
                    WriteToLog("  -> Jogador já está em ActivePlayers, atualizando referência de Man", LogFile.INIT, false, LogType.DEBUG);
                    existingPlayer.SetPlayer(player);
                    EnsureActivePlayerHasManRef(playerId, player);
                }
                else
                {
                    // Jogador não existe - processa como nova conexão
                    WriteToLog("  -> Jogador não está em ActivePlayers, processando como nova conexão", LogFile.INIT, false, LogType.INFO);
                    ProcessPlayerReady(identity, player);
                }
            }
        }
    }
    
    // ============================================================================
    // EVENTO: ClientPrepareEventTypeID
    // Disparado durante a preparação do cliente (antes de estar pronto)
    // Params: <PlayerIdentity, bool, vector, float, int> - Identity, useDB, pos, yaw, preloadTimeout
    // ============================================================================
    else if (eventTypeId == ClientPrepareEventTypeID)
    {
        WriteToLog("EVENT: ClientPrepareEventTypeID - Cliente se preparando", LogFile.INIT, false, LogType.INFO);
        ClientPrepareEventParams prepareParams = ClientPrepareEventParams.Cast(params);
        if (prepareParams)
        {
            identity = prepareParams.param1;        // PlayerIdentity
            bool useDB = prepareParams.param2;      // Usa banco de dados
            position = prepareParams.param3;        // Posição
            float yaw = prepareParams.param4;       // Rotação yaw
            int preloadTimeout = prepareParams.param5;  // Timeout de preload adicional
            
            //if (identity)
            //{
                //WriteToLog("  -> Jogador preparando: " + identity.GetName() + " | PlayerID: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
                //WriteToLog("  -> UseDB: " + useDB + " | Pos: " + position.ToString() + " | Yaw: " + yaw + " | Timeout: " + preloadTimeout, LogFile.INIT, false, LogType.DEBUG);
            //}
        }
    }
    
    // ============================================================================
    // EVENTO: ClientRespawnEventTypeID
    // Disparado quando um jogador respawna após a morte
    // Params: <PlayerIdentity, Man> - Identity, Player
    // ============================================================================
    else if (eventTypeId == ClientRespawnEventTypeID)
    {
        WriteToLog("EVENT: ClientRespawnEventTypeID - Jogador respawnando", LogFile.INIT, false, LogType.INFO);
        ClientRespawnEventParams respawnParams = ClientRespawnEventParams.Cast(params);
        if (respawnParams)
        {
            identity = respawnParams.param1;
            player = respawnParams.param2;
            
            if (identity && player)
            {
                playerBase = PlayerBase.Cast(player);
                if (playerBase)
                {
                    playerId = identity.GetId();
                    playerName = identity.GetName();
                    vector respawnPos = playerBase.GetPosition();
                    
                    WriteToLog("  -> JOGADOR RESPAWNOU: " + playerName + " | PlayerID: " + playerId + " | Posição: " + respawnPos.ToString(), LogFile.INIT, false, LogType.INFO);
                    
                    // Registra log de respawn com posição
                    string logMessage = "RESPAWN: " + playerName + " (ID: " + playerId + ") respawnou na posição " + respawnPos.ToString();
                    WriteToLog(logMessage, LogFile.INIT, false, LogType.INFO);
                    
                    // Opcional: Enviar para sistema externo
                    string sanitizedPos = respawnPos[0].ToString() + "," + respawnPos[1].ToString() + "," + respawnPos[2].ToString();
                    AppendExternalAction("{\"action\":\"player_respawned\",\"player_id\":\"" + playerId + "\",\"position\":\"" + sanitizedPos + "\"}");
                    
                    // Atualiza o jogador na lista (preserva HasSentConnectedEvent)
                    ActivePlayer respawnedPlayer = GetActivePlayerById(playerId);
                    if (respawnedPlayer)
                    {
                        respawnedPlayer.SetPlayer(player);
                        respawnedPlayer.ClearDeathFlag();
                        WriteToLog("  -> Jogador respawnado atualizado na lista, flag de morte limpo", LogFile.INIT, false, LogType.DEBUG);
                    }
                    else
                    {
                        WriteToLog("  -> AVISO: Jogador respawnado não encontrado em ActivePlayers", LogFile.INIT, false, LogType.DEBUG);
                    }
                }
            }
        }
    }
    
    // ============================================================================
    // EVENTO: ClientReconnectEventTypeID
    // Disparado quando um jogador reconecta ao servidor
    // Params: <PlayerIdentity, Man> - Identity, Player
    // ============================================================================
    else if (eventTypeId == ClientReconnectEventTypeID)
    {
        WriteToLog("EVENT: ClientReconnectEventTypeID - Jogador reconectando", LogFile.INIT, false, LogType.INFO);
        ClientReconnectEventParams reconnectParams = ClientReconnectEventParams.Cast(params);
        if (reconnectParams)
        {
            identity = reconnectParams.param1;
            //if (identity)
            //{
                //WriteToLog("  -> Jogador reconectou: " + identity.GetName(), LogFile.INIT, false, LogType.DEBUG);
            //}
        }
    }
    
    // ============================================================================
    // EVENTO: LoginTimeEventTypeID
    // Disparado relacionado ao tempo de login do jogador
    // ============================================================================
    else if (eventTypeId == LoginTimeEventTypeID)
    {
        WriteToLog("EVENT: LoginTimeEventTypeID - Tempo de login", LogFile.INIT, false, LogType.DEBUG);
        LoginTimeEventParams loginTimeParams = LoginTimeEventParams.Cast(params);
        //if (loginTimeParams)
        //{
            // Params podem conter informações sobre o tempo de login
            //WriteToLog("  -> LoginTime params disponíveis", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: LoginStatusEventTypeID
    // Disparado quando o status de login muda
    // ============================================================================
    else if (eventTypeId == LoginStatusEventTypeID)
    {
        WriteToLog("EVENT: LoginStatusEventTypeID - Status de login alterado", LogFile.INIT, false, LogType.DEBUG);
        LoginStatusEventParams loginStatusParams = LoginStatusEventParams.Cast(params);
        //if (loginStatusParams)
        //{
        //    WriteToLog("  -> LoginStatus params disponíveis", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: LogoutCancelEventTypeID
    // Disparado quando um logout é cancelado (jogador se move durante logout)
    // Params: <Man> - Player
    // ============================================================================
    else if (eventTypeId == LogoutCancelEventTypeID)
    {
        WriteToLog("EVENT: LogoutCancelEventTypeID - Logout cancelado", LogFile.INIT, false, LogType.INFO);
        LogoutCancelEventParams logoutCancelParams = LogoutCancelEventParams.Cast(params);
        if (logoutCancelParams)
        {
            player = logoutCancelParams.param1;
            playerBase = PlayerBase.Cast(player);
            if (playerBase && playerBase.GetIdentity())
            {
                string cancelPlayerId = playerBase.GetIdentity().GetId();
                WriteToLog("  -> Logout cancelado para: " + playerBase.GetIdentity().GetName() + " | ID: " + cancelPlayerId, LogFile.INIT, false, LogType.INFO);
                
                // Remove da lista de desconexões pendentes
                if (PendingDisconnects && PendingDisconnects.Contains(cancelPlayerId))
                {
                    PendingDisconnects.Remove(cancelPlayerId);
                    WriteToLog("  -> Desconexão pendente cancelada", LogFile.INIT, false, LogType.DEBUG);
                }
            }
        }
    }
    
    // ============================================================================
    // EVENTO: RespawnEventTypeID
    // Disparado durante o processo de respawn
    // ============================================================================
    else if (eventTypeId == RespawnEventTypeID)
    {
        WriteToLog("EVENT: RespawnEventTypeID - Processo de respawn", LogFile.INIT, false, LogType.DEBUG);
        RespawnEventParams respawnEventParams = RespawnEventParams.Cast(params);
        //if (respawnEventParams)
        //{
        //    WriteToLog("  -> Respawn event params disponíveis", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: SetFreeCameraEventTypeID
    // Disparado quando a câmera livre é ativada (modo admin/espectador)
    // ============================================================================
    else if (eventTypeId == SetFreeCameraEventTypeID)
    {
        WriteToLog("EVENT: SetFreeCameraEventTypeID - Câmera livre ativada", LogFile.INIT, false, LogType.INFO);
        SetFreeCameraEventParams freeCamParams = SetFreeCameraEventParams.Cast(params);
        //if (freeCamParams)
        //{
        //    WriteToLog("  -> Câmera livre params disponíveis", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: PreloadEventTypeID
    // Disparado durante o pré-carregamento de recursos
    // ============================================================================
    else if (eventTypeId == PreloadEventTypeID)
    {
        WriteToLog("EVENT: PreloadEventTypeID - Pré-carregamento de recursos", LogFile.INIT, false, LogType.DEBUG);
        PreloadEventParams preloadParams = PreloadEventParams.Cast(params);
        //if (preloadParams)
        //{
        //    WriteToLog("  -> Preload params disponíveis", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: MPSessionStartEventTypeID
    // Disparado quando uma sessão multiplayer inicia
    // ============================================================================
    // else if (eventTypeId == MPSessionStartEventTypeID)
    // {
    // 	WriteToLog("EVENT: MPSessionStartEventTypeID - Sessão multiplayer iniciada", LogFile.INIT, false, LogType.INFO);
    // 	MPSessionStartEventParams sessionStartParams = MPSessionStartEventParams.Cast(params);
    // 	if (sessionStartParams)
    // 	{
    // 		WriteToLog("  -> Sessão MP iniciada", LogFile.INIT, false, LogType.DEBUG);
    // 	}
    // }
    
    // ============================================================================
    // EVENTO: MPSessionEndEventTypeID
    // Disparado quando uma sessão multiplayer termina
    // ============================================================================
    // else if (eventTypeId == MPSessionEndEventTypeID)
    // {
    // 	WriteToLog("EVENT: MPSessionEndEventTypeID - Sessão multiplayer encerrada", LogFile.INIT, false, LogType.INFO);
    // 	MPSessionEndEventParams sessionEndParams = MPSessionEndEventParams.Cast(params);
    // 	if (sessionEndParams)
    // 	{
    // 		WriteToLog("  -> Sessão MP encerrada", LogFile.INIT, false, LogType.DEBUG);
    // 	}
    // }
    
    // ============================================================================
    // EVENTO: MPConnectionLostEventTypeID
    // Disparado quando a conexão multiplayer é perdida
    // ============================================================================
    else if (eventTypeId == MPConnectionLostEventTypeID)
    {
        WriteToLog("EVENT: MPConnectionLostEventTypeID - Conexão MP perdida", LogFile.INIT, false, LogType.DEBUG);
        MPConnectionLostEventParams connectionLostParams = MPConnectionLostEventParams.Cast(params);
        if (connectionLostParams)
        {
            WriteToLog("  -> Conexão perdida", LogFile.INIT, false, LogType.DEBUG);
        }
    }
    
    // ============================================================================
    // EVENTO: MPConnectionRecoveredEventTypeID
    // Disparado quando a conexão multiplayer é recuperada
    // ============================================================================
    // else if (eventTypeId == MPConnectionRecoveredEventTypeID)
    // {
    // 	WriteToLog("EVENT: MPConnectionRecoveredEventTypeID - Conexão MP recuperada", LogFile.INIT, false, LogType.DEBUG);
    // 	MPConnectionRecoveredEventParams connectionRecoveredParams = MPConnectionRecoveredEventParams.Cast(params);
    // 	if (connectionRecoveredParams)
    // 	{
    // 		WriteToLog("  -> Conexão recuperada", LogFile.INIT, false, LogType.DEBUG);
    // 	}
    // }
    
    // ============================================================================
    // EVENTO: VONStateEventTypeID
    // Disparado quando o estado do Voice Over Network muda
    // typedef Param2<bool, bool> VONStateEventParams
    // Params: <bool, bool> - listening, toggled
    // ============================================================================
    else if (eventTypeId == VONStateEventTypeID)
    {
        //WriteToLog("EVENT: VONStateEventTypeID - Estado VON alterado", LogFile.INIT, false, LogType.DEBUG);
        //VONStateEventParams vonStateParams = VONStateEventParams.Cast(params);
        //if (vonStateParams)
        //{
            //bool listening = vonStateParams.param1;
            //bool toggled = vonStateParams.param2;
            //WriteToLog("  -> Listening: " + listening + " | Toggled: " + toggled, LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: VONStartSpeakingEventTypeID
    // Disparado quando um jogador começa a falar no VON
    // ============================================================================
    else if (eventTypeId == VONStartSpeakingEventTypeID)
    {
        //WriteToLog("EVENT: VONStartSpeakingEventTypeID - Jogador começou a falar", LogFile.INIT, false, LogType.DEBUG);
        //VONStartSpeakingEventParams vonStartParams = VONStartSpeakingEventParams.Cast(params);
        //if (vonStartParams)
        //{
        //    WriteToLog("  -> Jogador falando no VON", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    
    // ============================================================================
    // EVENTO: VONStopSpeakingEventTypeID
    // Disparado quando um jogador para de falar no VON
    // ============================================================================
    else if (eventTypeId == VONStopSpeakingEventTypeID)
    {
        //WriteToLog("EVENT: VONStopSpeakingEventTypeID - Jogador parou de falar", LogFile.INIT, false, LogType.DEBUG);
        //VONStopSpeakingEventParams vonStopParams = VONStopSpeakingEventParams.Cast(params);
        //if (vonStopParams)
        //{
        //    WriteToLog("  -> Jogador parou de falar no VON", LogFile.INIT, false, LogType.DEBUG);
        //}
    }
    // typedef Param2<DayZPlayer, Object> PlayerDeathEventParams
    // Player, "Killer" (Beware: Not necessarily actually the killer, Client doesn't have this info)
    // Params: <DayZPlayer, Object> - Player, Killer
    // Killer can be null if the player died by accident, or by suicide
    // Killer can be a DayZPlayer if the player was killed by another player
    // Killer can be an object if the player was killed by an object
    // Killer can be a string if the player was killed by a string
    // Killer can be a vector if the player was killed by a vector
    // Killer can be a float if the player was killed by a float
    else if (eventTypeId == PlayerDeathEventTypeID)
    {
        WriteToLog("EVENT: PlayerDeathEventTypeID - Jogador morreu", LogFile.INIT, false, LogType.DEBUG);
        PlayerDeathEventParams playerDeathParams = PlayerDeathEventParams.Cast(params);
        if (playerDeathParams)
        {
            DayZPlayer playerDead = playerDeathParams.param1;
            Object killer = playerDeathParams.param2;
            PlayerIdentity identityPlayerDead = playerDead.GetIdentity();
            if (identityPlayerDead)
            {
                WriteToLog("  -> Jogador morreu: " + identityPlayerDead.GetName() + " | PlayerID: " + identityPlayerDead.GetId() + " | SteamID: " + identityPlayerDead.GetPlainId(), LogFile.INIT, false, LogType.DEBUG);
                
                // Marca o jogador como morto recentemente para evitar enviar player_disconnected após morte
                ActivePlayer deadPlayer = GetActivePlayerById(identityPlayerDead.GetId());
                if (deadPlayer)
                {
                    deadPlayer.MarkAsDead();
                    WriteToLog("  -> Jogador marcado como morto recentemente: " + identityPlayerDead.GetName(), LogFile.INIT, false, LogType.DEBUG);
                }
            }
            if (killer)
            {
                WriteToLog("  -> Killer: " + killer.GetName(), LogFile.INIT, false, LogType.DEBUG);
            }
        }
    }
    
    // ============================================================================
    // EVENTO: LogoutEventTypeID
    // Disparado quando um jogador faz logout do servidor
    // Nota: Este evento pode não ter parâmetros definidos, então a detecção
    // principal de desconexão é feita via ScriptLogEventTypeID e ClientDisconnectedEventTypeID
    // ============================================================================
    else if (eventTypeId == LogoutEventTypeID)
    {
        WriteToLog("EVENT: LogoutEventTypeID - Jogador fazendo logout", LogFile.INIT, false, LogType.DEBUG);
        // LogoutEventTypeID pode não ter parâmetros definidos na API
        // A detecção de desconexão é feita principalmente via:
        // - ScriptLogEventTypeID (parsing de log)
        // - ClientDisconnectedEventTypeID (evento de desconexão)
        // - CleanupInvalidActivePlayers (limpeza periódica)
    }
    
    // ScriptLogEventTypeID
    //  typedef Param1<string> ScriptLogEventParams
    else if (eventTypeId == ScriptLogEventTypeID)
    {
        WriteToLog("EVENT: ScriptLogEventTypeID", LogFile.INIT, false, LogType.DEBUG);
        ScriptLogEventParams scriptParams = ScriptLogEventParams.Cast(params);
        if (scriptParams)
        {
            WriteToLog("  -> " + scriptParams.param1, LogFile.INIT, false, LogType.DEBUG);
            // Exemplo: "SCRIPT       : [Logout]: Player HdhIzjGbaI-1_-Q7p8Y1Xos04N4hk1DCNAn2QtdSYqw= finished"
            
            string msg = scriptParams.param1;
            if (msg.Contains("[Logout]"))
            {
                // Verifica se é logout cancelado
                if (msg.Contains("cancelled"))
                {
                    int playerStart = msg.IndexOf("Player ");
                    int playerEnd = msg.IndexOf(" cancelled");
                    if (playerStart != -1 && playerEnd != -1 && playerEnd > playerStart)
                    {
                        playerStart += 7; // Pular "Player "
                        string playerUID = msg.Substring(playerStart, playerEnd - playerStart).Trim();
                        WriteToLog("  -> LOGOUT CANCELADO DETECTADO | UID: " + playerUID, LogFile.INIT, false, LogType.INFO);
                        
                        // Remove da lista de desconexões pendentes
                        if (PendingDisconnects && PendingDisconnects.Contains(playerUID))
                        {
                            PendingDisconnects.Remove(playerUID);
                            WriteToLog("  -> Desconexão pendente cancelada via ScriptLogEventTypeID", LogFile.INIT, false, LogType.DEBUG);
                        }
                    }
                }
                // Verifica se é logout confirmado (finished)
                // FALLBACK: Usa parsing de log como backup caso o timer não funcione
                else if (msg.Contains("finished"))
                {
                    int finishedStart = msg.IndexOf("Player ");
                    int finishedEnd = msg.IndexOf(" finished");
                    if (finishedStart != -1 && finishedEnd != -1 && finishedEnd > finishedStart)
                    {
                        finishedStart += 7; // Pular "Player "
                        string finishedUID = msg.Substring(finishedStart, finishedEnd - finishedStart).Trim();
                        WriteToLog("  -> LOGOUT CONFIRMADO (finished) via ScriptLogEventTypeID | UID: " + finishedUID, LogFile.INIT, false, LogType.INFO);
                        
                        // Busca jogador para obter identity
                        ActivePlayer loggingOutPlayer = GetActivePlayerById(finishedUID);
                        identity = null;
                        player = null;
                        
                        if (loggingOutPlayer)
                        {
                            identity = loggingOutPlayer.GetIdentity();
                            player = loggingOutPlayer.GetPlayer();
                        }
                        else
                        {
                            // Tenta buscar identity através de GetPlayers
                            array<Man> players = new array<Man>();
                            GetGame().GetPlayers(players);
                            foreach (Man man : players)
                            {
                                PlayerBase pb = PlayerBase.Cast(man);
                                if (pb && pb.GetIdentity() && pb.GetIdentity().GetId() == finishedUID)
                                {
                                    identity = pb.GetIdentity();
                                    player = man;
                                    break;
                                }
                            }
                        }
                        
                        if (identity)
                        {
                            // Usa função centralizada para processar desconexão
                            HandlePlayerDisconnect(finishedUID, identity, player);
                            WriteToLog("  -> Desconexão processada via ScriptLogEventTypeID (fallback)", LogFile.INIT, false, LogType.DEBUG);
                        }
                        else
                        {
                            WriteToLog("  -> AVISO: Não foi possível encontrar Identity para: " + finishedUID, LogFile.INIT, false, LogType.ERROR);
                            // Remove mesmo assim para não ficar preso
                            if (PendingDisconnects && PendingDisconnects.Contains(finishedUID))
                            {
                                PendingDisconnects.Remove(finishedUID);
                            }
                            RemoveActivePlayerById(finishedUID);
                        }
                    }
                }
                // Logout iniciado (New player ... with logout time)
                else if (msg.Contains("New player") && msg.Contains("with logout time"))
                {
                    // Apenas loga, a desconexão pendente já foi marcada em ClientDisconnectedEventTypeID
                    WriteToLog("  -> Logout iniciado detectado no log", LogFile.INIT, false, LogType.DEBUG);
                }
            }
        }
    }
    // ============================================================================
    // EVENTO: ChatMessageEventTypeID
    // Disparado quando uma mensagem de chat é enviada
    // Params: <int, string, string, string> - Channel, From, Text, ColorClass
    // ============================================================================
    else if (eventTypeId == ChatMessageEventTypeID)
    {
        WriteToLog("EVENT: ChatMessageEventTypeID - Mensagem de chat recebida", LogFile.INIT, false, LogType.DEBUG);
        ChatMessageEventParams chatParams = ChatMessageEventParams.Cast(params);
        if (!chatParams) {
            WriteToLog("ChatMessageEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
            return;
        }

        channel = chatParams.param1;          // canal (0 = Global, 1 = System, etc)
        playerName = chatParams.param2;       // nome do jogador
        text = chatParams.param3;             // mensagem digitada
        colorClass = chatParams.param4;       // classe de cor
        
        WriteToLog("  -> Canal: " + channel + " | De: " + playerName + " | Mensagem: " + text, LogFile.INIT, false, LogType.DEBUG);

        if (text == "")
            return;
        
        // Mensagens do sistema (reinício)
        if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em"))
        {
            ref SafeZoneData restartNextMap = GetNextRegionData(DeathMatchConfigJsonFile);
            string restartCurrentRegion = "Indefinido";
            string restartNextRegion = "Indefinido";

            if (currentMap)
                restartCurrentRegion = currentMap.Region;

            if (restartNextMap)
                restartNextRegion = restartNextMap.Region;

            AppendExternalAction("{\"action\":\"event_minutes_to_restart\",\"current_time\":\"" + GetCurrentTimeInGame() + "\",\"message\":\"" + text + "\",\"current_map\":\"" + restartCurrentRegion + "\",\"next_map\":\"" + restartNextRegion + "\"}");
            return;
        }
        
        // Processar comandos de jogadores
        if (text.Length() == 0 || text.Get(0) != "!")
            return;

        // Se channel for 0 (Global), então é um comando de jogador
        // Solução abandonada porque o playername aqui pode ser duplicado
        // Para agilizar a execução, chama o CheckCommands diretamente
        GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY).CallLater(CheckCommands, 2000, false);
        
        CheckCommands();
        return;

        // playerBase = GetPlayerByName(playerName);
        // if (!playerBase) {				
        // 	WriteToLog("Player não identificado: " + playerName, LogFile.INIT, false, LogType.ERROR);
        // 	return;
        // }

        // TStringArray tokensCommands = new TStringArray;
        // text.Split(" ", tokensCommands);			
        // tokensCommands[0] = tokensCommands[0].Substring(1, tokensCommands[0].Length() - 1);
        // string playerID = playerBase.GetIdentity().GetId();
        // TStringArray tokens = new TStringArray;
        // tokens.Insert(playerID);
        // for (int i = 0; i < tokensCommands.Count(); i++)
        // 	tokens.Insert(tokensCommands.Get(i));

        // ExecuteCommand(tokens);
    } 
    // ============================================================================
    // EVENTO DESCONHECIDO
    // Captura qualquer outro evento não mapeado acima
    // ============================================================================
    else
    {
        string eventTypeName = GetEventTypeName(eventTypeId);
        WriteToLog("EVENT: Evento não mapeado capturado - Tipo: " + eventTypeName, LogFile.INIT, false, LogType.DEBUG);
    }
}

// ============================================================================
// FUNÇÃO: HandlePlayerDisconnect
// Processa desconexão de jogador de forma centralizada
// ============================================================================
void HandlePlayerDisconnect(string playerId, PlayerIdentity identity, Man player)
{
    if (!identity)
    {
        WriteToLog("HandlePlayerDisconnect(): Identity nula para PlayerID: " + playerId, LogFile.INIT, false, LogType.ERROR);
        return;
    }
    
    string playerName = identity.GetName();
    WriteToLog("HandlePlayerDisconnect(): Processando desconexão de " + playerName + " (ID: " + playerId + ")", LogFile.INIT, false, LogType.INFO);
    
    // Verifica se jogador morreu recentemente
    ActivePlayer disconnectingPlayer = GetActivePlayerById(playerId);
    bool shouldSendDisconnectLog = true;
    
    if (disconnectingPlayer)
    {
        if (disconnectingPlayer.IsRecentlyDead(10.0))
        {
            WriteToLog("HandlePlayerDisconnect(): Jogador morreu recentemente, não enviando player_disconnected", LogFile.INIT, false, LogType.DEBUG);
            shouldSendDisconnectLog = false;
        }
    }
    
    // Remove de ActivePlayers
    RemoveActivePlayerById(playerId);
    
    // Remove de PendingDisconnects se existir
    if (PendingDisconnects && PendingDisconnects.Contains(playerId))
    {
        PendingDisconnects.Remove(playerId);
        WriteToLog("HandlePlayerDisconnect(): Removido de PendingDisconnects", LogFile.INIT, false, LogType.DEBUG);
    }
    
    // Envia evento externo apenas se não morreu recentemente
    if (shouldSendDisconnectLog)
    {
        AppendExternalAction("{\"action\":\"player_disconnected\",\"player_id\":\"" + playerId + "\"}");
        WriteToLog("HandlePlayerDisconnect(): Evento player_disconnected enviado", LogFile.INIT, false, LogType.INFO);
    }
    else
    {
        WriteToLog("HandlePlayerDisconnect(): Evento player_disconnected NÃO enviado (jogador morreu recentemente)", LogFile.INIT, false, LogType.DEBUG);
    }
}

// ============================================================================
// FUNÇÃO: CheckPendingDisconnect
// Verifica se uma desconexão agendada deve ser processada
// ============================================================================
void CheckPendingDisconnect(string playerId)
{
    if (!PendingDisconnects || !PendingDisconnects.Contains(playerId))
    {
        WriteToLog("CheckPendingDisconnect(): Jogador não está em PendingDisconnects: " + playerId, LogFile.INIT, false, LogType.DEBUG);
        return;
    }
    
    int scheduledTime = PendingDisconnects.Get(playerId);
    int currentTime = GetGame().GetTime();
    
    WriteToLog("CheckPendingDisconnect(): Verificando desconexão para: " + playerId + " | Agendado: " + scheduledTime + " | Atual: " + currentTime, LogFile.INIT, false, LogType.DEBUG);
    
    // Se já passou o tempo, confirma desconexão
    if (currentTime >= scheduledTime)
    {
        WriteToLog("CheckPendingDisconnect(): Confirmando desconexão para: " + playerId, LogFile.INIT, false, LogType.INFO);
        
        // Busca jogador para obter identity
        ActivePlayer disconnectingPlayer = GetActivePlayerById(playerId);
        PlayerIdentity identity = null;
        Man player = null;
        
        if (disconnectingPlayer)
        {
            identity = disconnectingPlayer.GetIdentity();
            player = disconnectingPlayer.GetPlayer();
        }
        else
        {
            // Tenta buscar identity através de GetPlayers
            array<Man> players = new array<Man>();
            GetGame().GetPlayers(players);
            foreach (Man man : players)
            {
                PlayerBase pb = PlayerBase.Cast(man);
                if (pb && pb.GetIdentity() && pb.GetIdentity().GetId() == playerId)
                {
                    identity = pb.GetIdentity();
                    player = man;
                    break;
                }
            }
        }
        
        if (identity)
        {
            HandlePlayerDisconnect(playerId, identity, player);
        }
        else
        {
            WriteToLog("CheckPendingDisconnect(): Não foi possível encontrar Identity para: " + playerId, LogFile.INIT, false, LogType.ERROR);
            // Remove mesmo assim para não ficar preso
            PendingDisconnects.Remove(playerId);
        }
    }
    else
    {
        WriteToLog("CheckPendingDisconnect(): Ainda não é hora de desconectar: " + playerId + " (faltam " + ((scheduledTime - currentTime) / 1000) + " segundos)", LogFile.INIT, false, LogType.DEBUG);
    }
}