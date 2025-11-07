int GetNextAvailableMapIndex(array<ref SafeZoneData> zones, int startIndex)
{
	if (!zones)
		return -1;

	int totalCount = zones.Count();
	if (totalCount == 0)
		return -1;

	int baseIndex = startIndex;
	if (baseIndex < 0 || baseIndex >= totalCount)
		baseIndex = 0;

	int attempts = 0;
	int candidateIndex = baseIndex;

	while (attempts < totalCount)
	{
		candidateIndex++;
		if (candidateIndex >= totalCount)
			candidateIndex = 0;

		ref SafeZoneData candidateZone = zones[candidateIndex];
		if (candidateZone && !candidateZone.IsDeleted)
			return candidateIndex;

		attempts++;
	}

	return baseIndex;
}

ref SafeZoneData LoadActiveRegionData(string path)
{
	WriteToLog("Carregando arquivo JSON: " + path, LogFile.INIT, false, LogType.DEBUG);

	JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(path, maps);

	if (!maps || maps.Count() == 0)
	{
		WriteToLog("LoadActiveRegionData(): Lista de mapas vazia ou nula.", LogFile.INIT, false, LogType.ERROR);
		return null;
	}

	bool needsSave = false;
	int activeIndex = -1;
	int nextIndex = -1;

	for (int mapIdx = 0; mapIdx < maps.Count(); mapIdx++)
	{
		ref SafeZoneData mapEntry = maps[mapIdx];
		if (!mapEntry)
			continue;

		if (mapEntry.IsDeleted)
		{
			if (mapEntry.Active)
			{
				mapEntry.Active = false;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Região deletada estava ativa. RegionId " + mapEntry.RegionId.ToString() + " desmarcada.", LogFile.INIT, false, LogType.WARNING);
			}

			if (mapEntry.NextActiveMap)
			{
				mapEntry.NextActiveMap = false;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Região deletada estava marcada como próxima. RegionId " + mapEntry.RegionId.ToString() + " desmarcada.", LogFile.INIT, false, LogType.WARNING);
			}

			continue;
		}

		if (mapEntry.Active)
		{
			if (activeIndex == -1)
			{
				activeIndex = mapIdx;
			}
			else
			{
				mapEntry.Active = false;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Múltiplas regiões ativas detectadas. RegionId " + mapEntry.RegionId.ToString() + " desmarcada.", LogFile.INIT, false, LogType.WARNING);
			}
		}

		if (mapEntry.NextActiveMap)
		{
			if (nextIndex == -1)
			{
				nextIndex = mapIdx;
			}
			else
			{
				mapEntry.NextActiveMap = false;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Múltiplas regiões marcadas como próximas. RegionId " + mapEntry.RegionId.ToString() + " desmarcada.", LogFile.INIT, false, LogType.WARNING);
			}
		}
	}

	if (activeIndex == -1)
	{
		for (int fallbackIdx = 0; fallbackIdx < maps.Count(); fallbackIdx++)
		{
			ref SafeZoneData fallbackEntry = maps[fallbackIdx];
			if (fallbackEntry && !fallbackEntry.IsDeleted)
			{
				fallbackEntry.Active = true;
				activeIndex = fallbackIdx;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Nenhuma região ativa encontrada. RegionId " + fallbackEntry.RegionId.ToString() + " tornou-se ativa.", LogFile.INIT, false, LogType.ERROR);
				break;
			}
		}
	}

	if (activeIndex == -1)
	{
		WriteToLog("LoadActiveRegionData(): Não há regiões válidas para carregar.", LogFile.INIT, false, LogType.ERROR);
		return null;
	}

	ref SafeZoneData activeRegion = maps[activeIndex];

	bool keepSameNext = false;
	if (nextIndex != -1)
	{
		ref SafeZoneData candidateNext = maps[nextIndex];
		if (!candidateNext || candidateNext.IsDeleted)
		{
			if (candidateNext && candidateNext.NextActiveMap)
			{
				candidateNext.NextActiveMap = false;
				needsSave = true;
				WriteToLog("LoadActiveRegionData(): Região próxima inválida detectada. RegionId " + candidateNext.RegionId.ToString() + " desmarcada.", LogFile.INIT, false, LogType.WARNING);
			}

			nextIndex = -1;
		}
		else if (nextIndex == activeIndex)
		{
			keepSameNext = true;
		}
	}

	bool promotedToActive = false;
	if (nextIndex != -1 && !keepSameNext)
	{
		if (activeRegion)
		{
			activeRegion.Active = false;
		}

		ref SafeZoneData promotedRegion = maps[nextIndex];
		promotedRegion.Active = true;
		activeIndex = nextIndex;
		activeRegion = promotedRegion;
		promotedToActive = true;
		needsSave = true;

		WriteToLog("LoadActiveRegionData(): Promovendo RegionId " + promotedRegion.RegionId.ToString() + " para mapa ativo.", LogFile.INIT, false, LogType.INFO);

		nextIndex = -1;
	}

	int nextTargetIndex = -1;
	if (keepSameNext && !promotedToActive)
	{
		nextTargetIndex = activeIndex;
	}
	else
	{
		nextTargetIndex = GetNextAvailableMapIndex(maps, activeIndex);
		if (nextTargetIndex == -1)
			nextTargetIndex = activeIndex;
	}

	for (int nextIdx = 0; nextIdx < maps.Count(); nextIdx++)
	{
		ref SafeZoneData zoneToAdjust = maps[nextIdx];
		if (!zoneToAdjust)
			continue;

		bool shouldBeNext = (nextIdx == nextTargetIndex);
		if (zoneToAdjust.NextActiveMap != shouldBeNext)
		{
			zoneToAdjust.NextActiveMap = shouldBeNext;
			needsSave = true;
		}
	}

	if (nextTargetIndex >= 0 && nextTargetIndex < maps.Count())
	{
		nextMap = maps[nextTargetIndex];
	}
	else
	{
		nextMap = activeRegion;
	}

	WriteToLog("LoadActiveRegionData(): Mapa atual -> " + activeRegion.Region + " | Próximo mapa -> " + nextMap.Region, LogFile.INIT, false, LogType.INFO);

	if (needsSave)
	{
		JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(path, maps);
		WriteToLog("LoadActiveRegionData(): Arquivo normalizado com sucesso.", LogFile.INIT, false, LogType.INFO);
	}

	if (activeRegion.SpawnZones)
	{
		WriteToLog("SpawnZones: " + activeRegion.SpawnZones.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
	}

	if (activeRegion.WallZones)
	{
		WriteToLog("WallZones: " + activeRegion.WallZones.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
	}

	if (activeRegion.Spawns && activeRegion.Spawns.Vehicles)
	{
		WriteToLog("Spawns.Vehicles: " + activeRegion.Spawns.Vehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
	}

	return activeRegion;
}

void ToggleActiveRegion(string path)
{
	WriteToLog("ToggleActiveRegion(): Atualizando indicador de próximo mapa.", LogFile.INIT, false, LogType.DEBUG);

	ref array<ref SafeZoneData> zones = maps;
	if (!zones || zones.Count() == 0)
	{
		JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(path, zones);
		maps = zones;
	}

	if (!zones || zones.Count() == 0)
	{
		WriteToLog("ToggleActiveRegion(): Lista de regiões vazia.", LogFile.INIT, false, LogType.ERROR);
		return;
	}

	int activeIndex = -1;
	for (int indexSearch = 0; indexSearch < zones.Count(); indexSearch++)
	{
		ref SafeZoneData zoneSearch = zones[indexSearch];
		if (!zoneSearch || zoneSearch.IsDeleted)
			continue;

		if (zoneSearch.Active)
		{
			activeIndex = indexSearch;
			break;
		}
	}

	if (activeIndex == -1)
	{
		WriteToLog("ToggleActiveRegion(): Nenhum mapa ativo disponível para atualizar.", LogFile.INIT, false, LogType.ERROR);
		return;
	}

	int pendingNextIndex = GetNextAvailableMapIndex(zones, activeIndex);
	if (pendingNextIndex == -1)
		pendingNextIndex = activeIndex;

	bool dirty = false;
	for (int updateIdx = 0; updateIdx < zones.Count(); updateIdx++)
	{
		ref SafeZoneData zoneUpdate = zones[updateIdx];
		if (!zoneUpdate)
			continue;

		bool stateNext = (updateIdx == pendingNextIndex);
		if (zoneUpdate.NextActiveMap != stateNext)
		{
			zoneUpdate.NextActiveMap = stateNext;
			dirty = true;
		}
	}

	if (dirty)
	{
		JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(path, zones);
		WriteToLog("ToggleActiveRegion(): Próximo mapa atualizado para RegionId " + zones[pendingNextIndex].RegionId.ToString(), LogFile.INIT, false, LogType.INFO);
	}

	nextMap = zones[pendingNextIndex];
}

void ExtractVectorArray(string json, string key, out array<vector> output)
{
    output = new array<vector>();

    int idx = json.IndexOf(key);
    if (idx == -1) return;

    string sub = json.Substring(idx, json.Length() - idx);
    int sBracket = sub.IndexOf("[");
    int eBracket = sub.IndexOf("]");
    if (sBracket == -1 || eBracket == -1 || eBracket <= sBracket) return;

    string rawBlock = sub.Substring(sBracket + 1, eBracket - sBracket - 1);

    array<string> entries = new array<string>();
    rawBlock.Split(",", entries);

    for (int i = 0; i + 2 < entries.Count(); i += 3) {
        string vecStr = entries[i] + "," + entries[i + 1] + "," + entries[i + 2];
        vecStr.Replace("\"", "");
        vecStr.Trim();

        TStringArray parts = new TStringArray();
        vecStr.Split(",", parts);

        if (parts.Count() == 3) {
            float x = parts[0].Trim().ToFloat();
            float y = parts[1].Trim().ToFloat();
            float z = parts[2].Trim().ToFloat();
            output.Insert(Vector(x, y, z));
        }
    }
}

vector GetRandomSafeSpawnPosition(array<vector> spawnZones)
{
    if (spawnZones.Count() == 0) {
        WriteToLog("Nenhuma zona segura disponível para spawn.", LogFile.INIT, false, LogType.ERROR);
        return "0 0 0";
    }

    int index = Math.RandomInt(0, spawnZones.Count());
    vector basePos = spawnZones[index];

    //float surfaceY = GetGame().SurfaceY(basePos[0], basePos[2]);
    vector safePosition = Vector(basePos[0], basePos[1] + 0.2, basePos[2]);

    WriteToLog("Posição segura selecionada: " + safePosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
    return safePosition;
}

vector GetFarthestSpawnPosition(array<vector> spawnZones)
{
    array<Man> players = new array<Man>();
    GetGame().GetPlayers(players);

    if (!players || players.Count() <= 1)
    {
        int randomIndex = Math.RandomInt(0, spawnZones.Count());
        vector randomPosition = spawnZones[randomIndex];
        WriteToLog("GetFarthestSpawnPosition(): Apenas um jogador ativo. Selecionando posição aleatória: " + randomPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
        return randomPosition;
    }

    vector bestSpawn = spawnZones[0];
    float bestDistance = -1;

    for (int spawnIdx = 0; spawnIdx < spawnZones.Count(); spawnIdx++)
    {
        vector candidateSpawn = spawnZones[spawnIdx];
        float closestDistance = 9999999;

        for (int playerIdx = 0; playerIdx < players.Count(); playerIdx++)
        {
            PlayerBase activePlayer = PlayerBase.Cast(players[playerIdx]);
            if (!activePlayer)
                continue;

            if (!activePlayer.IsAlive())
                continue;

            vector playerPosition = activePlayer.GetPosition();
            float currentDistance = vector.Distance(candidateSpawn, playerPosition);

            if (currentDistance < closestDistance)
                closestDistance = currentDistance;
        }

        if (closestDistance > bestDistance)
        {
            bestDistance = closestDistance;
            bestSpawn = candidateSpawn;
        }
    }

    WriteToLog("GetFarthestSpawnPosition(): Posição selecionada " + bestSpawn.ToString() + " com distância mínima " + bestDistance.ToString(), LogFile.INIT, false, LogType.INFO);
    return bestSpawn;
}


bool IsInsidePolygon(vector point, array<vector> polygon)
{
	if (polygon.Count() < 3)
		return false;

	bool inside = false;

	for (int i = 0; i < polygon.Count(); i++)
	{
		int j;
		if (i == 0)
			j = polygon.Count() - 1;
		else
			j = i - 1;

		vector pi = polygon[i];
		vector pj = polygon[j];

		if (((pi[2] > point[2]) != (pj[2] > point[2])) && (point[0] < (pj[0] - pi[0]) * (point[2] - pi[2]) / ((pj[2] - pi[2]) + 0.0001) + pi[0]))
		{
			inside = !inside;
		}
	}

	return inside;
}


void CheckPlayerAreaPolygonal(PlayerBase player, array<vector> wallZones)
{
	if (!player || wallZones.Count() < 3)
		return;

	vector pos = player.GetPosition();

	bool inside = IsInsidePolygon(pos, wallZones);

	if (!inside)
	{
        player.DecreaseHealth("GlobalHealth", "Health", 20.0);
        player.GetBleedingManagerServer().AttemptAddBleedingSourceBySelection("LeftArm");
        SendPrivateMessage(player.GetIdentity().GetId(), "VOCÊ SAIU DA ZONA SEGURA E RECEBERÁ PENALIDADES!", MessageColor.IMPORTANT);
		WriteToLog("Jogador " + player.GetIdentity().GetName() + " saiu da zona segura.", LogFile.INIT, false, LogType.DEBUG);
	}
}
