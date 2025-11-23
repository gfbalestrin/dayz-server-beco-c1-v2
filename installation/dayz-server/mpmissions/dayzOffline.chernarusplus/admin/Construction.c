void CreateConstruction(PlayerBase player, string objectName)
{
    if (!player) return;

    vector playerPos = player.GetPosition();
    vector orientation = player.GetOrientation();

    float angle = orientation[0];
    float distance = 2.0;

    float rad = angle * Math.DEG2RAD;
    vector forward = Vector(Math.Sin(rad), 0, Math.Cos(rad));

    vector spawnPos = playerPos + (forward * distance);

    // Troque por um objeto garantido
    Object wall = GetGame().CreateObject(objectName, spawnPos, false, false);

    if (!wall)
    {
        WriteToLog("Objeto não foi criado!", LogFile.INIT, false, LogType.ERROR);
        player.MessageStatus("ERRO: Objeto não foi criado!");
    }        
    else{
        WriteToLog("Objeto criado na posição: " + spawnPos, LogFile.INIT, false, LogType.INFO);
        player.MessageStatus("SUCESSO: Objeto criado na posição: " + spawnPos);
    }
        
}

void CreateCustomObject(PlayerBase player, string buildName, float heightOffset = 1.0, int containerCount = 4, float containerLength = 6.0, float rotationOffset = 0.0)
{
    if (!player) return;
    if (buildName == "") {
        player.MessageStatus("ERRO: Nome de objeto inválido.");
        return;
    }

    vector basePos = player.GetPosition();
    float playerAngle = player.GetOrientation()[0];
    float finalAngle = playerAngle + rotationOffset;

    float rad = playerAngle * Math.DEG2RAD;
    vector forward = Vector(Math.Sin(rad), 0, Math.Cos(rad)); // Direção de avanço

    for (int i = 0; i < containerCount; i++)
    {
        vector offset = forward * (i * containerLength);
        vector spawnPos = basePos + offset;

        // Corrige altura com SurfaceY + offset vertical
        float groundY = GetGame().SurfaceY(spawnPos[0], spawnPos[2]);
        spawnPos[1] = groundY + heightOffset;

        Object obj = GetGame().CreateObject(buildName, spawnPos, false, true);
        if (obj)
        {
            obj.SetPosition(spawnPos);
            obj.SetOrientation(Vector(finalAngle, 0, 0)); // Aplica rotação parametrizada
            player.MessageStatus("SUCESSO: Objeto " + buildName + " criado na posição: " + spawnPos);
        }
        else
        {
            WriteToLog("ERRO: Falha ao criar " + buildName + " em " + spawnPos, LogFile.INIT, false, LogType.ERROR);
            player.MessageStatus("ERRO: Falha ao criar " + buildName + " em " + spawnPos);
        }
    }
}

// Cria objetos ao longo de uma linha entre dois pontos
void CreateObjectsAlongLine(vector startPos, vector endPos, string objectName, float spacing, float heightOffset, float rotationOffset)
{
    vector direction = endPos - startPos;
    float length = direction.Length();
    int count = Math.Floor(length / spacing);
    direction.Normalize();

    float angle = (Math.Atan2(direction[0], direction[2]) * Math.RAD2DEG) + rotationOffset;

    for (int i = 0; i <= count; i++)
    {
        vector pos = startPos + (direction * (i * spacing));
        pos[1] = GetGame().SurfaceY(pos[0], pos[2]) + heightOffset;

        Object obj = GetGame().CreateObject(objectName, pos, false, true);
        if (obj)
        {
            obj.SetPosition(pos);
            obj.SetOrientation(Vector(angle, 0, 0));
        }
    }
}

// Cria objetos entre vários pontos sequenciais e fecha o caminho automaticamente
void CreateLinePathFromPoints(array<vector> points, string objectName, float spacing = 6.0, float heightOffset = 1.0, float rotationOffset = 0.0)
{
    if (points.Count() < 2) return;

    for (int i = 0; i < points.Count() - 1; i++)
    {
        CreateObjectsAlongLine(points[i], points[i + 1], objectName, spacing, heightOffset, rotationOffset);
    }

    // Fecha o polígono ligando o último ao primeiro
    CreateObjectsAlongLine(points[points.Count() - 1], points[0], objectName, spacing, heightOffset, rotationOffset);
}

// Verifica se ponto está dentro do polígono (Ray-Casting)
bool IsInsidePolygonToRemove(vector point, array<vector> polygon)
{
	int count = polygon.Count();
	bool inside = false;

	float px = point[0];
	float pz = point[2];

	for (int i = 0, j = count - 1; i < count; j = i++)
	{
		float xi = polygon[i][0], zi = polygon[i][2];
		float xj = polygon[j][0], zj = polygon[j][2];

		float denom = zj - zi;
		if (Math.AbsFloat(denom) < 0.00001)
			denom = 0.00001;

		bool intersect = ((zi > pz) != (zj > pz)) && (px < (xj - xi) * (pz - zi) / denom + xi);
		if (intersect)
			inside = !inside;
	}

	return inside;
}

// Calcula o centro do polígono
vector CalculateCentroid(array<vector> polygon)
{
	if (!polygon || polygon.Count() == 0)
		return "0 0 0";

	vector center = "0 0 0";
	foreach (vector p : polygon)
	{
		center += p;
	}

	float count = polygon.Count() * 1.0;
    center[0] = center[0] / count;
    center[1] = center[1] / count;
    center[2] = center[2] / count;
    
    return center;
}

// Calcula o raio até o ponto mais distante
float CalculateMaxDistanceFromCenter(vector center, array<vector> polygon)
{
	float maxDist = 0;
	foreach (vector p : polygon)
	{
		float dist = vector.Distance(p, center);
		if (dist > maxDist)
			maxDist = dist;
	}
	return maxDist + 100; // margem extra
}

// Remove objetos fora do polígono
void RemoveObjectsOutsidePolygon(array<vector> polygon)
{
    vector center = CalculateCentroid(polygon);
    float radius = CalculateMaxDistanceFromCenter(center, polygon);

    array<Object> objects = new array<Object>();
    GetGame().GetObjectsAtPosition(center, radius, objects, null);

    int removed = 0;

    // Lista opcional para preservar certos objetos
    array<string> blacklist = {
        "Land_Container_1Bo"
    };

    foreach (Object obj : objects)
    {
        if (!obj || obj.IsMan() || obj.IsInherited(PlayerBase) || obj.IsTransport())
            continue;
        if (obj.IsInherited(BuildingBase) || obj.IsInherited(House))
	        continue;

        string className = obj.GetType();
        if (blacklist.Find(className) != -1)
            continue;

        vector pos = obj.GetPosition();

        if (!IsInsidePolygonToRemove(pos, polygon))
        {
            if (obj.IsInherited(BuildingBase))
            {
                // Tenta destruir a construção "matando" sua saúde
                obj.SetHealth("", "Health", 0);
                removed++;
            }
            else
            {
                // Remove objetos móveis normalmente
                GetGame().ObjectDelete(obj);
                removed++;
            }
        }
    }

    WriteToLog("RemoveObjectsOutsidePolygon(): Objetos removidos: " + removed.ToString(), LogFile.INIT, false, LogType.DEBUG);
}

