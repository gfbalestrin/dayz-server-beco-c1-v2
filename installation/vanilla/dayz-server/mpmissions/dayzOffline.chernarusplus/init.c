#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Globals.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/SafeZoneData.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayerId.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/ActivePlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Log.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Functions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/ExternalActions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Construction.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VoteMapManager.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VoteKickManager.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/PlayersLoadout.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Commands.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VehicleSpawner.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/DeathMatchConfig.c"
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
	float m_AdminCheckCooldown60 = 60.0;
	float m_AdminCheckTimer60 = 0.0;

	void CustomMission()
	{
		ResetLog();
		EnsureAllFilesExist();
		WriteToLog("CustomMission(): Inicializando CustomMission", LogFile.INIT, false, LogType.INFO);

		FixedMessages = new array<string>;
		//FixedMessages.Insert("Para visualizar os comandos digite no chat: !help");
	}

	override void OnInit()
    {
        super.OnInit();
        // Aguarda o mundo carregar, detecta veículos e inicia rastreamento
    	GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(this.InitVehicleTracking, 10000, false);
    }

	override void OnMissionStart()
    {
        super.OnMissionStart();

		WriteToLog("OnMissionStart(): Servidor reiniciado com sucesso!", LogFile.INIT, false, LogType.INFO);
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SendStartEvent, 5000, false);
		// Loop contínuo para aplicar efeitos aos admins
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateAdminEffects, 5000, true);
        ActivePlayers = new array<ref ActivePlayer>();
		
    }

	void UpdateAdminEffects()
	{
		array<Man> players = new array<Man>;
		GetGame().GetPlayers(players);

		// Se não há jogadores conectados, sai
		if (players.Count() == 0)
			return;

		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (!player) continue;                   // Garante que player existe
			if (!player.IsAlive()) continue;         // Ignora mortos
			if (!player.GetIdentity()) continue;     // Ignora jogadores ainda carregando

			string id = player.GetIdentity().GetId();

			// --- STAMINA infinita ---
			if (g_AdminInfiniteStamina.Contains(id) && g_AdminInfiniteStamina.Get(id))
			{
				StaminaHandler handler = player.GetStaminaHandler();
				if (handler)
				{
					handler.SetStamina(handler.GetStaminaCap());
				}
			}
			
		}
	}


	void SendStartEvent()
	{
		AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
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
		
		// ============================================================================
		// DETECÇÃO DE DUPLICAÇÃO NO MUNDO
		// Verifica se já existe personagem físico com mesmo PlayerID
		// ============================================================================
		array<Man> allPlayers = new array<Man>();
		GetGame().GetPlayers(allPlayers);
		
		int duplicateCount = 0;
		Man firstFoundMan = null;
		
		foreach (Man m : allPlayers)
		{
			PlayerBase pb = PlayerBase.Cast(m);
			if (pb && pb.GetIdentity() && pb.GetIdentity().GetId() == playerId)
			{
				duplicateCount++;
				if (!firstFoundMan)
					firstFoundMan = m;
					
				string detectMsg = "AddOrUpdateActivePlayer(): DETECTADO personagem no mundo #" + duplicateCount.ToString() + " com PlayerID: " + playerId + " | Nome: " + pb.GetIdentity().GetName() + " | Pos: " + pb.GetPosition().ToString();
				WriteToLog(detectMsg, LogFile.INIT, false, LogType.INFO);
			}
		}
		
		if (duplicateCount > 1)
		{
			string alertMsg = "AddOrUpdateActivePlayer(): ALERTA! Múltiplos personagens detectados (" + duplicateCount.ToString() + ") para o mesmo PlayerID!";
			WriteToLog(alertMsg, LogFile.INIT, false, LogType.ERROR);
		}
		
		string playerParamStatus = "NULL";
		if (player)
			playerParamStatus = "VÁLIDO";
		
		string resumoMsg = "AddOrUpdateActivePlayer(): Resumo - Duplicados: " + duplicateCount.ToString() + " | player param: " + playerParamStatus;
		WriteToLog(resumoMsg, LogFile.INIT, false, LogType.DEBUG);
		
		if (duplicateCount == 1 && !player)
		{
			WriteToLog("AddOrUpdateActivePlayer(): ALERTA! Personagem já existe no mundo mas player param é NULL", LogFile.INIT, false, LogType.DEBUG);
		}
		else if (duplicateCount == 1 && player && firstFoundMan != player)
		{
			WriteToLog("AddOrUpdateActivePlayer(): DUPLICAÇÃO CRÍTICA! Personagem existente é DIFERENTE do novo!", LogFile.INIT, false, LogType.ERROR);
		}
		
		// ============================================================================
		// DEBUG: Verifica se player está presente
		// ============================================================================
		string playerStatus = "NULL";
		if (player)
			playerStatus = "PRESENTE";
		
		WriteToLog("AddOrUpdateActivePlayer(): DEBUG - player=" + playerStatus + " | PlayerName: " + playerName, LogFile.INIT, false, LogType.DEBUG);
		
		// Se player é null, tenta buscar manualmente
		if (!player)
		{
			player = FindPlayerManInWorld(playerId);
			
			string searchResult = "FALHOU";
			if (player)
				searchResult = "ENCONTRADO";
			
			WriteToLog("AddOrUpdateActivePlayer(): DEBUG - Player era null, buscado manualmente: " + searchResult, LogFile.INIT, false, LogType.DEBUG);
		}
		
		// ============================================================================
		// DETECÇÃO DE DUPLICAÇÃO FÍSICA: Verifica se já existe outro personagem no mundo
		// ============================================================================
		if (player)
		{
			Man existingManInWorld = FindPlayerManInWorld(playerId);
			
			string foundResult = "NULL";
			if (existingManInWorld)
				foundResult = "ENCONTRADO";
			
			WriteToLog("AddOrUpdateActivePlayer(): DEBUG - FindPlayerManInWorld retornou: " + foundResult, LogFile.INIT, false, LogType.DEBUG);
			
			// Se já existe um personagem no mundo E é diferente do que está sendo adicionado = DUPLICAÇÃO!
			if (existingManInWorld && existingManInWorld != player)
			{
				WriteToLog("AddOrUpdateActivePlayer(): DEBUG - Comparação: existingMan IS DIFFERENT from newPlayer", LogFile.INIT, false, LogType.DEBUG);
				
				PlayerBase ghostPB = PlayerBase.Cast(existingManInWorld);
				if (ghostPB)
				{
					vector ghostPos = ghostPB.GetPosition();
					string ghostSteamId = ghostPB.GetIdentity().GetPlainId();
					
					WriteToLog("AddOrUpdateActivePlayer(): DUPLICAÇÃO DETECTADA! Deletando personagem ghost: " + playerName + " | Pos: " + ghostPos.ToString() + " | SteamID: " + ghostSteamId, LogFile.INIT, false, LogType.INFO);
					
					// Força desconexão do ghost primeiro
					GetGame().DisconnectPlayer(ghostPB.GetIdentity(), playerId);
					
					// Deletar fisicamente o ghost do mundo (garante remoção imediata)
					GetGame().ObjectDelete(existingManInWorld);
					
					WriteToLog("AddOrUpdateActivePlayer(): Ghost deletado fisicamente do mundo com sucesso", LogFile.INIT, false, LogType.INFO);
				}
			}
			else if (existingManInWorld == player)
			{
				WriteToLog("AddOrUpdateActivePlayer(): DEBUG - Comparação: existingMan IS THE SAME as newPlayer (normal)", LogFile.INIT, false, LogType.DEBUG);
			}
		}

		// Verifica se existe algum player na lista com o mesmo steamId OU playerId
		ActivePlayer foundBySteamId = null;
		ActivePlayer foundByPlayerId = null;
		int foundBySteamIdIndex = -1;
		int foundByPlayerIdIndex = -1;

		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer actPlayer = ActivePlayers.Get(i);
			if (!actPlayer) continue;

			if (actPlayer.IsSamePlayer(steamId)) {
				foundBySteamId = actPlayer;
				foundBySteamIdIndex = i;
			}

			if (actPlayer.IsSamePlayerById(playerId)) {
				foundByPlayerId = actPlayer;
				foundByPlayerIdIndex = i;
			}

			// Se já encontrou ambos, pode parar
			if (foundBySteamId && foundByPlayerId) break;
		}

		// Se já existe o jogador por steamId OU por playerId, atualiza se necessário e retorna
		if (foundBySteamId || foundByPlayerId)
		{
			ActivePlayer existingPlayer = foundBySteamId;
			int existingPlayerIndex = foundBySteamIdIndex;
			if (!existingPlayer) 
			{
				existingPlayer = foundByPlayerId;
				existingPlayerIndex = foundByPlayerIdIndex;
			}

			// Garante que playerId e steamId não são inconsistentes
			if (foundBySteamId && foundByPlayerId && foundBySteamId != foundByPlayerId)
			{
				WriteToLog("AddOrUpdateActivePlayer(): Conflito - jogador com playerId e steamId duplicados diferentes! SteamID: " + steamId + ", PlayerID: " + playerId, LogFile.INIT, false, LogType.ERROR);
				return;
			}

			// ============================================================================
			// DETECÇÃO DE RECONEXÃO RÁPIDA (Ghost via ActivePlayers)
			// Se existingPlayer tem Identity válida = sessão antiga ainda registrada
			// ============================================================================
			if (existingPlayer && existingPlayer.HasIdentity())
			{
				WriteToLog("AddOrUpdateActivePlayer(): RECONEXÃO RÁPIDA DETECTADA! Removendo sessão antiga...", LogFile.INIT, false, LogType.INFO);
				
				// Pega o objeto Man do ghost
				Man ghostMan = existingPlayer.GetPlayer();
				
				// Força desconexão
				PlayerIdentity ghostIdentity = existingPlayer.GetIdentity();
				GetGame().DisconnectPlayer(ghostIdentity, playerId);
				
				// Deletar fisicamente se o objeto existe
				if (ghostMan)
				{
					WriteToLog("AddOrUpdateActivePlayer(): Deletando objeto Man do ghost...", LogFile.INIT, false, LogType.INFO);
					GetGame().ObjectDelete(ghostMan);
				}
				
				// Remove de ActivePlayers
				ActivePlayers.Remove(existingPlayerIndex);
				WriteToLog("AddOrUpdateActivePlayer(): Sessão antiga removida com sucesso", LogFile.INIT, false, LogType.INFO);
				
				// Agora adiciona o novo normalmente (continua o fluxo abaixo)
				ActivePlayer newReconnectedPlayer = new ActivePlayer(identity, player);
				ActivePlayers.Insert(newReconnectedPlayer);
				WriteToLog("AddOrUpdateActivePlayer(): Jogador readicionado após remoção de sessão antiga: " + playerName + " (PlayerID: " + playerId + ", SteamID: " + steamId + ")", LogFile.INIT, false, LogType.INFO);
				return;
			}

			// ANTES DE ATUALIZAR: Verifica se o jogador existente é um GHOST (verificação legada)
			bool existingPlayerIsGhost = false;
			if (existingPlayer && existingPlayer.HasIdentity())
			{
				string existingPlayerId = existingPlayer.GetPlayerId();
				
				// Verifica se está em ActivePlayers mas não no mundo
				if (!IsPlayerActiveInWorld(existingPlayerId))
				{
					existingPlayerIsGhost = true;
					WriteToLog("AddOrUpdateActivePlayer(): Ghost detectado para SteamID " + steamId + " (PlayerID: " + existingPlayerId + "). Forçando desconexão...", LogFile.INIT, false, LogType.INFO);
					
					// Força desconexão do ghost
					ForceDisconnectGhost(existingPlayer);
					
					// Remove o ghost da lista
					ActivePlayers.Remove(existingPlayerIndex);
					WriteToLog("AddOrUpdateActivePlayer(): Ghost removido da lista após desconexão", LogFile.INIT, false, LogType.INFO);
				}
			}
			
			// Se era um ghost, adiciona o novo jogador normalmente
			if (existingPlayerIsGhost)
			{
				ActivePlayer newGhostPlayer = new ActivePlayer(identity, player);
				ActivePlayers.Insert(newGhostPlayer);
				WriteToLog("AddOrUpdateActivePlayer(): Jogador adicionado após remoção de ghost: " + playerName + " (PlayerID: " + playerId + ", SteamID: " + steamId + ")", LogFile.INIT, false, LogType.INFO);
			}
			else
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
			}
			return;
		}

		// Cria e adiciona o novo jogador
		ActivePlayer newActivePlayer = new ActivePlayer(identity, player);
		ActivePlayers.Insert(newActivePlayer);
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
	
	// Retorna a quantidade de jogadores ativos (apenas jogadores válidos)
	int GetActivePlayersCount()
	{
		int validCount = 0;
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.HasIdentity())
			{
				validCount++;
			}
		}
		return validCount;
	}
	
	// Lista todos os jogadores ativos no log e limpa automaticamente jogadores inválidos
	void ListActivePlayers()
	{
		int validCount = GetActivePlayersCount();
		WriteToLog("=== JOGADORES ATIVOS (" + validCount + ") ===", LogFile.INIT, false, LogType.INFO);
		
		int displayIndex = 1;
		bool hasInvalidPlayers = false;
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.HasIdentity())
			{
				float duration = player.GetConnectedDuration();
				WriteToLog("  [" + displayIndex + "] " + player.GetPlayerName() + " | PlayerID: " + player.GetPlayerId() + " | SteamID: " + player.GetSteamId() + " | Conectado há: " + duration.ToString() + "s", LogFile.INIT, false, LogType.INFO);
				displayIndex++;
			} else {
				// Jogador inválido encontrado - será removido automaticamente
				WriteToLog("  [INVÁLIDO] Índice " + i + " contém jogador inválido", LogFile.INIT, false, LogType.DEBUG);
				hasInvalidPlayers = true;
			}
		}
		
		// Limpa automaticamente jogadores inválidos se encontrados
		if (hasInvalidPlayers)
		{
			WriteToLog("ListActivePlayers(): Jogadores inválidos detectados, executando limpeza automática...", LogFile.INIT, false, LogType.INFO);
			CleanupInvalidActivePlayers();
		}
	}
	
	// Força desconexão de um jogador ghost
	void ForceDisconnectGhost(ActivePlayer ghostPlayer)
	{
		if (!ghostPlayer || !ghostPlayer.HasIdentity()) 
		{
			WriteToLog("ForceDisconnectGhost(): GhostPlayer inválido", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
		
		PlayerIdentity identity = ghostPlayer.GetIdentity();
		string ghostName = ghostPlayer.GetPlayerName();
		string ghostSteamId = ghostPlayer.GetSteamId();
		string ghostPlayerId = ghostPlayer.GetPlayerId();
		
		WriteToLog("ForceDisconnectGhost(): Forçando desconexão de ghost: " + ghostName + " (SteamID: " + ghostSteamId + ", PlayerID: " + ghostPlayerId + ")", LogFile.INIT, false, LogType.INFO);
		GetGame().DisconnectPlayer(identity, ghostPlayerId);
	}
	
	// Verifica se um jogador está ativo no mundo (existe em GetPlayers())
	bool IsPlayerActiveInWorld(string playerId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);
		
		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity() && player.GetIdentity().GetId() == playerId)
			{
				return true;
			}
		}
		return false;
	}
	
	// Busca um personagem no mundo pelo PlayerID e retorna o objeto Man
	Man FindPlayerManInWorld(string playerId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);
		
		foreach (Man man : players)
		{
			PlayerBase pb = PlayerBase.Cast(man);
			if (pb && pb.GetIdentity() && pb.GetIdentity().GetId() == playerId)
			{
				return man;
			}
		}
		return null;
	}
	
	// Limpa corpos órfãos/ghosts próximos ao jogador (clone bodies sem Identity)
	void CleanOrphanedBodiesNearPlayer(PlayerBase player, float radius)
	{
		if (!player) return;
		
		vector playerPos = player.GetPosition();
		
		array<Object> nearbyObjects = new array<Object>();
		array<CargoBase> proxyCargos = new array<CargoBase>();
		
		GetGame().GetObjectsAtPosition(playerPos, radius, nearbyObjects, proxyCargos);
		
		int deletedCount = 0;
		
		foreach (Object obj : nearbyObjects)
		{
			PlayerBase pb = PlayerBase.Cast(obj);
			if (!pb) continue;
			
			if (pb == player) continue;
			
			if (!pb.GetIdentity())
			{
				vector orphanPos = pb.GetPosition();
				WriteToLog("CleanOrphanedBodiesNearPlayer(): Corpo órfão detectado (sem Identity) | Pos: " + orphanPos.ToString(), LogFile.INIT, false, LogType.INFO);
				GetGame().ObjectDelete(pb);
				deletedCount++;
				continue;
			}
			
			string pbId = pb.GetIdentity().GetId();
			bool foundInGetPlayers = false;
			
			array<Man> allPlayers = new array<Man>();
			GetGame().GetPlayers(allPlayers);
			
			foreach (Man m : allPlayers)
			{
				PlayerBase activePB = PlayerBase.Cast(m);
				if (activePB && activePB.GetIdentity() && activePB.GetIdentity().GetId() == pbId)
				{
					foundInGetPlayers = true;
					break;
				}
			}
			
			if (!foundInGetPlayers)
			{
				WriteToLog("CleanOrphanedBodiesNearPlayer(): Ghost body detectado (tem Identity mas não em GetPlayers) | ID: " + pbId, LogFile.INIT, false, LogType.INFO);
				GetGame().ObjectDelete(pb);
				deletedCount++;
			}
		}
		
		if (deletedCount > 0)
		{
			string summaryMsg = "CleanOrphanedBodiesNearPlayer(): " + deletedCount.ToString() + " corpos órfãos deletados";
			WriteToLog(summaryMsg, LogFile.INIT, false, LogType.INFO);
		}
	}
	
	// Limpa jogadores inválidos do array ActivePlayers e força desconexão de ghosts
	void CleanupInvalidActivePlayers()
	{
		// Pega lista de jogadores ativos no mundo
		array<Man> activeWorldPlayers = new array<Man>();
		GetGame().GetPlayers(activeWorldPlayers);
		
		ref set<string> validPlayerIds = new set<string>();
		foreach (Man man : activeWorldPlayers)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity())
			{
				validPlayerIds.Insert(player.GetIdentity().GetId());
			}
		}
		
		int removedCount = 0;
		int disconnectedCount = 0;
		
		for (int i = ActivePlayers.Count() - 1; i >= 0; i--)
		{
			ActivePlayer activePlayerItem = ActivePlayers.Get(i);
			
			if (!activePlayerItem || !activePlayerItem.HasIdentity())
			{
				// Jogador sem Identity - remove
				ActivePlayers.Remove(i);
				removedCount++;
			}
			else
			{
				string playerId = activePlayerItem.GetPlayerId();
				
				// Verifica se jogador está em ActivePlayers mas NÃO está no mundo (GHOST!)
				if (validPlayerIds.Find(playerId) == -1)
				{
					// É um ghost! Força desconexão
					ForceDisconnectGhost(activePlayerItem);
					ActivePlayers.Remove(i);
					disconnectedCount++;
					removedCount++;
					WriteToLog("CleanupInvalidActivePlayers(): Ghost desconectado e removido - " + activePlayerItem.GetPlayerName() + " (ID: " + playerId + ")", LogFile.INIT, false, LogType.INFO);
				}
			}
		}
		
		if (removedCount > 0)
		{
			WriteToLog("CleanupInvalidActivePlayers(): Removidos " + removedCount + " jogadores inválidos (" + disconnectedCount + " foram desconectados por serem ghosts)", LogFile.INIT, false, LogType.INFO);
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

	// Função helper para obter o objeto Man através do PlayerIdentity
	Man GetManFromIdentity(PlayerIdentity identity)
	{
		if (!identity)
		{
			WriteToLog("GetManFromIdentity(): Identity nula!", LogFile.INIT, false, LogType.ERROR);
			return null;
		}

		// Usa a função GetPlayerById que já existe em Functions.c
		PlayerBase player = GetPlayerById(identity.GetId());
		if (player)
		{
			WriteToLog("GetManFromIdentity(): Man encontrado para " + identity.GetName(), LogFile.INIT, false, LogType.DEBUG);
			return player;
		}
		else
		{
			WriteToLog("GetManFromIdentity(): Man NÃO encontrado para " + identity.GetName(), LogFile.INIT, false, LogType.DEBUG);
			return null;
		}
	}

	// Função reutilizável para processar jogador quando estiver pronto
	void ProcessPlayerReady(PlayerIdentity identity, Man player)
	{
		if (!identity)
		{
			WriteToLog("ProcessPlayerReady(): Identity nula!", LogFile.INIT, false, LogType.ERROR);
			return;
		}

		if (player)
		{
			WriteToLog("  -> Man/Player PRESENTE no evento ClientReadyEventTypeID", LogFile.INIT, false, LogType.INFO);
			PlayerBase pb = PlayerBase.Cast(player);
			if (pb)
			{
				vector pos = pb.GetPosition();
				WriteToLog("  -> Posição do Player: " + pos.ToString(), LogFile.INIT, false, LogType.INFO);

				vector newPos = pos;
				newPos[1] = newPos[1] + 0.5;  // Move 0.5 metro para cima (eixo Y)							
				pb.SetPosition(newPos);

				WriteToLog("  -> Posição alterada para: " + newPos[0].ToString() + " " + newPos[1].ToString() + " " + newPos[2].ToString(), LogFile.INIT, false, LogType.INFO);
			}
		}
		else
		{
			WriteToLog("  -> AVISO: Man/Player é NULL no ClientReadyEventTypeID!", LogFile.INIT, false, LogType.DEBUG);
		}
		
		WriteToLog("  -> Jogador pronto: " + identity.GetName() + " | PlayerID: " + identity.GetId() + " | SteamID: " + identity.GetPlainId(), LogFile.INIT, false, LogType.INFO);
									
		// Adiciona o jogador à lista
		AddOrUpdateActivePlayer(identity, player);
		
		// Limpa corpos órfãos/ghosts próximos após 2 segundos
		if (player)
		{
			PlayerBase pbForCleanup = PlayerBase.Cast(player);
			if (pbForCleanup)
			{
				GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(CleanOrphanedBodiesNearPlayer, 2000, false, pbForCleanup, 100.0);
			}
		}
		
		// Verifica se o jogador foi adicionado corretamente
		ActivePlayer addedPlayer = GetActivePlayerById(identity.GetId());
		if (addedPlayer)
		{
			if (addedPlayer.HasPlayer())
			{
				string playerNameToUpdate = identity.GetName();

				// Sanitize o nome do jogador para uso seguro em JSON/Banco/Shell
				// Remove caracteres potencialmente perigosos: | ; ` $ " ' \ < > & (pipe, ponto e vírgula, aspas, etc)
				TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
				foreach (string ch : unsafeChars) {
					playerNameToUpdate.Replace(ch, "-");
				}

				// Limita o tamanho do nome e remove caracteres de controle \n \r \t
				playerNameToUpdate.Replace("\n", "");
				playerNameToUpdate.Replace("\r", "");
				playerNameToUpdate.Replace("\t", "");
				if (playerNameToUpdate.Length() > 32)
					playerNameToUpdate = playerNameToUpdate.Substring(0, 32);

				AppendExternalAction("{\"action\":\"update_player\",\"player_id\":\"" + identity.GetId() + "\",\"player_name\":\"" + playerNameToUpdate + "\",\"steam_id\":\"" + identity.GetPlainId() + "\"}");
				AppendExternalAction("{\"action\":\"player_connected\",\"player_id\":\"" + identity.GetId() + "\"}");
			}
			else
			{
				WriteToLog("  -> DEPOIS AddOrUpdate: Man NÃO foi armazenado (é null)!", LogFile.INIT, false, LogType.ERROR);
			}
		}
		
		WriteToLog("Total de jogadores conectados: " + GetActivePlayersCount(), LogFile.INIT, false, LogType.INFO);
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
		// Disparado quando um cliente inicia a desconexão MAS NÃO INDICA QUE O JOGADOR DESCONECTOU!
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
				//WriteToLog("  -> Jogador: " + identity.GetName() + " | ID: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
				//WriteToLog("  -> LogoutTime: " + logoutTime + " | AuthFailed: " + authFailed, LogFile.INIT, false, LogType.DEBUG);				
				// Remove o jogador da lista de jogadores ativos
				//steamId = identity.GetPlainId();
				//RemoveActivePlayer(steamId);				
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
				
				// Tenta obter o objeto Man através do PlayerIdentity
				Man playerMan = GetManFromIdentity(identity);
				
				// Usa a função reutilizável para processar o jogador
				ProcessPlayerReady(identity, playerMan);
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
					// Usa a função reutilizável para processar o jogador
					ProcessPlayerReady(identity, player);
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
					//WriteToLog("  -> UseDB: " + useDB + " | Pos: " + position.ToString() + " | Yaw: " + yaw + " | Timeout: " + preloadTimeout, LogFile.INIT, false, LogType.DEBUG);
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
		// typedef Param2<bool, bool> VONStateEventParams
		// Params: <bool, bool> - listening, toggled
		// ============================================================================
		else if (eventTypeId == VONStateEventTypeID)
		{
			WriteToLog("EVENT: VONStateEventTypeID - Estado VON alterado", LogFile.INIT, false, LogType.DEBUG);
			VONStateEventParams vonStateParams = VONStateEventParams.Cast(params);
			if (vonStateParams)
			{
				bool listening = vonStateParams.param1;
				bool toggled = vonStateParams.param2;
				WriteToLog("  -> Listening: " + listening + " | Toggled: " + toggled, LogFile.INIT, false, LogType.DEBUG);
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
				}
				if (killer)
				{
					WriteToLog("  -> Killer: " + killer.GetName(), LogFile.INIT, false, LogType.DEBUG);
				}
			}
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
					int playerStart = msg.IndexOf("Player ");
					int playerEnd = msg.IndexOf(" finished");
					if (playerStart != -1 && playerEnd != -1 && playerEnd > playerStart)
					{
						playerStart += 7; // Pular "Player "
						string playerUID = msg.Substring(playerStart, playerEnd - playerStart).Trim();
						WriteToLog("  -> EVENTO DE LOGOUT DETECTADO | UID: " + playerUID, LogFile.INIT, false, LogType.INFO);
						RemoveActivePlayerById(playerUID);
						AppendExternalAction("{\"action\":\"player_disconnected\",\"player_id\":\"" + playerUID + "\"}");
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
				//BroadcastMessage("Próximo mapa: " + nextMap.Region, MessageColor.FRIENDLY);				
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 60 minutos"))
			{
				//AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 1 minutos"))
			{
				//AppendExternalAction("{\"action\":\"event_restarting\"}");
				//WriteToLog("Servidor reiniciando...", LogFile.INIT, false, LogType.INFO);
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

	override void OnUpdate(float timeslice)
	{
		super.OnUpdate(timeslice);
		m_AdminCheckTimer10 += timeslice;
		m_AdminCheckTimer60 += timeslice;

		if (m_AdminCheckTimer10 >= m_AdminCheckCooldown10)
		{
			m_AdminCheckTimer10 = 0.0;

			CheckCommands();
			array<string> msgs = CheckMessages();
			array<string> privMsgs = CheckPrivateMessages();
			
			// Detecta e desconecta jogadores ghost automaticamente (aparentemente resolvido e não é necessário mais)
			//DetectAndDisconnectGhosts();

			

			array<Man> players = new array<Man>;
			GetGame().GetPlayers(players);

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

		}

	// Timer de 60 segundos para envio de posições
	if (m_AdminCheckTimer60 >= m_AdminCheckCooldown60)
	{
		m_AdminCheckTimer60 = 0.0;
		CleanTrackedVehicles(); // Limpa veículos destruídos do array
		ListActivePlayers();
		SendPlayersPositions();
		SendVehiclesPositions();
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
	
	// ============================================================================
	// FUNÇÕES DE TRACKING DE VEÍCULOS
	// ============================================================================
	
	// Inicializa o rastreamento de veículos
	void InitVehicleTracking()
	{
		WriteToLog("Iniciando rastreamento de veículos...", LogFile.INIT, false, LogType.DEBUG);

		// Garante que o array seja inicializado
		if (!m_TrackedVehicles)
		{
			WriteToLog("Inicializando array m_TrackedVehicles...", LogFile.INIT, false, LogType.DEBUG);
			m_TrackedVehicles = new array<CarScript>();
		}
		else
		{
			WriteToLog("Array m_TrackedVehicles já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
			m_TrackedVehicles.Clear();
		}

		vector center = "7500 0 7500";
		float radius = 20000;

		array<Object> nearbyObjects = new array<Object>();
		GetGame().GetObjectsAtPosition(center, radius, nearbyObjects, null);

		foreach (Object obj : nearbyObjects)
		{
			CarScript vehicle = CarScript.Cast(obj);
			if (vehicle)
			{
				m_TrackedVehicles.Insert(vehicle);
				//WriteToLog("[TRACKING] Veículo adicionado: " + vehicle.GetDisplayName(), LogFile.INIT, false, LogType.DEBUG);
			}
		}

		WriteToLog("Total de veículos em rastreamento: " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
	}

	
	// Limpa veículos null do array de rastreamento
	void CleanTrackedVehicles()
	{
		if (!m_TrackedVehicles)
			return;
			
		int cleaned = 0;
		for (int i = m_TrackedVehicles.Count() - 1; i >= 0; i--)
		{
			if (!m_TrackedVehicles.Get(i))
			{
				m_TrackedVehicles.Remove(i);
				cleaned++;
			}
		}
		
		if (cleaned > 0)
		{
			WriteToLog("CleanTrackedVehicles(): " + cleaned.ToString() + " veículos null removidos", LogFile.INIT, false, LogType.DEBUG);
		}
	}

	// Envia posições de todos os jogadores ativos via ExternalAction
	void SendPlayersPositions()
	{
		array<Man> players = new array<Man>;
		GetGame().GetPlayers(players);

		if (players.Count() == 0)
			return;

		string playersJson = "";

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
			vector position = player.GetPosition();

			// Sanitiza o nome do jogador para uso seguro em JSON
			string safeName = playerName;
			TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
			foreach (string ch : unsafeChars)
			{
				safeName.Replace(ch, "-");
			}
			safeName.Replace("\n", "");
			safeName.Replace("\r", "");
			safeName.Replace("\t", "");
			if (safeName.Length() > 32)
				safeName = safeName.Substring(0, 32);

			if (playersJson != "")
				playersJson += ",";
			
			playersJson += "{\"player_id\":\"" + playerId + "\",\"player_name\":\"" + safeName + "\",\"x\":" + position[0].ToString() + ",\"z\":" + position[1].ToString() + ",\"y\":" + position[2].ToString() + "}";
		}

		string jsonAction = "{\"action\":\"players_positions\",\"players\":[" + playersJson + "]}";
		AppendExternalAction(jsonAction);
		
		WriteToLog("SendPlayersPositions(): Posições de " + players.Count().ToString() + " jogadores enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
	}

	// Envia posições de todos os veículos rastreados via ExternalAction
	void SendVehiclesPositions()
	{
		if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
			return;

		string vehiclesJson = "";

		foreach (CarScript vehicle : m_TrackedVehicles)
		{
			if (!vehicle)
				continue;

			vector position = vehicle.GetPosition();
			string vehicleName = vehicle.GetDisplayName();
			int vehicleId = vehicle.GetID();
			
			// Sanitiza o nome do veículo
			string safeName = vehicleName;
			TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
			foreach (string ch : unsafeChars)
			{
				safeName.Replace(ch, "-");
			}
			
			if (vehiclesJson != "")
				vehiclesJson += ",";
			
			vehiclesJson += "{\"vehicle_id\":\"" + vehicleId.ToString() + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + position[0].ToString() + ",\"z\":" + position[1].ToString() + ",\"y\":" + position[2].ToString() + "}";
		}

		string jsonAction = "{\"action\":\"vehicles_positions\",\"vehicles\":[" + vehiclesJson + "]}";
		AppendExternalAction(jsonAction, false);
		
		WriteToLog("SendVehiclesPositions(): Posições de " + m_TrackedVehicles.Count().ToString() + " veículos enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
	}
};

Mission CreateCustomMission(string path)
{
	return new CustomMission();
}


