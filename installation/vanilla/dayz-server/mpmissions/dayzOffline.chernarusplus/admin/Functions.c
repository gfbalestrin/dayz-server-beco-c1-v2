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
    WriteToLog("Iniciando varredura de veículos no mundo...", LogFile.INIT, false, LogType.DEBUG);	

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
            WriteToLog("[VEÍCULO] " + name + " em " + pos.ToString(), LogFile.INIT, false, LogType.DEBUG);
            count++;
        }
    }

    WriteToLog("Total de veículos detectados: " + count.ToString(), LogFile.INIT, false, LogType.DEBUG);
}

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
            WriteToLog("[TRACKING] Veículo adicionado: " + vehicle.GetDisplayName(), LogFile.INIT, false, LogType.DEBUG);
        }
    }

    WriteToLog("Total de veículos em rastreamento: " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
}

void TrackVehiclePositions()
{
    // Verifica se o array foi inicializado
    if (!m_TrackedVehicles)
    {
        WriteToLog("[TRACKING] Array m_TrackedVehicles não foi inicializado ainda, ignorando rastreamento...", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    WriteToLog("[TRACKING] Atualização de posições dos veículos... " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);

    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        //if (vehicle && vehicle.IsAlive())
        if (vehicle)
        {
            vector pos = vehicle.GetPosition();
            WriteToLog("[POSIÇÃO] " + vehicle.GetDisplayName() + " em " + pos.ToString(), LogFile.INIT, false, LogType.DEBUG);
        }
        else
        {
            WriteToLog("[REMOVER] Veículo inválido ou destruído.", LogFile.INIT, false, LogType.DEBUG);
        }
    }
}


// ======== CONFIG ========
static const float CLEAN_RADIUS_M        = 100.0;   // alcance ao redor de cada player
static const float PROTECT_NEAR_ALIVE_M  = 2.0;     // 0 = sem proteção
static const int   WEAPON_TTL_MS         = 60000;   // 60s; 0 = apaga na hora
// ========================

// TTL para armas no chão
static ref map<int, int> s_FirstSeenWeapon = new map<int, int>(); // <objectId, firstSeenMs>

// Helper: arma solta no mundo (não em mãos/inventário/contêiner)
bool IsWorldWeapon(Object obj)
{
    if (!obj) return false;
    if (!obj.IsInherited(Weapon_Base)) return false;
    EntityAI e = EntityAI.Cast(obj);
    if (!e) return false;

    if (e.GetHierarchyRootPlayer()) return false; // em mãos/inventário
    if (e.GetHierarchyParent())     return false; // em contêiner/veículo/corpo

    return true;
}

void CleanUpDeadEntitiesNearPlayers()
{
    //DayZGame game = GetGame();
    DayZGame game = DayZGame.Cast(GetGame());
    if (!game) return;
    if (!game.IsServer()) return;
    if (!s_FirstSeenWeapon)
        s_FirstSeenWeapon = new map<int, int>();

    array<Man> players = new array<Man>();
    game.GetPlayers(players);
    if (!players || players.Count() == 0) return;

    // Pré-computa vivos (evita NPE no loop)
    array<Man> alivePlayers = new array<Man>();
    foreach (Man m : players)
        if (m && m.IsAlive()) alivePlayers.Insert(m);

    // Alvos a remover (deleta depois)
    array<Object> toRemoveBodies  = new array<Object>();
    array<Object> toRemoveWeapons = new array<Object>();

    // Para deduplicar por id de rede
    ref map<int, bool> marked = new map<int, bool>();

    int nowMs = game.GetTime();
    int weaponsSeen = 0;
    int skippedNearAlive = 0;

    foreach (Man man : players)
    {
        if (!man) continue;

        vector center = man.GetPosition();
        array<Object> nearby = new array<Object>();
        game.GetObjectsAtPosition(center, CLEAN_RADIUS_M, nearby, null);
        if (!nearby) continue;

        foreach (Object obj : nearby)
        {
            if (!obj) continue;

            // 1) CORPOS (apenas checa IsAlive)
            PlayerBase corpse = PlayerBase.Cast(obj);
            if (corpse && !corpse.IsAlive())
            {
                int cid = corpse.GetID();
                if (!marked.Contains(cid))
                {
                    marked.Insert(cid, true);
                    toRemoveBodies.Insert(corpse);
                }
                continue;
            }

            // 2) ARMAS NO CHÃO
            if (IsWorldWeapon(obj))
            {
                weaponsSeen++;

                // Proteção perto de vivo (opcional)
                if (PROTECT_NEAR_ALIVE_M > 0 && alivePlayers.Count() > 0)
                {
                    bool nearAlive = false;
                    vector wpos = obj.GetPosition();
                    foreach (Man p : alivePlayers)
                    {
                        if (!p) continue;
                        if (vector.DistanceSq(p.GetPosition(), wpos) <= (PROTECT_NEAR_ALIVE_M * PROTECT_NEAR_ALIVE_M))
                        {
                            nearAlive = true;
                            break;
                        }
                    }
                    if (nearAlive) { skippedNearAlive++; continue; }
                }

                int wid = obj.GetID();
                if (WEAPON_TTL_MS <= 0)
                {
                    if (!marked.Contains(wid))
                    {
                        marked.Insert(wid, true);
                        toRemoveWeapons.Insert(obj);
                    }
                }
                else
                {
                    int firstSeen;
                    if (!s_FirstSeenWeapon.Find(wid, firstSeen))
                    {
                        s_FirstSeenWeapon.Insert(wid, nowMs);
                    }
                    else if ((nowMs - firstSeen) >= WEAPON_TTL_MS)
                    {
                        if (!marked.Contains(wid))
                        {
                            marked.Insert(wid, true);
                            toRemoveWeapons.Insert(obj);
                        }
                        s_FirstSeenWeapon.Remove(wid);
                    }
                }
            }

            // infectados (suporta tanto DayZInfected quanto ZombieBase)
            DayZInfected zcorpse = DayZInfected.Cast(obj);
            if (zcorpse && !zcorpse.IsAlive())
            {
                int zid = zcorpse.GetID();
                if (!marked.Contains(zid))
                {
                    marked.Insert(zid, true);
                    toRemoveBodies.Insert(zcorpse);
                }
                continue;
            }
            ZombieBase zcorpse2 = ZombieBase.Cast(obj);
            if (zcorpse2 && !zcorpse2.IsAlive())
            {
                int zid2 = zcorpse2.GetID();
                if (!marked.Contains(zid2))
                {
                    marked.Insert(zid2, true);
                    toRemoveBodies.Insert(zcorpse2);
                }
                continue;
            }
        }
    }

    // ===== Execução das deleções (fora dos loops) =====
    int bodiesRemoved = 0;
    int weaponsRemoved = 0;

    foreach (Object b : toRemoveBodies)
    {
        if (b) { game.ObjectDelete(b); bodiesRemoved++; }
    }
    foreach (Object w : toRemoveWeapons)
    {
        if (w) { game.ObjectDelete(w); weaponsRemoved++; }
    }

    // Poda do mapa de TTL (por segurança)
    if (s_FirstSeenWeapon && s_FirstSeenWeapon.Count() > 0)
    {
        array<int> stale = new array<int>();
        foreach (int key, int t : s_FirstSeenWeapon)
            if (nowMs - t > 300000) stale.Insert(key); // >5 min sem completar TTL
        foreach (int k : stale) s_FirstSeenWeapon.Remove(k);
    }

    if (bodiesRemoved > 0 || weaponsRemoved > 0)
    {
        WriteToLog("CleanUpDeadEntities(): Corpos removidos " + bodiesRemoved.ToString(), LogFile.INIT, false, LogType.DEBUG);
        WriteToLog("CleanUpDeadEntities(): Armas removidas " + weaponsRemoved.ToString(), LogFile.INIT, false, LogType.DEBUG);
        WriteToLog("CleanUpDeadEntities(): Armas vistas " + weaponsSeen.ToString(), LogFile.INIT, false, LogType.DEBUG);
        WriteToLog("CleanUpDeadEntities(): Ignorou " + skippedNearAlive.ToString(), LogFile.INIT, false, LogType.DEBUG);
    }
}
