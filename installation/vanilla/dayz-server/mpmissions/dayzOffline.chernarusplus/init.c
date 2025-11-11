#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Globals.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/SafeZoneData.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayerId.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/ActivePlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Log.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Functions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/ExternalActions.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Main.c"
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
	ref array<string> FixedMessages;
	float m_AdminCheckCooldown10 = 10.0;
	float m_AdminCheckTimer10 = 0.0;
	float m_AdminCheckCooldown60 = 60.0;
	float m_AdminCheckTimer60 = 0.0;

	// Deathmatch
	string regionStr;
	string customMessage;
	ref array<vector> spawnZones;	
	ref array<vector> wallZones;
	SafeZoneDataSpawns spawns;

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
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(InitWorldTracking, 5000, false);
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SendStartEvent, 5000, false);    
    }

	override void OnMissionStart()
    {
        super.OnMissionStart();
		InitializeVestGrenadeSlots();
		ActivePlayers = new array<ref ActivePlayer>();
		WriteToLog("OnMissionStart(): Servidor reiniciado com sucesso!", LogFile.INIT, false, LogType.INFO);
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
