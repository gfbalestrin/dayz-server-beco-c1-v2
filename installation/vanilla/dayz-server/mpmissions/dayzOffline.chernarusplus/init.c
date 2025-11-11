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
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/WorldTracking.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/FencesTracking.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VehicleTracking.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/LootTracking.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Commands.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/VehicleSpawner.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/DeathMatchConfig.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Messages.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/OnEventCustom.c"

void main()
{
	mainCustom();	
}

class CustomMission: MissionServer
{	

	void CustomMission()
	{
		ResetLog();
		EnsureAllFilesExist();
		WriteToLog("CustomMission(): Inicializando CustomMission", LogFile.INIT, false, LogType.INFO);

		FixedMessages = new array<string>;

		if (IsDeathmatchEnabled) 
		{
			FixedMessages.Insert("Para visualizar os comandos digite no chat: !help");

			currentMap = LoadActiveRegionData(DeathMatchConfigJsonFile);
			if (currentMap)
			{
				WriteToLog("CustomMission(): SafeZoneData carregado", LogFile.INIT, false, LogType.INFO);

				// Configura para próximo mapa
				ToggleActiveRegion(DeathMatchConfigJsonFile);
				// Instancia classe de votação de mapa
				g_VoteMapManager = new VoteMapManager();
				// Instancia classe de votação de kick
				g_VoteKickManager = new VoteKickManager();

				customMessage = currentMap.CustomMessage;
				regionStr = currentMap.Region;

				if (currentMap.SpawnZones)
				{
					spawnZones = currentMap.GetSpawnZoneVectors();
					WriteToLog("CustomMission(): spawnZones carregadas", LogFile.INIT, false, LogType.INFO);
					foreach (vector spawnZone : spawnZones) {
						WriteToLog("spawnZone: " + spawnZone.ToString(), LogFile.INIT, false, LogType.DEBUG);
					}
				}
				else
				{
					WriteToLog("CustomMission(): spawnZones nulas, inicializando vazia", LogFile.INIT, false, LogType.ERROR);
					spawnZones = new array<vector>;
				}

				if (currentMap.WallZones)
				{
					wallZones = currentMap.GetWallZoneVectors();
					WriteToLog("CustomMission(): wallZones carregadas", LogFile.INIT, false, LogType.INFO);
					foreach (vector wallZone : wallZones) {
						WriteToLog("wallZone: " + wallZone.ToString(), LogFile.INIT, false, LogType.DEBUG);
					}
				}
				else
				{
					WriteToLog("CustomMission(): wallZones nulas, inicializando vazia", LogFile.INIT, false, LogType.ERROR);
					wallZones = new array<vector>;
				}

				if (wallZones.Count() > 0)
				{
					WriteToLog("CustomMission(): Construindo wallzones (" + wallZones.Count() + ")", LogFile.INIT, false, LogType.INFO);
					array<vector> points = new array<vector>;
					for (int i = 0; i < wallZones.Count(); i++)
					{
						points.Insert(wallZones[i]);
					}
					// CreateLinePathFromPoints(points, "Land_Container_1Bo", 6.0, 1.0, 0.0);
					// CreateLinePathFromPoints(points, "Land_Container_1Bo", 6.0, 3.5, 0.0);
					CreateLinePathFromPoints(points, "StaticObj_Roadblock_Wood_Long_DE", 3.0, 0.5, 90.0);
					WriteToLog("CustomMission(): Wallzones construídas com sucesso", LogFile.INIT, false, LogType.INFO);
					
				}

				if (currentMap.Spawns)
				{
					spawns = currentMap.Spawns;
					WriteToLog("CustomMission(): Spawns carregados", LogFile.INIT, false, LogType.INFO);
					if (spawns.Vehicles)
					{
						foreach (SafeZoneDataVehicle vehicle : spawns.Vehicles) {
							bool successSpawnVehicle = SpawnVehicleWithParts(vehicle.GetCoord(), vehicle.name);
							if (successSpawnVehicle)
								WriteToLog("Veículo " + vehicle.name + " criado com sucesso na posição " + vehicle.coord, LogFile.INIT, false, LogType.DEBUG);
							else
								WriteToLog("Falha ao criar veículo " + vehicle.name + " criado com sucesso na posição " + vehicle.coord, LogFile.INIT, false, LogType.ERROR);
						}
					}				
				}
				else
				{
					WriteToLog("CustomMission(): nenhum Spawns configurado", LogFile.INIT, false, LogType.ERROR);
				}
				
			}
			else
			{
				WriteToLog("CustomMission(): Erro ao carregar SafeZoneData", LogFile.INIT, false, LogType.ERROR);
			}
		}
	}

	override void OnInit()
    {
        super.OnInit();
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SendStartEvent, 5000, false);    
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(InitWorldTracking, 5000, false);  
    }

	override void OnMissionStart()
    {
        super.OnMissionStart();

		WriteToLog("OnMissionStart(): Servidor reiniciado com sucesso!", LogFile.INIT, false, LogType.INFO);

		InitializeVestGrenadeSlots();

		ActivePlayers = new array<ref ActivePlayer>();
		
		//if (!IsDeathmatchEnabled)
		//{
			// Loop contínuo para aplicar efeitos aos admins
			//GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(InitAdminLoop, 5000, false); // aguarda 5 segundos
			//ActivePlayers = new array<ref ActivePlayer>();
			//GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(LogLootContainersDetailed, 5000, false);
		//}		
    }

	void InitAdminLoop()
	{
		if (!GetGame())
		{
			Print("[AdminSystem] GetGame() ainda nulo, reagendando...");
			GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(InitAdminLoop, 5000, false);
			return;
		}

		Print("[AdminSystem] Loop de efeitos iniciado com sucesso!");
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(UpdateAdminEffects, 5000, true);
	}

	void UpdateAdminEffects()
	{
		int appliedCount = 0;
		if (!g_PlayersWithInfiniteStamina)
		{
			//WriteToLog("UpdateAdminEffects(): g_PlayersWithInfiniteStamina nulo - inicializando array", LogFile.INIT, false, LogType.DEBUG);
			g_PlayersWithInfiniteStamina = new array<ref ActivePlayer>();
			return;
		}
		//WriteToLog("UpdateAdminEffects(): tamanho de g_PlayersWithInfiniteStamina = " + g_PlayersWithInfiniteStamina.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);

		// Sanitiza/remover entradas nulas antes de iterar
		for (int si = g_PlayersWithInfiniteStamina.Count() - 1; si >= 0; si--)
		{
			ref ActivePlayer ap = g_PlayersWithInfiniteStamina.Get(si);
			if (!ap || !ap.HasIdentity())
			{
				//WriteToLog("UpdateAdminEffects(): removendo entrada inválida na lista (índice=" + si.ToString() + ")", LogFile.INIT, false, LogType.DEBUG);
				g_PlayersWithInfiniteStamina.Remove(si);
			}
		}

		if (g_PlayersWithInfiniteStamina.Count() == 0)
		{
			//WriteToLog("UpdateAdminEffects(): lista de stamina infinita vazia - nada a fazer", LogFile.INIT, false, LogType.DEBUG);
			return;
		}

		array<Man> players = new array<Man>;
		GetGame().GetPlayers(players);
		//WriteToLog("UpdateAdminEffects(): jogadores no mundo retornados por GetPlayers = " + players.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);

		// Se não há jogadores conectados, sai
		if (players.Count() == 0)
		{
			//WriteToLog("UpdateAdminEffects(): nenhum jogador no mundo - retornando", LogFile.INIT, false, LogType.DEBUG);
			return;
		}

		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (!player) { WriteToLog("UpdateAdminEffects(): ignorando objeto que não é PlayerBase", LogFile.INIT, false, LogType.DEBUG); continue; }
			if (!player.IsAlive()) { WriteToLog("UpdateAdminEffects(): ignorando jogador morto", LogFile.INIT, false, LogType.DEBUG); continue; }
			if (!player.GetIdentity()) { WriteToLog("UpdateAdminEffects(): ignorando jogador sem Identity (carregando)", LogFile.INIT, false, LogType.DEBUG); continue; }

			string playerId = player.GetIdentity().GetId();
			string playerName = player.GetIdentity().GetName();
			//WriteToLog("UpdateAdminEffects(): processando jogador '" + playerName + "' (ID=" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);

			bool foundMatch = false;
			//WriteToLog("UpdateAdminEffects(): procurando ID na lista de stamina infinita -> " + playerId, LogFile.INIT, false, LogType.DEBUG);
			for (int i = 0; i < g_PlayersWithInfiniteStamina.Count(); i++)
			{
				ref ActivePlayer playerWithInfiniteStamina = g_PlayersWithInfiniteStamina.Get(i);
				if (!playerWithInfiniteStamina)
				{
					//WriteToLog("UpdateAdminEffects(): item da lista nulo no índice " + i.ToString(), LogFile.INIT, false, LogType.DEBUG);
					continue;
				}
				string listPid = playerWithInfiniteStamina.GetPlayerId();
				//WriteToLog("UpdateAdminEffects(): verificando índice " + i.ToString() + " da lista (PlayerID=" + listPid + ")", LogFile.INIT, false, LogType.DEBUG);
				if (playerWithInfiniteStamina.IsSamePlayerById(playerId))
				{
					foundMatch = true;
					StaminaHandler handler = player.GetStaminaHandler();
					if (handler)
					{
						float before = handler.GetStamina();
						float cap = handler.GetStaminaCap();
						handler.SetStamina(cap);
						float after = handler.GetStamina();
						appliedCount++;
						//WriteToLog("UpdateAdminEffects(): stamina aplicada para '" + playerName + "' (antes=" + before.ToString() + ", depois=" + after.ToString() + ", cap=" + cap.ToString() + ")", LogFile.INIT, false, LogType.DEBUG);
					}
					else
					{
						//WriteToLog("UpdateAdminEffects(): StaminaHandler nulo para jogador '" + playerName + "' (ID=" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
					}
					break;
				}
			}
			if (!foundMatch)
			{
				//WriteToLog("UpdateAdminEffects(): jogador NÃO encontrado na lista de stamina infinita -> ID=" + playerId, LogFile.INIT, false, LogType.DEBUG);
			}

		}
		//WriteToLog("UpdateAdminEffects(): finalizado - stamina aplicada em " + appliedCount.ToString() + " jogador(es)", LogFile.INIT, false, LogType.DEBUG);
	}

	void SendStartEvent()
	{
		if (IsDeathmatchEnabled)
		{
			AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\",\"current_map\":\"" + currentMap.Region + "\"}");
		}
		else
		{
			AppendExternalAction("{\"action\":\"event_start_finished\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
		}
	}
	
	// Remove um jogador da lista pelo Steam ID
	void RemoveActivePlayer(string steamId)
	{
		if (!ActivePlayers)
		{
			WriteToLog("RemoveActivePlayer(): AVISO - ActivePlayers está NULL!", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
		
		bool removed = false;
		for (int i = ActivePlayers.Count() - 1; i >= 0; i--)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (!player)
				continue;
			if (!player.IsSamePlayer(steamId))
				continue;
			string nameLog = player.GetPlayerName();
			if (nameLog == "")
				nameLog = player.GetPlayerId();
			WriteToLog("RemoveActivePlayer(): Jogador removido: " + nameLog + " (SteamID: " + player.GetSteamId() + ")", LogFile.INIT, false, LogType.INFO);
			ActivePlayers.Remove(i);
			removed = true;
		}
		if (!removed)
		{
			WriteToLog("RemoveActivePlayer(): Jogador não encontrado na lista: " + steamId, LogFile.INIT, false, LogType.DEBUG);
		}
	}
	
	// Busca um jogador ativo pelo Steam ID
	ActivePlayer GetActivePlayerBySteamId(string steamId)
	{
		if (!ActivePlayers)
		{
			return null;
		}
		
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
	
	// Lista todos os jogadores ativos no log e limpa automaticamente jogadores inválidos
	void ListActivePlayers()
	{
		// Verifica se ActivePlayers está inicializado
		if (!ActivePlayers)
		{
			WriteToLog("ListActivePlayers(): AVISO - ActivePlayers está NULL! Inicializando...", LogFile.INIT, false, LogType.ERROR);
			ActivePlayers = new array<ref ActivePlayer>();
			WriteToLog("=== JOGADORES ATIVOS (0) ===", LogFile.INIT, false, LogType.INFO);
			return;
		}
		
		int validCount = GetActivePlayersCount();
		WriteToLog("=== JOGADORES ATIVOS (" + validCount + ") ===", LogFile.INIT, false, LogType.INFO);
		
		int displayIndex = 1;
		bool hasInvalidPlayers = false;
		ref set<string> observedPlayerIds = new set<string>();
		ref set<string> observedSteamIds = new set<string>();
		for (int i = 0; i < ActivePlayers.Count(); i++)
		{
			ActivePlayer player = ActivePlayers.Get(i);
			if (player && player.HasIdentity())
			{
				float duration = player.GetConnectedDuration();
				WriteToLog("  [" + displayIndex + "] " + player.GetPlayerName() + " | PlayerID: " + player.GetPlayerId() + " | SteamID: " + player.GetSteamId() + " | Conectado há: " + duration.ToString() + "s", LogFile.INIT, false, LogType.INFO);

				string listedPlayerId = player.GetPlayerId();
				string listedSteamId = player.GetSteamId();
				if ((listedPlayerId != "") && (observedPlayerIds.Find(listedPlayerId) != -1))
				{
					WriteToLog("ListActivePlayers(): Duplicata detectada para PlayerID " + listedPlayerId + ", removendo entradas excedentes.", LogFile.INIT, false, LogType.DEBUG);
					PurgeDuplicateActivePlayers(i, listedPlayerId, listedSteamId);
				}
				else if (listedPlayerId != "")
				{
					observedPlayerIds.Insert(listedPlayerId);
				}

				if ((listedSteamId != "") && (observedSteamIds.Find(listedSteamId) == -1))
				{
					observedSteamIds.Insert(listedSteamId);
				}

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
		
	// Limpa jogadores inválidos do array ActivePlayers e força desconexão de ghosts
	void CleanupInvalidActivePlayers()
	{
		// Verifica se ActivePlayers está inicializado
		if (!ActivePlayers)
		{
			WriteToLog("CleanupInvalidActivePlayers(): AVISO - ActivePlayers está NULL!", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
		
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
			if (!activePlayerItem)
			{
				ActivePlayers.Remove(i);
				removedCount++;
				continue;
			}
			string storedPlayerId = activePlayerItem.GetPlayerId();
			string storedSteamId = activePlayerItem.GetSteamId();
			string storedName = activePlayerItem.GetPlayerName();
			if (storedName == "")
				storedName = storedPlayerId;
			
			if (!activePlayerItem.HasIdentity())
			{
				WriteToLog("CleanupInvalidActivePlayers(): Removendo jogador sem Identity - Nome: " + storedName + " | PlayerID: " + storedPlayerId + " | SteamID: " + storedSteamId, LogFile.INIT, false, LogType.DEBUG);
				ActivePlayers.Remove(i);
				removedCount++;
				continue;
			}
			
			// Verifica se jogador está em ActivePlayers mas NÃO está no mundo (GHOST!)
			if (validPlayerIds.Find(storedPlayerId) == -1)
			{
				// É um ghost! Força desconexão
				ForceDisconnectGhost(activePlayerItem);
				ActivePlayers.Remove(i);
				disconnectedCount++;
				removedCount++;
				WriteToLog("CleanupInvalidActivePlayers(): Ghost desconectado e removido - " + storedName + " (ID: " + storedPlayerId + ")", LogFile.INIT, false, LogType.INFO);
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
		// Verifica se ActivePlayers está inicializado
		if (!ActivePlayers)
		{
			WriteToLog("DetectAndDisconnectGhosts(): AVISO - ActivePlayers está NULL!", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
		
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

	override void OnEvent(EventType eventTypeId, Param params)
	{
		super.OnEvent(eventTypeId, params);
		OnEventCustom(eventTypeId, params);
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

				if (IsDeathmatchEnabled)
				{
					// Verifica zona de barreira
					if (wallZones)
						CheckPlayerAreaPolygonal(player, wallZones);
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

		}

	// Timer de 60 segundos para envio de posições
	if (m_AdminCheckTimer60 >= m_AdminCheckCooldown60)
	{
		m_AdminCheckTimer60 = 0.0;
		if (IsDeathmatchEnabled)
		{
			AppendMessage(customMessage);
			foreach (string msgFixed : FixedMessages)
			{
				if (!g_VoteMapManager.GetStatusVotingMap())
					AppendMessage(msgFixed);
			}
			CleanUpDeadEntitiesNearPlayers();
		} 
		
		CleanTrackedVehicles(); // Limpa veículos destruídos do array
		SendVehiclesPositions();
		CleanTrackedFences();
		SendFencesStatus();		
		
		ListActivePlayers();
		SendPlayersPositions();		
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
		if (IsDeathmatchEnabled)
		{
			// Gera posição segura de respawn
			vector safePosition = GetFarthestSpawnPosition(spawnZones);//GetRandomSafeSpawnPosition(spawnZones);
			WriteToLog("CreateCharacter(): Posicionando jogador em: " + safePosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
			// Cria nova entidade do jogador
			playerEnt = GetGame().CreatePlayer(identity, characterName, safePosition, 0, "NONE");
			if (!playerEnt) {
				WriteToLog("CreateCharacter(): Erro ao criar player!", LogFile.INIT, false, LogType.ERROR);
				return null;
			}
		} else {
			playerEnt = GetGame().CreatePlayer( identity, characterName, pos, 0, "NONE" );
		}
		
		if (!Class.CastTo(m_player, playerEnt)) {
			WriteToLog("CreateCharacter(): Erro ao fazer cast para PlayerBase", LogFile.INIT, false, LogType.ERROR);
			return null;
		}

		GetGame().SelectPlayer( identity, m_player );

		if (CheckIfIsAdmin(playerId)) 
		{
			WriteToLog("CreateCharacter(): " + playerName + " é admin.", LogFile.INIT, false, LogType.DEBUG);
			m_player.SetAllowDamage(false);
			m_player.SetHealth("", "", 100);
            m_player.SetHealth("GlobalHealth", "Blood", 5000);
            m_player.SetHealth("GlobalHealth", "Shock", 5000);
            m_player.GetStatEnergy().Set(4000);
            m_player.GetStatWater().Set(4000);
			GiveAdminLoadout(m_player, playerId);
		} else {
			WriteToLog("CreateCharacter(): " + playerName + " é jogador comum.", LogFile.INIT, false, LogType.DEBUG);

			m_player.SetAllowDamage(false);

			if (!GiveCustomLoadout(m_player, playerId)) {
				WriteToLog("CreateCharacter(): Loadout customizado não encontrado. Aplicando padrão.", LogFile.INIT, false, LogType.DEBUG);
				if (IsDeathmatchEnabled)
				{
					GiveDefaultDeathmatchLoadout(m_player, playerId);
				}					
			}

			if (IsDeathmatchEnabled)
			{
				// Stats/posição/dano depois
				//GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY).CallLater(PostSpawnInit, 300, false, m_player, pos);
				//ScheduleSpawnStaminaBurst(m_player);
				m_player.SetHealth("", "", 100);
				m_player.SetHealth("GlobalHealth", "Blood", 5000);
				m_player.SetHealth("GlobalHealth", "Shock", 5000);
				m_player.GetStatEnergy().Set(4000);
				m_player.GetStatWater().Set(4000);
			}

			m_player.SetAllowDamage(true);
		}

		return m_player;
	}

	void PostSpawnInit(PlayerBase p, vector pos)
	{
		if (!p) return;

		// Reforça posição (autoridade do servidor)
		p.SetPosition(pos);

		// Stats base
		p.SetHealth("", "", 100);
		p.SetHealth("GlobalHealth", "Blood", 5000);
		p.SetHealth("GlobalHealth", "Shock", 5000); // <-- não 0

		p.GetStatEnergy().Set(4000);
		p.GetStatWater().Set(4000);

		// Recarrega stamina para evitar micro-travas
		StaminaHandler sh = p.GetStaminaHandler();
		if (sh) sh.SetStamina(sh.GetStaminaMax());

		// Libera dano após estabilizar
		p.SetAllowDamage(true);
	}

	void BoostStaminaOnce(PlayerBase player)
	{
		if (!player) return;
		StaminaHandler sh = player.GetStaminaHandler();
		if (sh) sh.SetStamina(sh.GetStaminaMax());
	}

	void BlockSprintWindow(PlayerBase p)
	{
		if (!p) return;
		StaminaHandler sh = p.GetStaminaHandler();
		if (!sh) return;

		// Bloqueia sprint (sem travar WASD)
		sh.SetStamina(0);

		auto q = GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY);
		q.CallLater(BoostStaminaOnce, 400, false, p);  // libera depois
	}

	// Dispara 3 pulses espaçados (cobre janela de sync inicial)
	void ScheduleSpawnStaminaBurst(PlayerBase player)
	{
		auto q = GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY);
		q.CallLater(BoostStaminaOnce,  50, false, player);
		q.CallLater(BoostStaminaOnce, 250, false, player);
		q.CallLater(BoostStaminaOnce,1000, false, player);
	}

	override void OnClientRespawnEvent(PlayerIdentity identity, PlayerBase player)
	{
		super.OnClientRespawnEvent(identity, player);
		if (IsDeathmatchEnabled)
		{
			BlockSprintWindow(player);
			ScheduleSpawnStaminaBurst(player);
		}
		if (identity)
		{
			EnsureActivePlayerHasManRef(identity.GetId(), player);
		}
	}

	override void StartingEquipSetup(PlayerBase player, bool clothesChosen)
	{
		if (IsDeathmatchEnabled)
		{
			return;
		}

		// Obter playerId do player
		string playerId = GetPlayerId(player);
		
		// Se for admin, não dar equipamento inicial (já recebe loadout admin)
		if (CheckIfIsAdmin(playerId))
		{
			WriteToLog("StartingEquipSetup(): Player é admin, pulando equipamento inicial.", LogFile.INIT, false, LogType.DEBUG);
			return;
		}

		ref array<ref LoadoutPlayer> loadoutsPlayer = GetAllLoudoutsFromPlayer(playerId);
		if (!loadoutsPlayer) {
			WriteToLog("Nenhum loadout encontrado para o playerId: " + playerId, LogFile.INIT, false, LogType.INFO);
			return;
		}
		
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
	
	// Função auxiliar para coletar item nas mãos do jogador
	string GetItemsInHands(PlayerBase player)
	{
		string itemsJson = "";
		if (!player)
			return itemsJson;

		// Usa GetItemInHands() que retorna o item que o jogador está segurando
		EntityAI itemInHands = player.GetItemInHands();
		if (itemInHands)
		{
			string itemType = itemInHands.GetType();
			string safeItemType = SanitizeForJson(itemType);
			itemsJson = "\"" + safeItemType + "\"";
		}

		return itemsJson;
	}

	// Função auxiliar para coletar itens principais do inventário
	string GetMainItems(PlayerBase player, int maxItems)
	{
		string itemsJson = "";
		int itemCount = 0;
		
		if (!player)
			return itemsJson;

		// Itera pelos itens do inventário principal (attachments)
		int attachmentCount = player.GetInventory().AttachmentCount();
		for (int i = 0; i < attachmentCount && itemCount < maxItems; i++)
		{
			EntityAI item = player.GetInventory().GetAttachmentFromIndex(i);
			if (!item)
				continue;

			string itemType = item.GetType();
			string safeItemType = SanitizeForJson(itemType);
			
			if (itemsJson != "")
				itemsJson += ",";
			itemsJson += "\"" + safeItemType + "\"";
			itemCount++;
		}

		return itemsJson;
	}

	// Função auxiliar para contar total de itens no inventário
	int CountInventoryItems(PlayerBase player)
	{
		int count = 0;
		if (!player)
			return count;

		// Conta attachments do inventário principal
		count += player.GetInventory().AttachmentCount();

		// Conta itens nas mãos
		HumanInventory humanInv = player.GetHumanInventory();
		if (humanInv)
			count += humanInv.AttachmentCount();

		return count;
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
			string safeName = SanitizeForJson(playerName);
			if (safeName.Length() > 32)
				safeName = safeName.Substring(0, 32);

			// Extrai informações de vitalidade
			float health = player.GetHealth("", "");
			float blood = player.GetHealth("GlobalHealth", "Blood");
			float shock = player.GetHealth("GlobalHealth", "Shock");
			float energy = 0.0;
			float water = 0.0;
			
			if (player.GetStatEnergy())
				energy = player.GetStatEnergy().Get();
			if (player.GetStatWater())
				water = player.GetStatWater().Get();

			// Extrai status do jogador
			bool isAlive = player.IsAlive();
			bool isAdmin = CheckIfIsAdmin(playerId);
			//bool hasGodmode = false; // Não descobri como verificar se o jogador tem god mode

			// Extrai informações de stamina
			float stamina = 0.0;
			float staminaMax = 0.0;
			StaminaHandler staminaHandler = player.GetStaminaHandler();
			if (staminaHandler)
			{
				stamina = staminaHandler.GetStamina();
				staminaMax = staminaHandler.GetStaminaMax();
			}

			// Extrai informações do inventário
			string itemsInHands = GetItemsInHands(player);
			string mainItems = GetMainItems(player, 10);
			int itemsCount = CountInventoryItems(player);

			// Converte booleanos para string
			string isAliveStr = "false";
			if (isAlive)
				isAliveStr = "true";
			
			string isAdminStr = "false";
			if (isAdmin)
				isAdminStr = "true";

			// Constrói JSON do jogador
			if (playersJson != "")
				playersJson += ",";
			
			playersJson += "{";
			playersJson += "\"player_id\":\"" + playerId + "\"";
			playersJson += ",\"player_name\":\"" + safeName + "\"";
			playersJson += ",\"x\":" + position[0].ToString();
			playersJson += ",\"z\":" + position[1].ToString();
			playersJson += ",\"y\":" + position[2].ToString();
			playersJson += ",\"health\":" + health.ToString();
			playersJson += ",\"blood\":" + blood.ToString();
			playersJson += ",\"shock\":" + shock.ToString();
			playersJson += ",\"energy\":" + energy.ToString();
			playersJson += ",\"water\":" + water.ToString();
			playersJson += ",\"is_alive\":" + isAliveStr;
			playersJson += ",\"is_admin\":" + isAdminStr;
			playersJson += ",\"stamina\":" + stamina.ToString();
			playersJson += ",\"stamina_max\":" + staminaMax.ToString();
			playersJson += ",\"items_in_hands\":[" + itemsInHands + "]";
			playersJson += ",\"items_count\":" + itemsCount.ToString();
			playersJson += ",\"main_items\":[" + mainItems + "]";
			playersJson += "}";
		}

		string jsonAction = "{\"action\":\"players_positions\",\"players\":[" + playersJson + "]}";
		AppendExternalAction(jsonAction);
		
		WriteToLog("SendPlayersPositions(): Posições de " + players.Count().ToString() + " jogadores enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
	}

	override void OnMissionFinish()
    {
		WriteToLog("OnMissionFinish - Método executado", LogFile.INIT, false, LogType.INFO);
        super.OnMissionFinish();
    }
};

Mission CreateCustomMission(string path)
{
	return new CustomMission();
}
