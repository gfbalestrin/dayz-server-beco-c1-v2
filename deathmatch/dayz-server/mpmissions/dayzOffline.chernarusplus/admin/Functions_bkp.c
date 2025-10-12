void EnsureAllFilesExist()
{
    EnsureFileExists("$mission:admin/files/commands_to_execute.txt");
    EnsureFileExists("$mission:admin/files/external_actions.txt");
    EnsureFileExists("$mission:admin/files/messages_to_send.txt");
    EnsureFileExists("$mission:admin/files/messages_private_to_send.txt");
    EnsureFileExists("$mission:admin/files/admin_ids.txt");
}
void EnsureFileExists(string path)
{
    // Tenta abrir para leitura
    FileHandle handle = OpenFile(path, FileMode.READ);
    if (handle)
    {
        CloseFile(handle);  // Já existe
        return;
    }

    // Se não existir, cria vazio
    FileHandle createHandle = OpenFile(path, FileMode.WRITE);
    if (createHandle)
    {
        CloseFile(createHandle);
        Print("Arquivo criado: " + path);
    }
    else
    {
        Print("Falha ao criar arquivo: " + path);
    }
}

PlayerBase GetPlayerByName(string name)
{
    array<Man> players = new array<Man>();
    GetGame().GetPlayers(players);

    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetName() == name)
        {
            return player;
        }
    }
    return null;
}

PlayerBase GetPlayerById(string id)
{
    array<Man> players = {};
    GetGame().GetPlayers(players); // Pega todos os jogadores no servidor

    // Itera sobre todos os jogadores para encontrar aquele com o ID fornecido
    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man); // Tenta converter o jogador
        if (player && player.GetIdentity() && player.GetIdentity().GetId() == id)
        {
            // Se encontrar o jogador com o ID correto, registra e retorna o jogador
            WriteToLog("GetPlayerByID(): Jogador encontrado: " + player.GetIdentity().GetName(), LogFile.INIT, false, LogType.DEBUG);
            return player;
        }
    }

    // Se não encontrar, registra no log
    WriteToLog("GetPlayerByID(): Jogador de id " + id + " não encontrado", LogFile.INIT, false, LogType.ERROR);
    return null;
}

void SendPrivateMessage(string playerId, string message, MessageColor color = MessageColor.STATUS)
{
    PlayerBase player = GetPlayerById(playerId);
    if (!player)
        return;
    
    WriteToLog("SendPrivateMessage() Enviando mensagem privada: " + message, LogFile.INIT, false, LogType.INFO);

    switch (color)
    {
        case MessageColor.IMPORTANT:
            player.MessageImportant(message);
            break;
        case MessageColor.FRIENDLY:
            player.MessageFriendly(message);
            break;
        case MessageColor.WARNING:
            Param1<string> msgParam = new Param1<string>(message);
            GetGame().RPCSingleParam(player, ERPCs.RPC_USER_ACTION_MESSAGE, msgParam, true, player.GetIdentity());
            break;
        default:
            player.MessageStatus(message); // azul
            break;
    }
}

void BroadcastMessage(string message, MessageColor color = MessageColor.STATUS, string playerID = "")
{
    WriteToLog("BroadcastMessage: " + message, LogFile.INIT, false, LogType.DEBUG);
    array<Man> players = new array<Man>();
    GetGame().GetPlayers(players);

    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (!player)
            continue;
        if (playerID != "" && player.GetIdentity().GetId() == playerID)
            continue;

        SendPrivateMessage(player.GetIdentity().GetId(), message, color);
    }
}


void SetActiveRegionById(int regionId)
{
    WriteToLog("Carregando JSON de regiões: " + DeathMatchConfigJsonFile, LogFile.INIT, false, LogType.DEBUG);

    ref array<ref SafeZoneData> zones;
    JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(DeathMatchConfigJsonFile, zones);

    bool found = false;

    for (int i = 0; i < zones.Count(); i++) {
        if (zones[i].RegionId == regionId) {
            zones[i].Active = true;
            found = true;
        } else {
            zones[i].Active = false;
        }
    }

    if (found) {
        JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(DeathMatchConfigJsonFile, zones);
        WriteToLog("Região com RegionId " + regionId.ToString() + " foi marcada como ativa.", LogFile.INIT, false, LogType.INFO);
    } else {
        WriteToLog("RegionId " + regionId.ToString() + " não encontrado no arquivo.", LogFile.INIT, false, LogType.ERROR);
    }
}
string Pluralize(int valor, string singular, string plural)
{
    string result = plural;
    if (valor == 1)
        result = singular;
    return result;
}

string FormatTempo(int segundos)
{
    int minutos = segundos / 60;
    int resto = segundos % 60;

    //return minutos.ToString() + " " + Pluralize(minutos, "minuto", "minutos") + " e " + resto.ToString() + " " + Pluralize(resto, "segundo", "segundos");
    return minutos.ToString() + " " + Pluralize(minutos, "minuto", "minutos") ;
}

void KickPlayerById(string playerId)
{
    array<Man> players = new array<Man>();
    GetGame().GetPlayers(players);

    foreach (Man man : players) {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetPlainId() == playerId) {
            GetGame().DisconnectPlayer(player.GetIdentity(), "Você foi kickado por votação.");
            return;
        }
    }
}

array<string> LoadAdminIDs(string filePath)
{
    WriteToLog("LoadAdminIDs(): Carregando IDs do arquivo: " + filePath, LogFile.INIT, false, LogType.DEBUG);
    array<string> ids = new array<string>;
    FileHandle file = OpenFile(filePath, FileMode.READ);

    if (file != 0)
    {
        string line;
        while (FGets(file, line) > 0)
        {
            line = line.Trim();
            if (line != "")
                ids.Insert(line);
        }
        CloseFile(file);
        WriteToLog("LoadAdminIDs(): IDs carregados: " + ids.Count(), LogFile.INIT, false, LogType.DEBUG);
    }
    else
    {
        WriteToLog("LoadAdminIDs(): Erro ao abrir o arquivo.", LogFile.INIT, false, LogType.ERROR);
    }
    return ids;
}

bool CheckIfIsAdmin(string playerId)
{
    array<string> adminIDs = LoadAdminIDs("$mission:admin/files/admin_ids.txt");
    if (adminIDs.Find(playerId) != -1)
        return true;

    return false;
}

string GetPlayerId(Man man)
{
	PlayerBase player = PlayerBase.Cast(man);
	if (!player || !player.GetIdentity()) return "";
	return player.GetIdentity().GetId();
}

string GetCurrentTimeInGame()
{
	int year, month, day, hour, minute;
	GetGame().GetWorld().GetDate(year, month, day, hour, minute);

	string periodo;
	if (hour >= 0 && hour < 6)
		periodo = "madrugada";
	else if (hour >= 6 && hour < 12)
		periodo = "manhã";
	else if (hour >= 12 && hour < 18)
		periodo = "tarde";
	else
		periodo = "noite";

	string hourStr;
	if (hour < 10)
		hourStr = "0" + hour.ToString();
	else
		hourStr = hour.ToString();

	string minuteStr;
	if (minute < 10)
		minuteStr = "0" + minute.ToString();
	else
		minuteStr = minute.ToString();

	string horaFormatada = hourStr + ":" + minuteStr;

	return horaFormatada + " (" + periodo + ")";
}

// Limpa em todo cenário
void CleanUpDeadEntities()
{
	array<Object> objects = new array<Object>();
	GetGame().GetObjectsAtPosition(Vector(0, 0, 0), 999999, objects, null);

	int countRemoved = 0;

	foreach (Object obj : objects)
	{
		if (!obj) continue;

		PlayerBase player = PlayerBase.Cast(obj);
		ZombieBase zombie = ZombieBase.Cast(obj);

		if ((player && !player.IsAlive()) || (zombie && !zombie.IsAlive()))
		{
			GetGame().ObjectDelete(obj);
			countRemoved++;
		}
	}

	if (countRemoved > 0)
	{
		WriteToLog("CleanUpDeadEntities(): Removidos " + countRemoved.ToString() + " corpos mortos.", LogFile.INIT, false, LogType.DEBUG);
	}
}
// Limpa ao redor do player
void CleanUpDeadEntitiesNearPlayers()
{
	array<Man> players = new array<Man>();
	GetGame().GetPlayers(players);

	int radius = 100; // ajustável
	int countRemoved = 0;

	foreach (Man man : players)
	{
		vector pos = man.GetPosition();

		array<Object> nearby = new array<Object>();
		GetGame().GetObjectsAtPosition(pos, radius, nearby, null);

		foreach (Object obj : nearby)
		{
			if (!obj) continue;

			PlayerBase player = PlayerBase.Cast(obj);
			ZombieBase zombie = ZombieBase.Cast(obj);

            if (player && (!player.IsAlive() && player.GetHealth("GlobalHealth", "Shock") <= 0))
			{
				GetGame().ObjectDelete(obj);
				countRemoved++;
			}
		}
	}

	if (countRemoved > 0)
	{
		WriteToLog("CleanUp: " + countRemoved.ToString() + " corpos removidos próximos a jogadores.", LogFile.INIT, false, LogType.DEBUG);
	}
}
// Define clima limpo com melhor desempenho
void SetCleanWeather()
{
	Weather weather = g_Game.GetWeather();

	weather.GetRain().SetForecastChangeLimits(0, 0);
	weather.GetRain().SetForecastTimeLimits(0, 0);
	weather.GetRain().Set(0);

	weather.GetOvercast().SetForecastChangeLimits(0.01, 0.01);
	weather.GetOvercast().SetForecastTimeLimits(0, 0);
	weather.GetOvercast().Set(0.01);

	weather.GetFog().SetForecastChangeLimits(0, 0);
	weather.GetFog().SetForecastTimeLimits(0, 0);
	weather.GetFog().Set(0);

	weather.SetWindMaximumSpeed(0);

	// Log
	WriteToLog("OnMissionStart(): Clima limpo aplicado automaticamente (rain=0, fog=0, overcast=0.01)", LogFile.INIT, false, LogType.INFO);	
}

void LogAllVehicles()
{
    Print("[DEBUG] Iniciando varredura de veículos no mundo...");

    vector center = "7500 0 7500"; // Centro aproximado do mapa Chernarus
    float radius = 20000; // Varre praticamente o mapa todo

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(center, radius, nearbyObjects, null);

    int count = 0;

    foreach (Object obj : nearbyObjects)
    {
        if (!obj)
            continue;

        CarScript vehicle = CarScript.Cast(obj);
        if (vehicle)
        {
            vector pos = vehicle.GetPosition();
            string name = vehicle.GetDisplayName();
            Print("[VEÍCULO] " + name + " em " + pos.ToString());
            count++;
        }
    }

    Print("[DEBUG] Total de veículos detectados: " + count.ToString());
}
