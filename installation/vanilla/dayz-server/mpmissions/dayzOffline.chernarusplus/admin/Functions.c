void EnsureAllFilesExist()
{
    EnsureFileExists("$mission:admin/files/commands_to_execute.txt");
    EnsureFileExists("$mission:admin/files/external_actions.txt");
    EnsureFileExists("$mission:admin/files/messages_to_send.txt");
    EnsureFileExists("$mission:admin/files/messages_private_to_send.txt");
    EnsureFileExists("$mission:admin/files/admin_ids.txt");
    EnsureFileExists("$mission:admin/files/commands_results.txt");
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
    WriteToLog("SetActiveRegionById(): carregando regiões de " + DeathMatchConfigJsonFile, LogFile.INIT, false, LogType.DEBUG);

    ref array<ref SafeZoneData> zones;
    JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(DeathMatchConfigJsonFile, zones);

    if (!zones || zones.Count() == 0)
    {
        WriteToLog("SetActiveRegionById(): lista de regiões vazia.", LogFile.INIT, false, LogType.ERROR);
        return;
    }

    bool found = false;
    int newActiveIndex = -1;

    for (int idx = 0; idx < zones.Count(); idx++)
    {
        ref SafeZoneData zone = zones[idx];
        if (!zone)
            continue;

        bool shouldBeActive = (zone.RegionId == regionId && !zone.IsDeleted);
        if (shouldBeActive)
        {
            zone.Active = true;
            found = true;
            newActiveIndex = idx;
        }
        else if (zone.Active)
        {
            zone.Active = false;
        }
    }

    if (!found)
    {
        WriteToLog("SetActiveRegionById(): RegionId " + regionId.ToString() + " não encontrado ou marcado como deletado.", LogFile.INIT, false, LogType.ERROR);
        return;
    }

    JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(DeathMatchConfigJsonFile, zones);
    maps = zones;

    if (newActiveIndex != -1)
        currentMap = zones[newActiveIndex];

    WriteToLog("SetActiveRegionById(): Região ativa definida para " + regionId.ToString() + ".", LogFile.INIT, false, LogType.INFO);

    ToggleActiveRegion(DeathMatchConfigJsonFile);
}

void SetNextActiveRegionById(int regionId)
{
    WriteToLog("SetNextActiveRegionById(): atualizando RegionId " + regionId.ToString(), LogFile.INIT, false, LogType.DEBUG);

    ref array<ref SafeZoneData> zones;
    JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(DeathMatchConfigJsonFile, zones);

    if (!zones || zones.Count() == 0)
    {
        WriteToLog("SetNextActiveRegionById(): lista de regiões vazia.", LogFile.INIT, false, LogType.ERROR);
        return;
    }

    bool found = false;
    bool changed = false;
    int nextIndex = -1;
    int activeIndex = -1;

    for (int idx = 0; idx < zones.Count(); idx++)
    {
        ref SafeZoneData zone = zones[idx];
        if (!zone)
            continue;

        if (zone.Active && !zone.IsDeleted && activeIndex == -1)
            activeIndex = idx;

        bool markAsNext = false;
        if (zone.RegionId == regionId)
        {
            if (zone.IsDeleted)
            {
                WriteToLog("SetNextActiveRegionById(): Região " + zone.Region + " está marcada como deletada e não pode ser próxima.", LogFile.INIT, false, LogType.ERROR);
            }
            else
            {
                markAsNext = true;
                found = true;
                nextIndex = idx;
            }
        }

        if (zone.NextActiveMap != markAsNext)
        {
            zone.NextActiveMap = markAsNext;
            changed = true;
        }
    }

    if (!found)
    {
        int fallbackIndex = activeIndex;

        if (fallbackIndex == -1)
        {
            for (int searchIdx = 0; searchIdx < zones.Count(); searchIdx++)
            {
                ref SafeZoneData fallbackZone = zones[searchIdx];
                if (fallbackZone && !fallbackZone.IsDeleted)
                {
                    fallbackIndex = searchIdx;
                    break;
                }
            }
        }

        if (fallbackIndex != -1)
        {
            for (int resetIdx = 0; resetIdx < zones.Count(); resetIdx++)
            {
                ref SafeZoneData resetZone = zones[resetIdx];
                if (!resetZone)
                    continue;

                bool fallbackFlag = (resetIdx == fallbackIndex);
                if (resetZone.NextActiveMap != fallbackFlag)
                {
                    resetZone.NextActiveMap = fallbackFlag;
                    changed = true;
                }
            }

            nextIndex = fallbackIndex;
            WriteToLog("SetNextActiveRegionById(): RegionId " + regionId.ToString() + " inválido. Mantendo mapa " + zones[fallbackIndex].Region + " como próximo.", LogFile.INIT, false, LogType.WARNING);
        }
        else
        {
            WriteToLog("SetNextActiveRegionById(): Nenhuma região válida disponível para definir como próxima.", LogFile.INIT, false, LogType.ERROR);
        }
    }

    if (changed)
    {
        JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(DeathMatchConfigJsonFile, zones);
        WriteToLog("SetNextActiveRegionById(): Próximo mapa atualizado com sucesso.", LogFile.INIT, false, LogType.INFO);
    }

    maps = zones;

    if (nextIndex != -1)
    {
        nextMap = zones[nextIndex];
    }
    else if (activeIndex != -1)
    {
        nextMap = zones[activeIndex];
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
    //WriteToLog("LoadAdminIDs(): Carregando IDs do arquivo: " + filePath, LogFile.INIT, false, LogType.DEBUG);
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
        //WriteToLog("LoadAdminIDs(): IDs carregados: " + ids.Count(), LogFile.INIT, false, LogType.DEBUG);
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

    // Verifica e inicializa ActivePlayers se necessário
    if (!ActivePlayers)
    {
        WriteToLog("AddOrUpdateActivePlayer(): AVISO - ActivePlayers está NULL! Inicializando...", LogFile.INIT, false, LogType.ERROR);
        ActivePlayers = new array<ref ActivePlayer>();
    }

    string steamId = identity.GetPlainId();
    string playerName = identity.GetName();
    string playerId = identity.GetId();

    int existingIndex = FindActivePlayerIndexByIdentifiers(playerId, steamId);
    if (existingIndex != -1)
    {
        ActivePlayer existingPlayerRecord = ActivePlayers.Get(existingIndex);
        if (existingPlayerRecord)
        {
            Man storedMan = existingPlayerRecord.GetPlayer();

            if (identity)
                existingPlayerRecord.SetIdentity(identity);

            if (player)
            {
                if (storedMan && (storedMan != player))
                {
                    PlayerBase storedPlayerBase = PlayerBase.Cast(storedMan);
                    if (storedPlayerBase && !storedPlayerBase.IsAlive())
                    {
                        WriteToLog("AddOrUpdateActivePlayer(): Deletando corpo antigo ao atualizar jogador: " + playerName, LogFile.INIT, false, LogType.DEBUG);
                        GetGame().ObjectDelete(storedPlayerBase);
                    }
                }

                existingPlayerRecord.SetPlayer(player);
            }
            else
            {
                EnsureActivePlayerHasManRef(playerId);
            }

            PurgeDuplicateActivePlayers(existingIndex, playerId, steamId);
            WriteToLog("AddOrUpdateActivePlayer(): Jogador já registrado, referências atualizadas: " + playerName + " (PlayerID: " + playerId + ", SteamID: " + steamId + ")", LogFile.INIT, false, LogType.DEBUG);
        }
        return;
    }

    if (IsDeathmatchEnabled)
    {			
        // Cria e adiciona o novo jogador
        ActivePlayer newActivePlayerDM = new ActivePlayer(identity, player);
        ActivePlayers.Insert(newActivePlayerDM);
        WriteToLog("AddOrUpdateActivePlayer(): Jogador adicionado: " + playerName + " (PlayerID: " + playerId + ", SteamID: " + steamId + ")", LogFile.INIT, false, LogType.INFO);
        return;
    }
    
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
    //WriteToLog(resumoMsg, LogFile.INIT, false, LogType.DEBUG);
    
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
    
    //WriteToLog("AddOrUpdateActivePlayer(): DEBUG - player=" + playerStatus + " | PlayerName: " + playerName, LogFile.INIT, false, LogType.DEBUG);
    
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
        
        //WriteToLog("AddOrUpdateActivePlayer(): DEBUG - FindPlayerManInWorld retornou: " + foundResult, LogFile.INIT, false, LogType.DEBUG);
        
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
        //else if (existingManInWorld == player)
        //{
        //	WriteToLog("AddOrUpdateActivePlayer(): DEBUG - Comparação: existingMan IS THE SAME as newPlayer (normal)", LogFile.INIT, false, LogType.DEBUG);
        //}
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

        if (existingPlayer && identity)
        {
            existingPlayer.SetIdentity(identity);
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
    EnsureActivePlayerHasManRef(playerId, player);
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
            if (!IsDeathmatchEnabled)
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
    
    // Verifica estado de ActivePlayers antes de adicionar
    if (!ActivePlayers)
    {
        WriteToLog("  -> AVISO: ActivePlayers está NULL antes de AddOrUpdateActivePlayer! Inicializando...", LogFile.INIT, false, LogType.ERROR);
        ActivePlayers = new array<ref ActivePlayer>();
    }
    else
    {
        WriteToLog("  -> ActivePlayers existe com " + ActivePlayers.Count() + " jogador(es) antes de adicionar", LogFile.INIT, false, LogType.DEBUG);
    }
                                
    // Adiciona o jogador à lista
    WriteToLog("  -> Chamando AddOrUpdateActivePlayer para PlayerID: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
    AddOrUpdateActivePlayer(identity, player);
    EnsureActivePlayerHasManRef(identity.GetId(), player);
    
    // Verifica estado de ActivePlayers após adicionar
    if (!ActivePlayers)
    {
        WriteToLog("  -> ERRO CRÍTICO: ActivePlayers está NULL após AddOrUpdateActivePlayer!", LogFile.INIT, false, LogType.ERROR);
        ActivePlayers = new array<ref ActivePlayer>();
    }
    else
    {
        WriteToLog("  -> ActivePlayers existe com " + ActivePlayers.Count() + " jogador(es) após adicionar", LogFile.INIT, false, LogType.DEBUG);
    }
    
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
    WriteToLog("  -> Buscando jogador adicionado via GetActivePlayerById: " + identity.GetId(), LogFile.INIT, false, LogType.DEBUG);
    ActivePlayer addedPlayer = GetActivePlayerById(identity.GetId());
    if (addedPlayer)
    {
        WriteToLog("  -> Jogador encontrado na lista após adicionar", LogFile.INIT, false, LogType.DEBUG);
        
        // Verifica estados do jogador adicionado
        bool hasIdentity = addedPlayer.HasIdentity();
        bool hasPlayer = addedPlayer.HasPlayer();
        bool hasSentConnectedEvent = addedPlayer.HasConnectedEventBeenSent();
        WriteToLog("  -> Estado do jogador - HasIdentity: " + hasIdentity + " | HasPlayer: " + hasPlayer + " | HasSentConnectedEvent: " + hasSentConnectedEvent, LogFile.INIT, false, LogType.DEBUG);
        
        if (hasPlayer)
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

            // Sempre envia update_player
            WriteToLog("  -> Enviando ação externa: update_player", LogFile.INIT, false, LogType.DEBUG);
            AppendExternalAction("{\"action\":\"update_player\",\"player_id\":\"" + identity.GetId() + "\",\"player_name\":\"" + playerNameToUpdate + "\",\"steam_id\":\"" + identity.GetPlainId() + "\"}");
            
            // Envia player_connected apenas se ainda não foi enviado (primeira conexão)
            if (!hasSentConnectedEvent)
            {
                WriteToLog("  -> Enviando ação externa: player_connected (primeira conexão)", LogFile.INIT, false, LogType.INFO);
                AppendExternalAction("{\"action\":\"player_connected\",\"player_id\":\"" + identity.GetId() + "\"}");
                addedPlayer.MarkConnectedEventSent();
            }
            else
            {
                WriteToLog("  -> Jogador já tinha evento de conexão enviado, pulando player_connected (respawn/reconexão)", LogFile.INIT, false, LogType.DEBUG);
            }
        }
        else
        {
            WriteToLog("  -> DEPOIS AddOrUpdate: Man NÃO foi armazenado (é null)!", LogFile.INIT, false, LogType.ERROR);
        }
    }
    else
    {
        WriteToLog("  -> ERRO: Jogador NÃO foi encontrado na lista após AddOrUpdateActivePlayer! PlayerID: " + identity.GetId(), LogFile.INIT, false, LogType.ERROR);
        if (ActivePlayers)
        {
            WriteToLog("  -> ActivePlayers tem " + ActivePlayers.Count() + " elemento(s) mas jogador não foi encontrado", LogFile.INIT, false, LogType.ERROR);
        }
        else
        {
            WriteToLog("  -> ActivePlayers está NULL após buscar jogador!", LogFile.INIT, false, LogType.ERROR);
        }
    }
    
    // Verifica estado antes de chamar GetActivePlayersCount
    if (!ActivePlayers)
    {
        WriteToLog("  -> AVISO: ActivePlayers está NULL antes de GetActivePlayersCount! Inicializando...", LogFile.INIT, false, LogType.ERROR);
        ActivePlayers = new array<ref ActivePlayer>();
    }
    
    int totalCount = GetActivePlayersCount();
    WriteToLog("Total de jogadores conectados: " + totalCount, LogFile.INIT, false, LogType.INFO);
    if (ActivePlayers)
    {
        WriteToLog("  -> ActivePlayers.Count() = " + ActivePlayers.Count() + " | GetActivePlayersCount() = " + totalCount, LogFile.INIT, false, LogType.DEBUG);
    }
}

int FindActivePlayerIndexByIdentifiers(string targetPlayerId, string targetSteamId)
{
    if (!ActivePlayers)
        return -1;

    for (int searchIdx = 0; searchIdx < ActivePlayers.Count(); searchIdx++)
    {
        ActivePlayer storedPlayer = ActivePlayers.Get(searchIdx);
        if (!storedPlayer)
            continue;

        if ((targetPlayerId != "") && (storedPlayer.GetPlayerId() == targetPlayerId))
            return searchIdx;

        if ((targetSteamId != "") && (storedPlayer.GetSteamId() == targetSteamId))
            return searchIdx;

        if ((targetPlayerId != "") && storedPlayer.IsSamePlayerById(targetPlayerId))
            return searchIdx;

        if ((targetSteamId != "") && storedPlayer.IsSamePlayer(targetSteamId))
            return searchIdx;
    }

    return -1;
}

void PurgeDuplicateActivePlayers(int keepIndex, string targetPlayerId, string targetSteamId)
{
    if (!ActivePlayers)
        return;

    for (int purgeIdx = ActivePlayers.Count() - 1; purgeIdx >= 0; purgeIdx--)
    {
        if (purgeIdx == keepIndex)
            continue;

        ActivePlayer candidatePlayer = ActivePlayers.Get(purgeIdx);
        if (!candidatePlayer)
        {
            ActivePlayers.Remove(purgeIdx);
            continue;
        }

        bool isSamePlayer = false;
        if ((targetPlayerId != "") && (candidatePlayer.GetPlayerId() == targetPlayerId))
            isSamePlayer = true;
        else if ((targetSteamId != "") && (candidatePlayer.GetSteamId() == targetSteamId))
            isSamePlayer = true;
        else if ((targetPlayerId != "") && candidatePlayer.IsSamePlayerById(targetPlayerId))
            isSamePlayer = true;
        else if ((targetSteamId != "") && candidatePlayer.IsSamePlayer(targetSteamId))
            isSamePlayer = true;

        if (isSamePlayer)
        {
            string duplicateName = candidatePlayer.GetPlayerName();
            if (duplicateName == "")
                duplicateName = candidatePlayer.GetPlayerId();

            WriteToLog("PurgeDuplicateActivePlayers(): Removendo duplicata de jogador: " + duplicateName, LogFile.INIT, false, LogType.DEBUG);
            ActivePlayers.Remove(purgeIdx);
        }
    }
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

void EnsureActivePlayerHasManRef(string targetPlayerId, Man preferredMan = null)
{
    if (!ActivePlayers)
        return;

    if (targetPlayerId == "")
        return;

    int ensureIdx = FindActivePlayerIndexByIdentifiers(targetPlayerId, "");
    if (ensureIdx == -1)
        return;

    ActivePlayer ensurePlayer = ActivePlayers.Get(ensureIdx);
    if (!ensurePlayer)
        return;

    if (preferredMan)
    {
        ensurePlayer.SetPlayer(preferredMan);
        return;
    }

    if (ensurePlayer.HasPlayer())
        return;

    Man recoveredMan = FindPlayerManInWorld(targetPlayerId);
    if (recoveredMan)
    {
        ensurePlayer.SetPlayer(recoveredMan);
        WriteToLog("EnsureActivePlayerHasManRef(): Referência ao Man restaurada para PlayerID " + targetPlayerId, LogFile.INIT, false, LogType.DEBUG);
    }
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

// Busca um jogador ativo pelo Player ID
ActivePlayer GetActivePlayerById(string playerId)
{
    if (!ActivePlayers)
    {
        return null;
    }
    
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

// Remove um jogador da lista pelo Player ID
void RemoveActivePlayerById(string playerId)
{
    if (!ActivePlayers)
    {
        WriteToLog("RemoveActivePlayerById(): AVISO - ActivePlayers está NULL!", LogFile.INIT, false, LogType.DEBUG);
        return;
    }
    
    bool removedById = false;
    for (int j = ActivePlayers.Count() - 1; j >= 0; j--)
    {
        ActivePlayer player = ActivePlayers.Get(j);
        if (!player)
            continue;
        if (!player.IsSamePlayerById(playerId))
            continue;
        string nameLogId = player.GetPlayerName();
        if (nameLogId == "")
            nameLogId = player.GetPlayerId();
        WriteToLog("RemoveActivePlayerById(): Jogador removido: " + nameLogId + " (PlayerID: " + player.GetPlayerId() + ")", LogFile.INIT, false, LogType.INFO);
        ActivePlayers.Remove(j);
        removedById = true;
    }
    if (!removedById)
    {
        WriteToLog("RemoveActivePlayerById(): Jogador não encontrado na lista: " + playerId, LogFile.INIT, false, LogType.DEBUG);
    }
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

// Retorna a quantidade de jogadores ativos (apenas jogadores válidos)
int GetActivePlayersCount()
{
    // Verifica se ActivePlayers está inicializado
    if (!ActivePlayers)
    {
        WriteToLog("GetActivePlayersCount(): AVISO - ActivePlayers está NULL! Inicializando...", LogFile.INIT, false, LogType.ERROR);
        ActivePlayers = new array<ref ActivePlayer>();
        return 0;
    }
    
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
    // Função mantida para compatibilidade, mas sem funcionalidades ativas
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
    
    // Limpa desconexões pendentes antigas (timeout de 30 segundos)
    if (PendingDisconnects)
    {
        int currentTime = GetGame().GetTime();
        array<string> staleDisconnects = new array<string>();
        
        foreach (string playerId, int pendingTime : PendingDisconnects)
        {
            float timeSincePending = (currentTime - pendingTime) / 1000.0;
            if (timeSincePending > 30.0)
            {
                staleDisconnects.Insert(playerId);
            }
        }
        
        foreach (string staleId : staleDisconnects)
        {
            PendingDisconnects.Remove(staleId);
            WriteToLog("CleanupInvalidActivePlayers(): Removida desconexão pendente antiga (timeout) para: " + staleId, LogFile.INIT, false, LogType.DEBUG);
        }
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
        
        bool shouldSendDisconnect = true;
        bool isPendingDisconnect = false;
        
        // Verifica se está na lista de desconexões pendentes
        if (PendingDisconnects && PendingDisconnects.Contains(storedPlayerId))
        {
            isPendingDisconnect = true;
        }
        
        if (!activePlayerItem.HasIdentity())
        {
            WriteToLog("CleanupInvalidActivePlayers(): Removendo jogador sem Identity - Nome: " + storedName + " | PlayerID: " + storedPlayerId + " | SteamID: " + storedSteamId, LogFile.INIT, false, LogType.DEBUG);
            
            if (isPendingDisconnect)
            {
                WriteToLog("CleanupInvalidActivePlayers(): Jogador tem desconexão pendente, não enviando player_disconnected agora", LogFile.INIT, false, LogType.DEBUG);
            }
            
            // Verifica se deve enviar player_disconnected (não enviar se morreu recentemente ou está pendente)
            if (activePlayerItem.IsRecentlyDead(10.0))
            {
                WriteToLog("CleanupInvalidActivePlayers(): Jogador morreu recentemente, não enviando player_disconnected", LogFile.INIT, false, LogType.DEBUG);
                shouldSendDisconnect = false;
            }
            else if (isPendingDisconnect)
            {
                shouldSendDisconnect = false;
            }
            
            ActivePlayers.Remove(i);
            removedCount++;
            
            if (shouldSendDisconnect && storedPlayerId != "")
            {
                AppendExternalAction("{\"action\":\"player_disconnected\",\"player_id\":\"" + storedPlayerId + "\"}");
                WriteToLog("CleanupInvalidActivePlayers(): Evento player_disconnected enviado para jogador sem Identity", LogFile.INIT, false, LogType.INFO);
            }
            continue;
        }
        
        // Verifica se jogador está em ActivePlayers mas NÃO está no mundo (GHOST!)
        if (validPlayerIds.Find(storedPlayerId) == -1)
        {
            // É um ghost! Verifica se deve enviar desconexão
            shouldSendDisconnect = true;
            
            if (isPendingDisconnect)
            {
                WriteToLog("CleanupInvalidActivePlayers(): Ghost tem desconexão pendente, não enviando player_disconnected agora", LogFile.INIT, false, LogType.DEBUG);
            }
            
            if (activePlayerItem.IsRecentlyDead(10.0))
            {
                WriteToLog("CleanupInvalidActivePlayers(): Ghost morreu recentemente, não enviando player_disconnected", LogFile.INIT, false, LogType.DEBUG);
                shouldSendDisconnect = false;
            }
            else if (isPendingDisconnect)
            {
                shouldSendDisconnect = false;
            }
            
            // Força desconexão
            ForceDisconnectGhost(activePlayerItem);
            ActivePlayers.Remove(i);
            disconnectedCount++;
            removedCount++;
            WriteToLog("CleanupInvalidActivePlayers(): Ghost desconectado e removido - " + storedName + " (ID: " + storedPlayerId + ")", LogFile.INIT, false, LogType.INFO);
            
            if (shouldSendDisconnect && storedPlayerId != "")
            {
                AppendExternalAction("{\"action\":\"player_disconnected\",\"player_id\":\"" + storedPlayerId + "\"}");
                WriteToLog("CleanupInvalidActivePlayers(): Evento player_disconnected enviado para ghost", LogFile.INIT, false, LogType.INFO);
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

    WriteToLog("SendPlayersPositions(): Iniciando processamento de " + players.Count().ToString() + " jogadores", LogFile.INIT, false, LogType.DEBUG);

    string playersJson = "";
    int processedCount = 0;

    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (!player)
        {
            WriteToLog("SendPlayersPositions(): Jogador pulado - player NULL (cast falhou)", LogFile.INIT, false, LogType.DEBUG);
            continue;
        }

        PlayerIdentity identity = player.GetIdentity();
        if (!identity)
        {
            WriteToLog("SendPlayersPositions(): Jogador pulado - identity NULL", LogFile.INIT, false, LogType.DEBUG);
            continue;
        }

        string playerId = identity.GetId();
        string playerName = identity.GetName();

        if (playerId == "")
        {
            WriteToLog("SendPlayersPositions(): Jogador pulado - PlayerID vazio (Nome: " + playerName + ")", LogFile.INIT, false, LogType.DEBUG);
            continue;
        }

        if (playerName == "")
        {
            WriteToLog("SendPlayersPositions(): Jogador pulado - PlayerName vazio (PlayerID: " + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
            continue;
        }

        WriteToLog("SendPlayersPositions(): Processando jogador " + playerId + " - " + playerName, LogFile.INIT, false, LogType.DEBUG);

        vector position = player.GetPosition();
        if (position[0] == 0 && position[1] == 0 && position[2] == 0)
        {
            WriteToLog("SendPlayersPositions(): Jogador " + playerId + " pulado - posição inválida (0,0,0)", LogFile.INIT, false, LogType.DEBUG);
            continue;
        }

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
        
        PlayerStats statsEnergy = player.GetStatEnergy();
        if (statsEnergy)
            energy = statsEnergy.Get();
        
        PlayerStats statsWater = player.GetStatWater();
        if (statsWater)
            water = statsWater.Get();

        // Extrai status do jogador
        bool isAlive = player.IsAlive();
        bool isAdmin = CheckIfIsAdmin(playerId);

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
        if (!itemsInHands)
            itemsInHands = "";

        string mainItems = GetMainItems(player, 10);
        if (!mainItems)
            mainItems = "";

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

        processedCount++;
        WriteToLog("SendPlayersPositions(): Jogador " + playerId + " adicionado ao JSON", LogFile.INIT, false, LogType.DEBUG);
    }

    string jsonAction = "{\"action\":\"players_positions\",\"players\":[" + playersJson + "]}";
    AppendExternalAction(jsonAction);
    
    WriteToLog("SendPlayersPositions(): Processamento concluído - " + processedCount.ToString() + " processados de " + players.Count().ToString() + " encontrados", LogFile.INIT, false, LogType.DEBUG);
    WriteToLog("SendPlayersPositions(): Posições de " + processedCount.ToString() + " jogadores enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
}