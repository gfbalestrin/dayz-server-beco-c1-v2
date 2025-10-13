#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Globals.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/SafeZoneData.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayerId.c"
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
	ref set<string> ActivePlayers;
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
        ActivePlayers = new set<string>();
    }

	override void OnEvent(EventType eventTypeId, Param params)
	{
		super.OnEvent(eventTypeId, params);

		WriteToLog("Evento: " + eventTypeId.ToString(), LogFile.INIT, false, LogType.DEBUG);
		
		if (eventTypeId == ChatMessageEventTypeID)
		{
			ChatMessageEventParams chatParams = ChatMessageEventParams.Cast(params);
			if (!chatParams) {
				WriteToLog("chatParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
				return;
			}

			WriteToLog("param1: " + chatParams.param1, LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("param2: " + chatParams.param2, LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("param3: " + chatParams.param3, LogFile.INIT, false, LogType.DEBUG);

			int channel = chatParams.param1;          // canal (ex: 0 = Global)
			string playerName = chatParams.param2;    // nome do jogador
			string text = chatParams.param3;          // mensagem digitada			

			if (text == "")
            	return;
			
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
			
			if (text.Length() == 0 || text.Get(0) != "!")
				return;

			PlayerBase player = GetPlayerByName(playerName);
			if (!player) {
				array<PlayerIdentity> ids = new array<PlayerIdentity>;
				GetGame().GetPlayerIdentities(ids);
				WriteToLog("ExecuteCommand(): Encontrados " + ids.Count() + " jogadores.", LogFile.INIT, false, LogType.ERROR);
				
				WriteToLog("Player não identificado.", LogFile.INIT, false, LogType.ERROR);
				return;
			}

			TStringArray tokensCommands = new TStringArray;
			text.Split(" ", tokensCommands);			
			tokensCommands[0] = tokensCommands[0].Substring(1, tokensCommands[0].Length() - 1);
			string playerID = player.GetIdentity().GetId();
			TStringArray tokens = new TStringArray;
			tokens.Insert(playerID);
			for (int i = 0; i < tokensCommands.Count(); i++)
				tokens.Insert(tokensCommands.Get(i));

			ExecuteCommand(tokens);
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

			// Obter TODAS as identidades conectadas (inclui "ghosts")
			array<PlayerIdentity> allIdentities = new array<PlayerIdentity>;
			GetGame().GetPlayerIdentities(allIdentities);
			WriteToLog("OnUpdate(): Encontrados " + allIdentities.Count() + " jogadores.", LogFile.INIT, false, LogType.INFO);

			array<Man> players = new array<Man>;
			GetGame().GetPlayers(players);
			WriteToLog("OnUpdate(): Encontrados " + players.Count() + " jogadores.", LogFile.INIT, false, LogType.INFO);

			ref set<string> currentPlayers = new set<string>();
			ref map<string, PlayerIdentity> identityMap = new map<string, PlayerIdentity>();
			// Mapear todas as identidades conectadas
			foreach (PlayerIdentity identity : allIdentities)
			{
				if (!identity) continue;
				string playerId = identity.GetId();
				identityMap.Insert(playerId, identity);
				currentPlayers.Insert(playerId);
			}

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

			// DETECTAR E TRATAR JOGADORES "GHOST"
			foreach (string ghostId, PlayerIdentity ghostIdentity : identityMap)
			{
				// Este é um jogador "ghost" - conectado mas sem objeto válido
				WriteToLog("GHOST DETECTADO: " + ghostIdentity.GetName() + " (" + ghostId + ")", LogFile.INIT, false, LogType.INFO);
					
				// OPÇÕES DE CORREÇÃO:
				
				// Opção 1: Desconectar o jogador ghost (recomendado)
				GetGame().DisconnectPlayer(ghostIdentity, ghostId);
				WriteToLog("Ghost desconectado: " + ghostIdentity.GetName(), LogFile.INIT, false, LogType.INFO);
				
				// Opção 2: Apenas registrar e monitorar
				// AppendExternalAction("{\"action\":\"ghost_detected\",\"player_id\":\"" + ghostId + "\",\"player_name\":\"" + ghostIdentity.GetName() + "\"}");
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
