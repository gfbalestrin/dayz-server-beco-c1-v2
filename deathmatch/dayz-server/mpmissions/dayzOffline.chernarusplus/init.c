#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/Globals.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/SafeZoneData.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayer.c"
#include "$CurrentDir:mpmissions/dayzOffline.chernarusplus/admin/models/LoadoutPlayerId.c"
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
	WriteToLog("main(): Inicializando servidor...", LogFile.INIT, false, LogType.INFO);

	Hive ce = CreateHive();
	if ( ce )
	{
		WriteToLog("main(): Hive criado com sucesso. Iniciando offline...", LogFile.INIT, false, LogType.INFO);
		ce.InitOffline();
	}
	else
	{
		WriteToLog("main(): Falha ao criar Hive.", LogFile.INIT, false, LogType.ERROR);
	}

	int year, month, day, hour, minute;
	int reset_month = 9, reset_day = 20;
	GetGame().GetWorld().GetDate(year, month, day, hour, minute);
	WriteToLog("main(): Data atual -> " + year + "/" + month + "/" + day, LogFile.INIT, false, LogType.INFO);

	// Força o horário para 06:00
	hour = 6;
	minute = 0;

	if ((month == reset_month) && (day < reset_day))
	{
		WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
		GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
	}
	else if ((month == reset_month + 1) && (day > reset_day))
	{
		WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
		GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
	}
	else if ((month < reset_month) || (month > reset_month + 1))
	{
		WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
		GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
	}
	else
	{
		// Mesmo se não for necessário ajustar a data, ainda força o horário para 06
		GetGame().GetWorld().SetDate(year, month, day, hour, minute);
		WriteToLog("main(): Data mantida, horário ajustado para 06:00.", LogFile.INIT, false, LogType.INFO);
	}

	// >>> Clima CLEAR no start
    SetClearWeatherNow();

    // (Opcional) Reaplica após alguns segundos, caso algum subsistema mude o clima muito cedo
    GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SetClearWeatherNow, 4000, false);

}

void SetClearWeatherNow()
{
    Weather weather = GetGame().GetWeather();
    if (!weather) return;

    // Delega o clima ao script da missão
    weather.MissionWeather(true);

    // Destrava limites e tempos (sem máquina de previsão)
    weather.GetOvercast().SetLimits(0.0, 1.0);
    weather.GetOvercast().SetForecastChangeLimits(0, 0);
    weather.GetOvercast().SetForecastTimeLimits(0, 0);

    weather.GetRain().SetLimits(0.0, 1.0);
    weather.GetRain().SetForecastChangeLimits(0, 0);
    weather.GetRain().SetForecastTimeLimits(0, 0);
    weather.SetRainThresholds(0.0, 1.0, 0); // chuva não fica presa a thresholds

    weather.GetFog().SetLimits(0.0, 1.0);
    weather.GetFog().SetForecastChangeLimits(0, 0);
    weather.GetFog().SetForecastTimeLimits(0, 0);

    // Aplica "clear" quase instantâneo
    weather.GetOvercast().Set(0.01, 1, 0);
    weather.GetRain().Set(0.0, 1, 0);
    weather.GetFog().Set(0.0, 1, 0);

    // Vento parado
    weather.SetWindSpeed(0.0);
    weather.SetWindMaximumSpeed(0.0);
    weather.SetWindFunctionParams(0, 0, 0);

    WriteToLog("SetClearWeatherNow(): aplicado CLEAR no init.", LogFile.INIT, false, LogType.INFO);
}

class CustomMission: MissionServer
{
	
	ref set<string> ActivePlayers;
	ref array<string> FixedMessages;
	float m_AdminCheckCooldown10 = 10.0;
	float m_AdminCheckTimer10 = 0.0;
	float m_AdminCheckCooldown60 = 60.0;
	float m_AdminCheckTimer60 = 0.0;

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

	override void OnMissionStart()
    {
        super.OnMissionStart();

		WriteToLog("OnMissionStart(): Servidor reiniciado com sucesso!", LogFile.INIT, false, LogType.INFO);
        ActivePlayers = new set<string>();
    }
	
	override void OnEvent(EventType eventTypeId, Param params)
	{
		super.OnEvent(eventTypeId, params);
		
		if (eventTypeId == ChatMessageEventTypeID)
		{
			ChatMessageEventParams chatParams = ChatMessageEventParams.Cast(params);
			if (!chatParams) {
				WriteToLog("chatParams cast falhou.", LogFile.INIT, false, LogType.ERROR);
				return;
			}

			WriteToLog("chatParams: " + chatParams, LogFile.INIT, false, LogType.DEBUG);

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
				BroadcastMessage("Próximo mapa: " + nextMap.Region, MessageColor.FRIENDLY);				
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 60 minutos"))
			{
				AppendExternalAction("{\"action\":\"event_start_finished\",\"current_map\":\"" + currentMap.Region + "\",\"current_time\":\"" + GetCurrentTimeInGame() + "\"}");
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 1 minutos"))
			{
				AppendExternalAction("{\"action\":\"event_restarting\",\"next_map\":\"" + nextMap.Region + "\"}");
				WriteToLog("Servidor reiniciando...", LogFile.INIT, false, LogType.INFO);
			}
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 5 minutos"))
			{	
				AppendExternalAction("{\"action\":\"event_minutes_to_restart\",\"current_map\":\"" + currentMap.Region + "\",\"current_time\":\"" + GetCurrentTimeInGame() + "\",\"message\":\"" + text + "\"}");
			}
			
			if (channel == 1 && playerName == "" && text.Contains("O servidor vai ser reiniciado em 10 minutos"))
			{
				serverWillRestartSoon = true;
				g_VoteMapManager.IniciaVotacaoProximoMapa();	
				return;
			}
			
			if (text.Length() == 0 || text.Get(0) != "!")
				return;			
			
			GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY).CallLater(CheckCommands, 2000, false);

			// Desativado os comandos
			return;
			
			// 🔎 NOVO: checa se há homônimos ANTES de resolver o Player
			playerName.Trim();
			string playerNameLower = playerName;

			// Coleta de jogadores online e filtra por nome
			array<Man> online = new array<Man>();
			GetGame().GetPlayers(online);

			ref array<PlayerBase> matches = new array<PlayerBase>();

			for (int i = 0; i < online.Count(); i++)
			{
				PlayerBase pb = PlayerBase.Cast(online[i]);
				if (!pb) continue;

				PlayerIdentity id = pb.GetIdentity();
				if (!id) continue;

				WriteToLog("id.GetName() '" + id.GetName() + "'", LogFile.INIT, false, LogType.ERROR);
				WriteToLog("playerNameLower '" + playerNameLower + "'", LogFile.INIT, false, LogType.ERROR);

				// compare case-insensitive; troque para == se quiser exato
				if (id.GetName() == playerNameLower)
				{
					matches.Insert(pb);
					if (matches.Count() > 1) break; // já sabemos que é duplicado
				}
			}

			// 0: não achou ninguém com esse nome; >1: duplicado
			if (matches.Count() != 1)
			{
				WriteToLog("Comando ignorado: nome '" + playerName + "' produziu " + matches.Count() + " correspondências.", LogFile.INIT, false, LogType.ERROR);
				return;
			}

			// Usa o player encontrado (NÃO chame GetPlayerByName)
			PlayerBase player = matches[0];
			if (!player) {
				WriteToLog("Player null após filtro para nome '" + playerName + "'.", LogFile.INIT, false, LogType.ERROR);
				return;
			}

			// Continua a lógica dos tokens/comando
			TStringArray tokensCommands = new TStringArray;
			text.Split(" ", tokensCommands);
			tokensCommands[0] = tokensCommands[0].Substring(1, tokensCommands[0].Length() - 1);

			string playerID = player.GetIdentity().GetId();

			TStringArray tokens = new TStringArray;
			tokens.Insert(playerID);
			for (int j = 0; j < tokensCommands.Count(); j++)
				tokens.Insert(tokensCommands.Get(j));

			ExecuteCommand(tokens);
		}
	}

	static const int KICK_DELAY_MS = 1000; // manda a DM e chuta 1s depois

	// comparamos por nome "normalizado"
	string NormalizeName(string n)
	{
		if (!n) return "";
		n.TrimInPlace();
		n.ToLower(); // retorna nova string, mas como chamada é por ref em Enforce, OK
		return n;
	}

	// acha outro jogador online com o MESMO nome (case-insensitive)
	bool FindDuplicateName(PlayerIdentity newcomer, out PlayerIdentity conflictWith)
	{
		if (!newcomer) return false;
		string newName = NormalizeName(newcomer.GetName());
		string newUID  = newcomer.GetId();

		array<Man> arr = new array<Man>();
		GetGame().GetPlayers(arr);

		foreach (Man m : arr)
		{
			PlayerBase p = PlayerBase.Cast(m);
			if (!p) continue;

			PlayerIdentity id2 = p.GetIdentity();
			if (!id2) continue;
			if (id2.GetId() == newUID) continue; // é ele mesmo

			if (NormalizeName(id2.GetName()) == newName)
			{
				conflictWith = id2;
				return true;
			}
		}
		return false;
	}

	void KickIdentity(PlayerIdentity id)
	{
		if (!id) return;
		// Dica: o segundo parâmetro é opcional; passar o UID não atrapalha.
		GetGame().DisconnectPlayer(id, id.GetId());
	}

	override void OnUpdate(float timeslice)
	{
		super.OnUpdate(timeslice);
		m_AdminCheckTimer10 += timeslice;
		m_AdminCheckTimer60 += timeslice;

		// Garante que o mapa de rastreamento foi inicializado
		if (!lastSeenPlayers)
			lastSeenPlayers = new map<string, float>();

		if (m_AdminCheckTimer10 >= m_AdminCheckCooldown10)
		{
			m_AdminCheckTimer10 = 0.0;
			
			array<string> msgs = CheckMessages();
			array<string> privMsgs = CheckPrivateMessages();

			CheckCommands();
			array<Man> players = new array<Man>;
			GetGame().GetPlayers(players);
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

				// Verifica zona de barreira
				if (wallZones)
					CheckPlayerAreaPolygonal(player, wallZones);

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

		if (m_AdminCheckTimer60 >= m_AdminCheckCooldown60)
		{
			WriteToLog("OnUpdate(): Horário atual do servidor: " + GetCurrentTimeInGame(), LogFile.INIT, false, LogType.DEBUG);

			AppendMessage(customMessage);
			foreach (string msgFixed : FixedMessages)
			{
				if (!g_VoteMapManager.GetStatusVotingMap())
					AppendMessage(msgFixed);
			}

			CleanUpDeadEntitiesNearPlayers();
			m_AdminCheckTimer60 = 0.0;
		}
	}


	void SetRandomHealth(EntityAI itemEnt)
	{
		if (itemEnt)
		{
			float rndHlt = Math.RandomFloat(0.45, 0.65);
			itemEnt.SetHealth01("", "", rndHlt);
			WriteToLog("SetRandomHealth(): Item " + itemEnt.GetType() + " com vida aleatória: " + rndHlt, LogFile.INIT, false, LogType.DEBUG);
		}
	}

	void BoostStaminaOnce(PlayerBase player)
	{
		if (!player) return;
		StaminaHandler sh = player.GetStaminaHandler();
		if (sh) sh.SetStamina(sh.GetStaminaMax());
	}

	// Dispara 3 pulses espaçados (cobre janela de sync inicial)
	void ScheduleSpawnStaminaBurst(PlayerBase player)
	{
		auto q = GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY);
		q.CallLater(BoostStaminaOnce,  50, false, player);
		q.CallLater(BoostStaminaOnce, 250, false, player);
		q.CallLater(BoostStaminaOnce,1000, false, player);
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

	override PlayerBase CreateCharacter(PlayerIdentity identity, vector pos, ParamsReadContext ctx, string characterName)
	{
		string playerId   = identity.GetId();
		string playerName = identity.GetName();		
		string steamId    = identity.GetPlainId();

		WriteToLog("CreateCharacter(): Criando personagem para " + playerName, LogFile.INIT, false, LogType.DEBUG);

		// 🔥 Verifica se já existe um jogador ativo e remove para evitar conflito
		PlayerBase existingPlayer = PlayerBase.Cast(GetGame().GetPlayer());

		// Gera posição segura de respawn
		vector safePosition = GetRandomSafeSpawnPosition(spawnZones);
		WriteToLog("CreateCharacter(): Posicionando jogador em: " + safePosition.ToString(), LogFile.INIT, false, LogType.DEBUG);

		// Cria nova entidade do jogador
		Entity playerEnt = GetGame().CreatePlayer(identity, characterName, safePosition, 0, "NONE");
		if (!playerEnt) {
			WriteToLog("CreateCharacter(): Erro ao criar player!", LogFile.INIT, false, LogType.ERROR);
			return null;
		}

		if (!Class.CastTo(m_player, playerEnt)) {
			WriteToLog("CreateCharacter(): Erro ao fazer cast para PlayerBase", LogFile.INIT, false, LogType.ERROR);
			return null;
		}

		// Seleciona o novo player para a sessão
		GetGame().SelectPlayer(identity, m_player);

		// Admin
		if (CheckIfIsAdmin(playerId)) {
			WriteToLog("CreateCharacter(): " + playerName + " é admin.", LogFile.INIT, false, LogType.DEBUG);
			m_player.SetAllowDamage(false);
			GiveAdminLoadout(m_player, playerId);
			m_player.SetAllowDamage(false);
		}

		// Jogador comum
		else {
			WriteToLog("CreateCharacter(): " + playerName + " é jogador comum.", LogFile.INIT, false, LogType.DEBUG);
			m_player.SetAllowDamage(false);

			if (!GiveCustomLoadout(m_player, playerId)) {
				WriteToLog("CreateCharacter(): Loadout customizado não encontrado. Aplicando padrão.", LogFile.INIT, false, LogType.DEBUG);
				GiveDefaultLoadout(m_player, playerId);
			}

			// Stats/posição/dano depois
			GetGame().GetCallQueue(CALL_CATEGORY_GAMEPLAY).CallLater(PostSpawnInit, 300, false, m_player, safePosition);

			m_player.SetAllowDamage(true);
		}

		ScheduleSpawnStaminaBurst(m_player);

		return m_player;
	}

	void GiveSpawnLoadoutSafe(PlayerBase p, string playerId)
	{
		if (!p) return;
		if (!GiveCustomLoadout(p, playerId)) {
			GiveDefaultLoadout(p, playerId);
		}
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

	override void OnClientRespawnEvent(PlayerIdentity identity, PlayerBase player)
	{
		super.OnClientRespawnEvent(identity, player);
		BlockSprintWindow(player);
		ScheduleSpawnStaminaBurst(player);
	}

	override void OnMissionFinish()
    {
        super.OnMissionFinish();
    }

};

Mission CreateCustomMission(string path)
{
	WriteToLog("CreateCustomMission(): Criando instância de CustomMission", LogFile.INIT, false, LogType.INFO);
	return new CustomMission();
}

