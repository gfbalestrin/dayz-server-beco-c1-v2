#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Globals.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/SafeZoneData.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayerId.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/ActivePlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Log.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Functions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/ExternalActions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/PlayersLoadout.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Commands.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VehicleSpawner.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Messages.c"

void main()
{
	//INIT ECONOMY--------------------------------------
	Hive ce = CreateHive();
	if ( ce )
		ce.InitOffline();

	//DATE RESET AFTER ECONOMY INIT-------------------------
	int year, month, day, hour, minute;
	int reset_month = 9, reset_day = 20;
	GetGame().GetWorld().GetDate(year, month, day, hour, minute);

	if ((month == reset_month) && (day < reset_day))
	{
		GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
	}
	else
	{
		if ((month == reset_month + 1) && (day > reset_day))
		{
			GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
		}
		else
		{
			if ((month < reset_month) || (month > reset_month + 1))
			{
				GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
			}
		}
	}
}

class CustomMission: MissionServer
{
	ref array<ref ActivePlayer> ActivePlayers;  // Lista de jogadores ativos/conectados
	ref array<string> FixedMessages;
	float m_AdminCheckCooldown10 = 10.0;
	float m_AdminCheckTimer10 = 0.0;

	void CustomMission()
	{
		ResetLog();
		EnsureAllFilesExist();
		WriteToLog("CustomMission(): Inicializando CustomMission", LogFile.INIT, false, LogType.INFO);

		FixedMessages = new array<string>;
		//FixedMessages.Insert("Para visualizar os comandos digite no chat: !help");
	}

	override void OnMissionStart()
    {
        super.OnMissionStart();

		WriteToLog("OnMissionStart(): Servidor reiniciado com sucesso!", LogFile.INIT, false, LogType.INFO);
		AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
        ActivePlayers = new array<ref ActivePlayer>();
    }
	
	// ============================================================================
	// FUNÇÕES HELPER PARA GERENCIAR JOGADORES ATIVOS
	// ============================================================================
	
	// Adiciona ou atualiza um jogador à lista de jogadores ativos
	void AddOrUpdateActivePlayer(PlayerIdentity identity, Man player = null)
	{
		if (!identity)
		{
			WriteToLog("AddOrUpdateActivePlayer(): Identity nula!", LogFile.INIT, false, LogType.ERROR);
			return;
		}
		
		string steamId = identity.GetPlainId();
		string playerName = identity.GetName();
		string playerId = identity.GetId();
		
		// Verifica se o jogador já está na lista
		ActivePlayer existingPlayer = GetActivePlayerBySteamId(steamId);
		if (existingPlayer)
		{
			// Atualiza o objeto Man se fornecido
			if (player)
			{
				existingPlayer.SetPlayer(player);
				WriteToLog("AddOrUpdateActivePlayer(): Player atualizado para " + playerName + " (" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
			}
			else
			{
				WriteToLog("AddOrUpdateActivePlayer(): Jogador já está na lista: " + playerName + " (" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
			}
			return;
		}
		
		// Cria e adiciona o novo jogador
		ActivePlayer newPlayer = new ActivePlayer(identity, player);
		ActivePlayers.Insert(newPlayer);
		WriteToLog("AddOrUpdateActivePlayer(): Jogador adicionado: " + playerName + " (PlayerID: " + playerId + ", SteamID: " + steamId + ")", LogFile.INIT, false, LogType.INFO);
	}
	
	// Remove um jogador da lista pelo Steam ID
	void RemoveActivePlayer(string steamId)
	{
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.IsSamePlayer(steamId))
			{
				WriteToLog("RemoveActivePlayer(): Jogador removido: " + player.GetPlayerName() + " (SteamID: " + steamId + ")", LogFile.INIT, false, LogType.INFO);
				ActivePlayers.Remove(i);
				return;
			}
		}
		WriteToLog("RemoveActivePlayer(): Jogador não encontrado na lista: " + steamId, LogFile.INIT, false, LogType.DEBUG);
	}
	
	// Remove um jogador da lista pelo Player ID
	void RemoveActivePlayerById(string playerId)
	{
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.IsSamePlayerById(playerId))
			{
				WriteToLog("RemoveActivePlayerById(): Jogador removido: " + player.GetPlayerName() + " (PlayerID: " + playerId + ")", LogFile.INIT, false, LogType.INFO);
				ActivePlayers.Remove(i);
				return;
			}
		}
		WriteToLog("RemoveActivePlayerById(): Jogador não encontrado na lista: " + playerId, LogFile.INIT, false, LogType.DEBUG);
	}
	
	// Busca um jogador ativo pelo Steam ID
	ActivePlayer GetActivePlayerBySteamId(string steamId)
	{
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.IsSamePlayer(steamId))
			{
				return player;
			}
		}
		return null;
	}
	
	// Busca um jogador ativo pelo Player ID
	ActivePlayer GetActivePlayerById(string playerId)
	{
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.IsSamePlayerById(playerId))
			{
				return player;
			}
		}
		return null;
	}
	
	// Retorna a quantidade de jogadores ativos
	int GetActivePlayersCount()
	{
		return ActivePlayers.Count();
	}
	
	// Lista todos os jogadores ativos no log
	void ListActivePlayers()
	{
		WriteToLog("=== JOGADORES ATIVOS (" + ActivePlayers.Count() + ") ===", LogFile.INIT, false, LogType.INFO);
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.HasIdentity())
			{
				float duration = player.GetConnectedDuration();
				WriteToLog("  [" + (i+1) + "] " + player.GetPlayerName() + " | PlayerID: " + player.GetPlayerId() + " | SteamID: " + player.GetSteamId() + " | Conectado há: " + duration.ToString() + "s", LogFile.INIT, false, LogType.INFO);
			}
		}
	}
	
	// Detecta jogadores "ghost" e tenta movê-los 1 metro para cima (MODO TESTE)
	// Se conseguir mover = ghost tem Man mas não aparece em GetPlayers()
	// Se não conseguir mover = ghost real sem Man válido (será desconectado)
	void DetectAndDisconnectGhosts()
	{
		// Pega todos os jogadores com objetos Man válidos
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);
		
		// Criar set de Player IDs válidos
		ref set<string> validPlayerIds = new set<string>();
		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity())
			{
				validPlayerIds.Insert(player.GetIdentity().GetId());
			}
		}
		
		// Verificar quais ActivePlayers são ghosts
		array<int> ghostIndices = new array<int>();
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer activePlayer = ActivePlayers.Get(i);
			if (!activePlayer || !activePlayer.HasIdentity()) continue;
			
			string playerId = activePlayer.GetPlayerId();
			
			// Se está em ActivePlayers mas NÃO está em GetPlayers = é um GHOST!
			if (validPlayerIds.Find(playerId) == -1)
			{
				ghostIndices.Insert(i);
			}
		}
		
		// Tenta mover os ghosts 1 metro para cima (TESTE)
		if (ghostIndices.Count() > 0)
		{
			WriteToLog("=== DETECTADOS " + ghostIndices.Count() + " JOGADORES GHOST - TENTANDO MOVER ===", LogFile.INIT, false, LogType.DEBUG);
			
			for (int j = ghostIndices.Count() - 1; j >= 0; j--)
			{
				int ghostIndex = ghostIndices.Get(j);
				ActivePlayer ghostPlayer = ActivePlayers.Get(ghostIndex);
				
				if (ghostPlayer && ghostPlayer.HasIdentity())
				{
					PlayerIdentity ghostIdentity = ghostPlayer.GetIdentity();
					string ghostName = ghostPlayer.GetPlayerName();
					string ghostPlayerId = ghostPlayer.GetPlayerId();
					string ghostSteamId = ghostPlayer.GetSteamId();
					
					WriteToLog("  -> GHOST DETECTADO: " + ghostName + " | PlayerID: " + ghostPlayerId + " | SteamID: " + ghostSteamId, LogFile.INIT, false, LogType.DEBUG);
					
					// Tenta mover o ghost 1 metro para cima
					bool movedSuccessfully = false;
					
					// Método 1: Usar o objeto Man armazenado em ActivePlayer
					Man ghostMan = ghostPlayer.GetPlayer();
					PlayerBase ghostPlayerBase = PlayerBase.Cast(ghostMan);

					vector currentPos = ghostPlayerBase.GetPosition();
					vector newPos = currentPos;
					newPos[1] = newPos[1] + 1.0;  // Move 1 metro para cima (eixo Y)
					
					//ghostPlayerBase.SetPosition(newPos);
					WriteToLog("  -> TESTE: Ghost movido usando Man armazenado! Pos anterior: " + currentPos.ToString() + " | Nova pos: " + newPos.ToString(), LogFile.INIT, false, LogType.INFO);
					movedSuccessfully = true;
					
					// Se não conseguiu mover, confirma que é ghost real e desconecta
					if (movedSuccessfully)
					{
						WriteToLog("  -> TESTE FALHOU: Não foi possível mover o ghost - objeto Man não acessível", LogFile.INIT, false, LogType.ERROR);
						WriteToLog("  -> Isso confirma que é um ghost REAL (sem objeto Man válido no mundo)", LogFile.INIT, false, LogType.DEBUG);
						
						// Desconecta o ghost
						WriteToLog("  -> Desconectando ghost...", LogFile.INIT, false, LogType.INFO);
						GetGame().DisconnectPlayer(ghostIdentity, ghostPlayerId);
						
						// Remove da lista
						ActivePlayers.Remove(ghostIndex);
						WriteToLog("  -> Ghost desconectado e removido da lista", LogFile.INIT, false, LogType.INFO);
					}
					else
					{
						WriteToLog("  -> TESTE SUCESSO: Ghost foi movido! Isso significa que ele TEM objeto Man, mas não aparece em GetPlayers()", LogFile.INIT, false, LogType.INFO);
						WriteToLog("  -> Ghost NÃO será desconectado para observação", LogFile.INIT, false, LogType.INFO);
					}
				}
			}
		}
	}

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
		//if (eventTypeId == MPConnectionLostEventTypeID) return "MPConnectionLostEventTypeID";
		//if (eventTypeId == MPConnectionRecoveredEventTypeID) return "MPConnectionRecoveredEventTypeID";
		if (eventTypeId == MPSessionPlayerReadyEventTypeID) return "MPSessionPlayerReadyEventTypeID";
		if (eventTypeId == MPSessionFailEventTypeID) return "MPSessionFailEventTypeID";
		
		// Eventos de Rede
		if (eventTypeId == NetworkManagerClientEventTypeID) return "NetworkManagerClientEventTypeID";
		if (eventTypeId == NetworkManagerServerEventTypeID) return "NetworkManagerServerEventTypeID";
		
		// Eventos de Progresso
		if (eventTypeId == ProgressEventTypeID) return "ProgressEventTypeID";
		
		// Eventos de Entidade
		//if (eventTypeId == EntityEventTypeID) return "EntityEventTypeID";
		
		// Eventos de VON (Voice Over Network)
		if (eventTypeId == VONStateEventTypeID) return "VONStateEventTypeID";
		if (eventTypeId == VONStartSpeakingEventTypeID) return "VONStartSpeakingEventTypeID";
		if (eventTypeId == VONStopSpeakingEventTypeID) return "VONStopSpeakingEventTypeID";
		
		// Eventos de Menu/Interface
		//if (eventTypeId == DialogQueueAddEventTypeID) return "DialogQueueAddEventTypeID";
		//if (eventTypeId == DialogQueueRemoveEventTypeID) return "DialogQueueRemoveEventTypeID";
		
		// Eventos de Partículas/Efeitos
		//if (eventTypeId == ParticleEventTypeID) return "ParticleEventTypeID";
		
		// Eventos de Mundo
		if (eventTypeId == WorldCleaupEventTypeID) return "WorldCleaupEventTypeID";
		
		// Se não encontrou, retorna desconhecido
		return "UNKNOWN_EVENT_TYPE";
	}

	override void OnEvent(EventType eventTypeId, Param params)
	{
		super.OnEvent(eventTypeId, params);

		// Variáveis compartilhadas entre os eventos
		PlayerIdentity identity;
		Man player;
		PlayerBase playerBase;
		string playerName;
		string steamId;
		int logoutTime;
		bool authFailed;
		vector position;
		int channel;
		string text;
		string colorClass;

		// ============================================================================
		// EVENTO: ClientConnectedEventTypeID
		// Disparado quando um cliente se conecta ao servidor (antes de spawn)
		// Params: <string, string> - Nome do jogador, SteamID
		// ============================================================================
		if (eventTypeId == ClientConnectedEventTypeID)
		{
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
		// Disparado quando um cliente se desconecta
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
			logoutTime = disconnectedParams.param3;    // Tempo de logout
			authFailed = disconnectedParams.param4;    // Falha de autenticação
			
			if (identity)
			{
				WriteToLog("  -> Jogador: " + identity.GetName() + " | ID: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
				WriteToLog("  -> LogoutTime: " + logoutTime + " | AuthFailed: " + authFailed, LogFile.INIT, false, LogType.DEBUG);
				
				// Remove o jogador da lista de jogadores ativos
				steamId = identity.GetPlainId();
				RemoveActivePlayer(steamId);
			}
			
			// Aqui você pode adicionar lógica de cleanup ou notificações
		}
		
		// ============================================================================
		// EVENTO: ClientNewEventTypeID
		// Disparado quando um cliente novo (primeira vez) entra no servidor
		// Params: <PlayerIdentity, vector, Serializer> - Identity, Position, Serializer (roupas)
		// ============================================================================
		else if (eventTypeId == ClientNewEventTypeID)
		{
			WriteToLog("EVENT: ClientNewEventTypeID - Novo jogador entrando pela primeira vez", LogFile.INIT, false, LogType.INFO);
			ClientNewEventParams newParams = ClientNewEventParams.Cast(params);
			if (!newParams) {
				WriteToLog("ClientNewEventParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
				return;
			}
			
			identity = newParams.param1;   // PlayerIdentity
			position = newParams.param2;   // Posição de spawn
			
			if (identity)
			{
				WriteToLog("  -> Novo jogador: " + identity.GetName() + " | PlayerID: " + identity.GetId() + " | Posição: " + position.ToString(), LogFile.INIT, false, LogType.INFO);
				
				// ⭐ ADICIONA o jogador novo à lista de jogadores ativos
				// Nota: Man/Player pode não estar disponível ainda neste evento
				AddOrUpdateActivePlayer(identity, null);
			}
			
			// Aqui você pode personalizar o spawn de novos jogadores
		}
		
		// ============================================================================
		// EVENTO: ClientReadyEventTypeID
		// Disparado quando o cliente está totalmente carregado e pronto para jogar
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
					if (player)
					{
						WriteToLog("  -> Man/Player PRESENTE no evento ClientReadyEventTypeID", LogFile.INIT, false, LogType.INFO);
						PlayerBase pb = PlayerBase.Cast(player);
						if (pb)
						{
							vector pos = pb.GetPosition();
							WriteToLog("  -> Posição do Player: " + pos.ToString(), LogFile.INIT, false, LogType.INFO);

							vector newPos = pos;
							newPos[1] = newPos[1] + 0.5;  // Move 1 metro para cima (eixo Y)							
							pb.SetPosition(newPos);
						}
					}
					else
					{
						WriteToLog("  -> AVISO: Man/Player é NULL no ClientReadyEventTypeID!", LogFile.INIT, false, LogType.DEBUG);
					}
					
					WriteToLog("  -> Jogador pronto: " + identity.GetName() + " | PlayerID: " + identity.GetId() + " | SteamID: " + identity.GetPlainId(), LogFile.INIT, false, LogType.INFO);
					
					// ⭐ ADICIONE ESTE LOG ANTES
					if (player)
					{
						WriteToLog("  -> ANTES AddOrUpdate: Man não é null", LogFile.INIT, false, LogType.DEBUG);
					}
					else
					{
						WriteToLog("  -> ANTES AddOrUpdate: Man é NULL!", LogFile.INIT, false, LogType.ERROR);
					}
					
					// Adiciona o jogador à lista
					AddOrUpdateActivePlayer(identity, player);
					
					// ⭐ ADICIONE ESTE LOG DEPOIS
					ActivePlayer addedPlayer = GetActivePlayerById(identity.GetId());
					if (addedPlayer)
					{
						if (addedPlayer.HasPlayer())
						{
							WriteToLog("  -> DEPOIS AddOrUpdate: Man foi armazenado com sucesso!", LogFile.INIT, false, LogType.INFO);
						}
						else
						{
							WriteToLog("  -> DEPOIS AddOrUpdate: Man NÃO foi armazenado (é null)!", LogFile.INIT, false, LogType.ERROR);
						}
					}
					
					WriteToLog("Total de jogadores conectados: " + GetActivePlayersCount(), LogFile.INIT, false, LogType.INFO);
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
				
				if (identity)
				{
					WriteToLog("  -> Jogador preparando: " + identity.GetName() + " | PlayerID: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
					WriteToLog("  -> UseDB: " + useDB + " | Pos: " + position.ToString() + " | Yaw: " + yaw + " | Timeout: " + preloadTimeout, LogFile.INIT, false, LogType.DEBUG);
				}
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
				if (identity)
				{
					WriteToLog("  -> Jogador respawnou: " + identity.GetName(), LogFile.INIT, false, LogType.DEBUG);
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
				if (identity)
				{
					WriteToLog("  -> Jogador reconectou: " + identity.GetName(), LogFile.INIT, false, LogType.DEBUG);
				}
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
			if (loginTimeParams)
			{
				// Params podem conter informações sobre o tempo de login
				WriteToLog("  -> LoginTime params disponíveis", LogFile.INIT, false, LogType.DEBUG);
			}
		}
		
		// ============================================================================
		// EVENTO: LoginStatusEventTypeID
		// Disparado quando o status de login muda
		// ============================================================================
		else if (eventTypeId == LoginStatusEventTypeID)
		{
			WriteToLog("EVENT: LoginStatusEventTypeID - Status de login alterado", LogFile.INIT, false, LogType.DEBUG);
			LoginStatusEventParams loginStatusParams = LoginStatusEventParams.Cast(params);
			if (loginStatusParams)
			{
				WriteToLog("  -> LoginStatus params disponíveis", LogFile.INIT, false, LogType.DEBUG);
			}
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
					WriteToLog("  -> Logout cancelado para: " + playerBase.GetIdentity().GetName(), LogFile.INIT, false, LogType.DEBUG);
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
			if (respawnEventParams)
			{
				WriteToLog("  -> Respawn event params disponíveis", LogFile.INIT, false, LogType.DEBUG);
			}
		}
		
		// ============================================================================
		// EVENTO: SetFreeCameraEventTypeID
		// Disparado quando a câmera livre é ativada (modo admin/espectador)
		// ============================================================================
		else if (eventTypeId == SetFreeCameraEventTypeID)
		{
			WriteToLog("EVENT: SetFreeCameraEventTypeID - Câmera livre ativada", LogFile.INIT, false, LogType.INFO);
			SetFreeCameraEventParams freeCamParams = SetFreeCameraEventParams.Cast(params);
			if (freeCamParams)
			{
				WriteToLog("  -> Câmera livre params disponíveis", LogFile.INIT, false, LogType.DEBUG);
			}
		}
		
		// ============================================================================
		// EVENTO: PreloadEventTypeID
		// Disparado durante o pré-carregamento de recursos
		// ============================================================================
		else if (eventTypeId == PreloadEventTypeID)
		{
			WriteToLog("EVENT: PreloadEventTypeID - Pré-carregamento de recursos", LogFile.INIT, false, LogType.DEBUG);
			PreloadEventParams preloadParams = PreloadEventParams.Cast(params);
			if (preloadParams)
			{
				WriteToLog("  -> Preload params disponíveis", LogFile.INIT, false, LogType.DEBUG);
			}
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
		// ============================================================================
		else if (eventTypeId == VONStateEventTypeID)
		{
			WriteToLog("EVENT: VONStateEventTypeID - Estado VON alterado", LogFile.INIT, false, LogType.DEBUG);
			VONStateEventParams vonStateParams = VONStateEventParams.Cast(params);
			if (vonStateParams)
			{
				WriteToLog("  -> Estado VON mudou", LogFile.INIT, false, LogType.DEBUG);
			}
		}
		
		// ============================================================================
		// EVENTO: VONStartSpeakingEventTypeID
		// Disparado quando um jogador começa a falar no VON
		// ============================================================================
		else if (eventTypeId == VONStartSpeakingEventTypeID)
		{
			WriteToLog("EVENT: VONStartSpeakingEventTypeID - Jogador começou a falar", LogFile.INIT, false, LogType.DEBUG);
			VONStartSpeakingEventParams vonStartParams = VONStartSpeakingEventParams.Cast(params);
			if (vonStartParams)
			{
				WriteToLog("  -> Jogador falando no VON", LogFile.INIT, false, LogType.DEBUG);
			}
		}
		
		// ============================================================================
		// EVENTO: VONStopSpeakingEventTypeID
		// Disparado quando um jogador para de falar no VON
		// ============================================================================
		else if (eventTypeId == VONStopSpeakingEventTypeID)
		{
			WriteToLog("EVENT: VONStopSpeakingEventTypeID - Jogador parou de falar", LogFile.INIT, false, LogType.DEBUG);
			VONStopSpeakingEventParams vonStopParams = VONStopSpeakingEventParams.Cast(params);
			if (vonStopParams)
			{
				WriteToLog("  -> Jogador parou de falar no VON", LogFile.INIT, false, LogType.DEBUG);
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
				//BroadcastMessage("Próximo mapa: " + nextMap.Region, MessageColor.FRIENDLY);				
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 60 minutos"))
			{
				//AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 1 minutos"))
			{
				AppendExternalAction("{\"action\":\"event_restarting\"}");
				WriteToLog("Servidor reiniciando...", LogFile.INIT, false, LogType.INFO);
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 5 minutos"))
			{	
				AppendExternalAction("{\"action\":\"event_minutes_to_restart\",\"current_time\":\"" + GetCurrentTimeInGame() + "\",\"message\":\"" + text + "\"}");
			}
			
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 10 minutos"))
			{
				return;
			}
			
			// Processar comandos de jogadores
			if (text.Length() == 0 || text.Get(0) != "!")
				return;

			playerBase = GetPlayerByName(playerName);
			if (!playerBase) {				
				WriteToLog("Player não identificado: " + playerName, LogFile.INIT, false, LogType.ERROR);
				return;
			}

			TStringArray tokensCommands = new TStringArray;
			text.Split(" ", tokensCommands);			
			tokensCommands[0] = tokensCommands[0].Substring(1, tokensCommands[0].Length() - 1);
			string playerID = playerBase.GetIdentity().GetId();
			TStringArray tokens = new TStringArray;
			tokens.Insert(playerID);
			for (int i = 0; i < tokensCommands.Count(); i++)
				tokens.Insert(tokensCommands.Get(i));

			ExecuteCommand(tokens);
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

	override void OnUpdate(float timeslice)
	{
		super.OnUpdate(timeslice);
		m_AdminCheckTimer10 += timeslice;

		// Garante que o mapa de rastreamento foi inicializado
		if (!lastSeenPlayers)
			lastSeenPlayers = new map<string, float>();

		if (m_AdminCheckTimer10 >= m_AdminCheckCooldown10)
		{
			m_AdminCheckTimer10 = 0.0;

			CheckCommands();
			array<string> msgs = CheckMessages();
			array<string> privMsgs = CheckPrivateMessages();
			
			// ⭐ Detecta e desconecta jogadores ghost automaticamente
			DetectAndDisconnectGhosts();

			array<Man> players = new array<Man>;
			GetGame().GetPlayers(players);
			WriteToLog("OnUpdate(): Encontrados " + players.Count() + " jogadores.", LogFile.INIT, false, LogType.INFO);

			ListActivePlayers();

			ref set<string> currentPlayers = new set<string>();

			foreach (Man man : players)
			{
				PlayerBase player = PlayerBase.Cast(man);
				if (!player)
					continue;

				PlayerIdentity identity = player.GetIdentity();
				if (!identity)
					continue;

				string playerId = identity.GetId();
				string playerName = identity.GetName();		
				string steamId = identity.GetPlainId();
				currentPlayers.Insert(playerId);

				// Atualiza ou insere no mapa de "vistos recentemente"
				if (lastSeenPlayers.Contains(playerId))
				{
					lastSeenPlayers.Set(playerId, GetGame().GetTime());
				}
				else
				{
					lastSeenPlayers.Insert(playerId, GetGame().GetTime());
					WriteToLog("Jogador logou " + playerId, LogFile.INIT, false, LogType.INFO);
					AppendExternalAction("{\"action\":\"update_player\",\"player_id\":\"" + playerId + "\",\"player_name\":\"" + playerName + "\",\"steam_id\":\"" + steamId + "\"}");
					AppendExternalAction("{\"action\":\"player_connected\",\"player_id\":\"" + playerId + "\"}");
				}

				// Mensagens públicas
				if (msgs)
				{
					foreach (string msg : msgs)
					{
						if (msg != "")
							player.MessageImportant(msg);
					}
				}

				// Mensagens privadas
				if (privMsgs)
				{
					foreach (string privMsg : privMsgs)
					{
						if (privMsg == "")
							continue;

						TStringArray privMsgArr = new TStringArray;
						privMsg.Split(";", privMsgArr);
						if (privMsgArr.Count() != 2)
						{
							WriteToLog("Mensagem privada fora do padrão: " + privMsg, LogFile.INIT, false, LogType.ERROR);
							continue;
						}

						if (privMsgArr[0] != playerId)
							continue;

						string messageText = privMsgArr[1];
						bool isError = messageText.Contains("[ERROR]");

						if (isError)
						{
							messageText.Replace("[ERROR]", "");
							SendPrivateMessage(playerId, messageText, MessageColor.IMPORTANT);
						}
						else
						{
							SendPrivateMessage(playerId, messageText, MessageColor.FRIENDLY);
						}
					}
				}
			}

			// Verifica quem desconectou
			array<string> disconnected = new array<string>();
			foreach (string pid, float timestamp : lastSeenPlayers)
			{
				if (currentPlayers.Find(pid) == -1)
				{
					float elapsed = GetGame().GetTime() - timestamp;
					if (elapsed > PLAYER_TIMEOUT * 1000)
					{
						disconnected.Insert(pid);						
					}
				}
			}

			foreach (string disconnectedId : disconnected)
			{
				lastSeenPlayers.Remove(disconnectedId);
				WriteToLog("Jogador deslogou " + disconnectedId, LogFile.INIT, false, LogType.INFO);
				AppendExternalAction("{\"action\":\"player_disconnected\",\"player_id\":\"" + disconnectedId + "\"}");					
			}
		}
	}
	
	void SetRandomHealth(EntityAI itemEnt)
	{
		if ( itemEnt )
		{
			float rndHlt = Math.RandomFloat( 0.45, 0.65 );
			itemEnt.SetHealth01( "", "", rndHlt );
		}
	}

	override PlayerBase CreateCharacter(PlayerIdentity identity, vector pos, ParamsReadContext ctx, string characterName)
	{
		string playerId   = identity.GetId();
		string playerName = identity.GetName();		
		string steamId    = identity.GetPlainId();

		Entity playerEnt;
		playerEnt = GetGame().CreatePlayer( identity, characterName, pos, 0, "NONE" );
		Class.CastTo( m_player, playerEnt );

		GetGame().SelectPlayer( identity, m_player );

		if (CheckIfIsAdmin(playerId)) 
		{
			WriteToLog("CreateCharacter(): " + playerName + " é admin.", LogFile.INIT, false, LogType.DEBUG);
			m_player.SetAllowDamage(false);
			GiveAdminLoadout(m_player, playerId);
		} else {
			WriteToLog("CreateCharacter(): " + playerName + " é jogador comum.", LogFile.INIT, false, LogType.DEBUG);
		}

		return m_player;
	}

	override void StartingEquipSetup(PlayerBase player, bool clothesChosen)
	{
		EntityAI itemClothing;
		EntityAI itemEnt;
		ItemBase itemBs;
		float rand;

		itemClothing = player.FindAttachmentBySlotName( "Body" );
		if ( itemClothing )
		{
			SetRandomHealth( itemClothing );
			
			itemEnt = itemClothing.GetInventory().CreateInInventory( "BandageDressing" );
			player.SetQuickBarEntityShortcut(itemEnt, 2);
			
			string chemlightArray[] = { "Chemlight_White", "Chemlight_Yellow", "Chemlight_Green", "Chemlight_Red" };
			int rndIndex = Math.RandomInt( 0, 4 );
			itemEnt = itemClothing.GetInventory().CreateInInventory( chemlightArray[rndIndex] );
			SetRandomHealth( itemEnt );
			player.SetQuickBarEntityShortcut(itemEnt, 1);

			rand = Math.RandomFloatInclusive( 0.0, 1.0 );
			if ( rand < 0.35 )
				itemEnt = player.GetInventory().CreateInInventory( "Apple" );
			else if ( rand > 0.65 )
				itemEnt = player.GetInventory().CreateInInventory( "Pear" );
			else
				itemEnt = player.GetInventory().CreateInInventory( "Plum" );
			player.SetQuickBarEntityShortcut(itemEnt, 3);
			SetRandomHealth( itemEnt );
		}
		
		itemClothing = player.FindAttachmentBySlotName( "Legs" );
		if ( itemClothing )
			SetRandomHealth( itemClothing );
		
		itemClothing = player.FindAttachmentBySlotName( "Feet" );
	}
};

Mission CreateCustomMission(string path)
{
	return new CustomMission();
}
