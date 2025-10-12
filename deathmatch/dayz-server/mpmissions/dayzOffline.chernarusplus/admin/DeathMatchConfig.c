ref SafeZoneData LoadActiveRegionData(string path)
{
	WriteToLog("Carregando arquivo JSON: " + path, LogFile.INIT, false, LogType.DEBUG);

	JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(path, maps);

	foreach (ref SafeZoneData data : maps) {
		if (data && data.Active) {
			WriteToLog("Região ativa encontrada:", LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("Region: " + data.Region, LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("Mensagem personalizada: " + data.CustomMessage, LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("SpawnZones: " + data.SpawnZones.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
			WriteToLog("WallZones: " + data.WallZones.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);            
            if (!data.Spawns)
                return data;

            if (data.Spawns.Vehicles)
                WriteToLog("Spawns.Vehicles: " + data.Spawns.Vehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
            
            return data;
		}
	}

	WriteToLog("Nenhuma região ativa encontrada.", LogFile.INIT, false, LogType.ERROR);
	return null;
}

void ToggleActiveRegion(string path)
{
    WriteToLog("Carregando JSON de regiões: " + path, LogFile.INIT, false, LogType.DEBUG);

    ref array<ref SafeZoneData> zones;
    JsonFileLoader<array<ref SafeZoneData>>.JsonLoadFile(path, zones);

    int activeIndex = -1;
    for (int i = 0; i < zones.Count(); i++) {
        if (zones[i].Active) {
            zones[i].Active = false;
            activeIndex = i;
            break;
        }
    }

    int nextIndex = (activeIndex + 1) % zones.Count(); // loop circular
    zones[nextIndex].Active = true;

    JsonFileLoader<array<ref SafeZoneData>>.JsonSaveFile(path, zones);
    nextMap = zones[nextIndex];

    WriteToLog("Região ativa alterada para: " + zones[nextIndex].Region, LogFile.INIT, false, LogType.INFO);
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
