
void PopulateTrackedFences(array<Object> worldObjects)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!m_TrackedFences)
	{
		WriteToLog("PopulateTrackedFences(): Inicializando array m_TrackedFences...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedFences = new array<Fence>();
	}
	else
	{
		WriteToLog("PopulateTrackedFences(): Array m_TrackedFences já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedFences.Clear();
	}

	if (!worldObjects)
	{
		WriteToLog("PopulateTrackedFences(): Lista de objetos vazia recebida.", LogFile.INIT, false, LogType.WARNING);
		return;
	}

	foreach (Object candidateObject : worldObjects)
	{
		Fence candidateFence = Fence.Cast(candidateObject);
		if (!candidateFence)
			continue;

		if (!candidateFence.HasBase())
			continue;

		m_TrackedFences.Insert(candidateFence);
	}

	WriteToLog("PopulateTrackedFences(): Total de fences em rastreamento: " + m_TrackedFences.Count().ToString(), LogFile.INIT, false, LogType.INFO);
}

void RegisterFence(Fence newFence)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!newFence)
		return;

	if (!newFence.HasBase())
		return;

	if (!m_TrackedFences)
		m_TrackedFences = new array<Fence>();

	int trackedCount = m_TrackedFences.Count();
	for (int trackedIndex = 0; trackedIndex < trackedCount; trackedIndex++)
	{
		Fence trackedFence = m_TrackedFences.Get(trackedIndex);
		if (!trackedFence)
			continue;

		if (trackedFence == newFence)
		{
			WriteToLog("RegisterFence(): Fence já está rastreada, ignorando.", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
	}

	m_TrackedFences.Insert(newFence);

	vector fencePosition = newFence.GetPosition();
	vector fenceOrientation = newFence.GetOrientation();
	WriteToLog("RegisterFence(): Fence adicionada em " + fencePosition.ToString() + " orientação " + fenceOrientation.ToString(), LogFile.INIT, false, LogType.INFO);
}

bool RegisterFenceAtPosition(vector targetPosition, float searchRadius = 3.0)
{
    if (!GetGame() || !GetGame().IsServer())
        return false;

    if (searchRadius <= 0)
        searchRadius = 3.0;

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(targetPosition, searchRadius, nearbyObjects, null);

    if (!nearbyObjects || nearbyObjects.Count() == 0)
    {
        WriteToLog("RegisterFenceAtPosition(): Nenhum objeto encontrado próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    Fence closestFence;
    float closestDistance = searchRadius + 1.0;

    foreach (Object candidateObject : nearbyObjects)
    {
        Fence candidateFence = Fence.Cast(candidateObject);
        if (!candidateFence)
            continue;

        if (!candidateFence.HasBase())
            continue;

        vector candidatePosition = candidateFence.GetPosition();
        float candidateDistance = vector.Distance(candidatePosition, targetPosition);
        if (candidateDistance > searchRadius)
            continue;

        if (!closestFence || candidateDistance < closestDistance)
        {
            closestFence = candidateFence;
            closestDistance = candidateDistance;
        }
    }

    if (!closestFence)
    {
        WriteToLog("RegisterFenceAtPosition(): Nenhuma fence válida encontrada próxima a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    RegisterFence(closestFence);

    WriteToLog("RegisterFenceAtPosition(): Fence registrada a " + closestDistance.ToString() + "m da posição alvo", LogFile.INIT, false, LogType.INFO);
    return true;
}

void InitFenceTracking()
{
	WriteToLog("InitFenceTracking(): Iniciando rastreamento de fences...", LogFile.INIT, false, LogType.INFO);

	array<Object> trackedObjects = new array<Object>();
	GatherWorldObjects(trackedObjects);
	PopulateTrackedFences(trackedObjects);
}

void CleanTrackedFences()
{
    if (!m_TrackedFences)
        return;

    int removedCount = 0;
    for (int i = m_TrackedFences.Count() - 1; i >= 0; i--)
    {
        Fence trackedFence = m_TrackedFences.Get(i);
        if (!trackedFence)
        {
            m_TrackedFences.Remove(i);
            removedCount++;
            continue;
        }

        if (!trackedFence.HasBase())
        {
            m_TrackedFences.Remove(i);
            removedCount++;
        }
    }

    if (removedCount > 0)
    {
        WriteToLog("CleanTrackedFences(): " + removedCount.ToString() + " fences inválidas removidas do rastreamento", LogFile.INIT, false, LogType.DEBUG);
    }
}

void SendFencesStatus()
{
    int count = 0;
    string fencesJson = "";

	if (m_TrackedFences)
    {
		foreach (Fence trackedFence : m_TrackedFences)
		{
			if (!trackedFence)
				continue;

			bool hasBase = trackedFence.HasBase();
			if (!hasBase)
				continue;

			Construction construction = trackedFence.GetConstruction();
			bool lowerPanelBuilt = false;
			bool upperPanelBuilt = false;

			if (construction)
			{
				array<string> lowerParts = { "wall_wood_down", "wall_metal_down" };
				foreach (string lowerPartName : lowerParts)
				{
					ConstructionPart lowerPart = construction.GetConstructionPart(lowerPartName);
					if (lowerPart && lowerPart.IsBuilt())
					{
						lowerPanelBuilt = true;
						break;
					}
				}

				array<string> upperParts = { "wall_wood_up", "wall_metal_up" };
				foreach (string upperPartName : upperParts)
				{
					ConstructionPart upperPart = construction.GetConstructionPart(upperPartName);
					if (upperPart && upperPart.IsBuilt())
					{
						upperPanelBuilt = true;
						break;
					}
				}
			}

			bool isIncomplete = !(lowerPanelBuilt && upperPanelBuilt);

			vector pos = trackedFence.GetPosition();
			vector ori = trackedFence.GetOrientation();

			bool isOpened = trackedFence.IsOpened();
			string openState;
			if (isOpened)
				openState = "Aberto";
			else
				openState = "Fechado";

			bool hasGate = trackedFence.HasFullyConstructedGate();

			string gateState;
			if (hasGate)
				gateState = "Sim";
			else
				gateState = "Não";

			bool isLocked = trackedFence.IsLocked();
			string lockedState;
			if (isLocked)
				lockedState = "Sim";
			else
				lockedState = "Não";

			TStringArray attachments = new TStringArray;
			string attachmentsJson = "";
			if (trackedFence.GetInventory())
			{
				for (int i = 0; i < trackedFence.GetInventory().AttachmentCount(); i++)
				{
					EntityAI att = trackedFence.GetInventory().GetAttachmentFromIndex(i);
					if (att)
					{
						string attType = att.GetType();
						attachments.Insert(attType);

						if (attachmentsJson != "")
							attachmentsJson += ",";
						attachmentsJson += "\"" + attType + "\"";
					}
				}
			}

			string attachmentList;
			if (attachments.Count() > 0)
				attachmentList = string.Join(", ", attachments);
			else
				attachmentList = "Nenhum";

			string posStr = pos[0].ToString() + ", " + pos[1].ToString() + ", " + pos[2].ToString();
			string oriStr = ori[0].ToString() + ", " + ori[1].ToString() + ", " + ori[2].ToString();
			string logMsg = "[FENCE] Posição=(" + posStr + ") | Ori=(" + oriStr + ") | Portão: " + gateState + " | Estado: " + openState + " | Trancado: " + lockedState + " | Anexos: " + attachmentList;
			if (isIncomplete)
			{
				logMsg += " | Detalhes: has_base=" + hasBase.ToString() + ", lower_panel_built=" + lowerPanelBuilt.ToString() + ", upper_panel_built=" + upperPanelBuilt.ToString();
			}
			Print(logMsg);
			WriteToLog(logMsg, LogFile.INIT, false, LogType.INFO);

			if (fencesJson != "")
				fencesJson += ",";
			string posX = pos[0].ToString();
			string posZ = pos[1].ToString();
			string posY = pos[2].ToString();
			string oriX = ori[0].ToString();
			string oriY = ori[1].ToString();
			string oriZ = ori[2].ToString();
			string hasGateStr = hasGate.ToString();
			string isOpenedStr = isOpened.ToString();
			string isLockedStr = isLocked.ToString();
			string hasBaseStr = hasBase.ToString();
			string lowerPanelBuiltStr = lowerPanelBuilt.ToString();
			string upperPanelBuiltStr = upperPanelBuilt.ToString();

			fencesJson += "{\"position\":{\"x\":" + posX + ",\"z\":" + posZ + ",\"y\":" + posY + "}";
			fencesJson += ",\"orientation\":{\"x\":" + oriX + ",\"y\":" + oriY + ",\"z\":" + oriZ + "}";
			fencesJson += ",\"has_gate\":" + hasGateStr;
			fencesJson += ",\"is_opened\":" + isOpenedStr;
			fencesJson += ",\"is_locked\":" + isLockedStr;
			fencesJson += ",\"attachments\":[" + attachmentsJson + "]";
			fencesJson += ",\"has_base\":" + hasBaseStr;
			fencesJson += ",\"lower_panel_built\":" + lowerPanelBuiltStr;
			fencesJson += ",\"upper_panel_built\":" + upperPanelBuiltStr;
			fencesJson += "}";

			count++;
		}
    }

    //if (count == 0)
    //    return;

    string jsonAction = "{\"action\":\"fences_positions\",\"fence_data\":[" + fencesJson + "]}";
    AppendExternalAction(jsonAction);
    WriteToLog("SendFencesStatus(): JSON com " + count.ToString() + " fences enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);

    string summary = "[FENCE TRACKING] Total de fences enviadas: " + count.ToString();
    Print(summary);
    WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
}

void ScanFences()
{
    if (!m_TrackedFences || m_TrackedFences.Count() == 0)
        InitFenceTracking();

    CleanTrackedFences();
    SendFencesStatus();
}

string BoolToJson(bool value)
{
    if (value)
        return "true";
    return "false";
}

bool IsWatchtowerPartBuilt(Construction construction, string partName)
{
    if (!construction || partName == "")
        return false;

    ConstructionPart towerPart = construction.GetConstructionPart(partName);
    if (!towerPart)
        return false;

    return towerPart.IsBuilt();
}

void PopulateTrackedWatchtowers(array<Object> worldObjects)
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    if (!m_TrackedWatchtowers)
    {
        WriteToLog("PopulateTrackedWatchtowers(): Inicializando array m_TrackedWatchtowers...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedWatchtowers = new array<Watchtower>();
    }
    else
    {
        WriteToLog("PopulateTrackedWatchtowers(): Array m_TrackedWatchtowers já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedWatchtowers.Clear();
    }

    if (!worldObjects)
    {
        WriteToLog("PopulateTrackedWatchtowers(): Lista de objetos vazia recebida.", LogFile.INIT, false, LogType.WARNING);
        return;
    }

    foreach (Object candidateObject : worldObjects)
    {
        Watchtower candidateWatchtower = Watchtower.Cast(candidateObject);
        if (!candidateWatchtower)
            continue;

        if (!candidateWatchtower.HasBase())
            continue;

        m_TrackedWatchtowers.Insert(candidateWatchtower);
    }

    WriteToLog("PopulateTrackedWatchtowers(): Total de watchtowers em rastreamento: " + m_TrackedWatchtowers.Count().ToString(), LogFile.INIT, false, LogType.INFO);
}

void RegisterWatchtower(Watchtower newWatchtower)
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    if (!newWatchtower)
        return;

    if (!newWatchtower.HasBase())
        return;

    if (!m_TrackedWatchtowers)
        m_TrackedWatchtowers = new array<Watchtower>();

    int trackedCount = m_TrackedWatchtowers.Count();
    for (int trackedIndex = 0; trackedIndex < trackedCount; trackedIndex++)
    {
        Watchtower trackedWatchtower = m_TrackedWatchtowers.Get(trackedIndex);
        if (!trackedWatchtower)
            continue;

        if (trackedWatchtower == newWatchtower)
        {
            WriteToLog("RegisterWatchtower(): Watchtower já está rastreada, ignorando.", LogFile.INIT, false, LogType.DEBUG);
            return;
        }
    }

    m_TrackedWatchtowers.Insert(newWatchtower);

    vector watchtowerPosition = newWatchtower.GetPosition();
    vector watchtowerOrientation = newWatchtower.GetOrientation();
    WriteToLog("RegisterWatchtower(): Watchtower adicionada em " + watchtowerPosition.ToString() + " orientação " + watchtowerOrientation.ToString(), LogFile.INIT, false, LogType.INFO);
}

bool RegisterWatchtowerAtPosition(vector targetPosition, float searchRadius = 3.0)
{
    if (!GetGame() || !GetGame().IsServer())
        return false;

    if (searchRadius <= 0)
        searchRadius = 3.0;

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(targetPosition, searchRadius, nearbyObjects, null);

    if (!nearbyObjects || nearbyObjects.Count() == 0)
    {
        WriteToLog("RegisterWatchtowerAtPosition(): Nenhum objeto encontrado próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    Watchtower closestWatchtower;
    float closestDistance = searchRadius + 1.0;

    foreach (Object candidateObject : nearbyObjects)
    {
        Watchtower candidateWatchtower = Watchtower.Cast(candidateObject);
        if (!candidateWatchtower)
            continue;

        if (!candidateWatchtower.HasBase())
            continue;

        vector candidatePosition = candidateWatchtower.GetPosition();
        float candidateDistance = vector.Distance(candidatePosition, targetPosition);
        if (candidateDistance > searchRadius)
            continue;

        if (!closestWatchtower || candidateDistance < closestDistance)
        {
            closestWatchtower = candidateWatchtower;
            closestDistance = candidateDistance;
        }
    }

    if (!closestWatchtower)
    {
        WriteToLog("RegisterWatchtowerAtPosition(): Nenhuma watchtower válida encontrada próxima a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    RegisterWatchtower(closestWatchtower);

    WriteToLog("RegisterWatchtowerAtPosition(): Watchtower registrada a " + closestDistance.ToString() + "m da posição alvo", LogFile.INIT, false, LogType.INFO);
    return true;
}

void CleanTrackedWatchtowers()
{
    if (!m_TrackedWatchtowers)
        return;

    int removedCount = 0;
    for (int i = m_TrackedWatchtowers.Count() - 1; i >= 0; i--)
    {
        Watchtower trackedWatchtower = m_TrackedWatchtowers.Get(i);
        if (!trackedWatchtower)
        {
            m_TrackedWatchtowers.Remove(i);
            removedCount++;
            continue;
        }

        if (!trackedWatchtower.HasBase())
        {
            m_TrackedWatchtowers.Remove(i);
            removedCount++;
        }
    }

    if (removedCount > 0)
    {
        WriteToLog("CleanTrackedWatchtowers(): " + removedCount.ToString() + " watchtowers inválidas removidas do rastreamento", LogFile.INIT, false, LogType.DEBUG);
    }
}

void SendWatchtowersStatus()
{
    int count = 0;
    string watchtowersJson = "";

    if (m_TrackedWatchtowers)
    {
        foreach (Watchtower trackedWatchtower : m_TrackedWatchtowers)
        {
            if (!trackedWatchtower)
                continue;

            bool hasBase = trackedWatchtower.HasBase();
            Construction construction = trackedWatchtower.GetConstruction();

            bool level1BaseBuilt = IsWatchtowerPartBuilt(construction, "level_1_base");
            bool level2BaseBuilt = IsWatchtowerPartBuilt(construction, "level_2_base");
            bool level3BaseBuilt = IsWatchtowerPartBuilt(construction, "level_3_base");
            bool level1StairsBuilt = IsWatchtowerPartBuilt(construction, "level_1_stairs");
            bool level2StairsBuilt = IsWatchtowerPartBuilt(construction, "level_2_stairs");
            bool hasRoof = IsWatchtowerPartBuilt(construction, "roof");

            vector pos = trackedWatchtower.GetPosition();
            vector ori = trackedWatchtower.GetOrientation();

            string posX = pos[0].ToString();
            string posZ = pos[1].ToString();
            string posY = pos[2].ToString();
            string oriX = ori[0].ToString();
            string oriY = ori[1].ToString();
            string oriZ = ori[2].ToString();

            if (watchtowersJson != "")
                watchtowersJson += ",";

            watchtowersJson += "{\"position\":{\"x\":" + posX + ",\"z\":" + posZ + ",\"y\":" + posY + "}";
            watchtowersJson += ",\"orientation\":{\"x\":" + oriX + ",\"y\":" + oriY + ",\"z\":" + oriZ + "}";
            watchtowersJson += ",\"has_base\":" + BoolToJson(hasBase);
            watchtowersJson += ",\"level_1_base\":" + BoolToJson(level1BaseBuilt);
            watchtowersJson += ",\"level_2_base\":" + BoolToJson(level2BaseBuilt);
            watchtowersJson += ",\"level_3_base\":" + BoolToJson(level3BaseBuilt);
            watchtowersJson += ",\"level_1_stairs\":" + BoolToJson(level1StairsBuilt);
            watchtowersJson += ",\"level_2_stairs\":" + BoolToJson(level2StairsBuilt);
            watchtowersJson += ",\"has_roof\":" + BoolToJson(hasRoof);
            watchtowersJson += "}";

            string logMsg = "[WATCHTOWER] Posição=(" + posX + ", " + posZ + ", " + posY + ") | Nível1=" + level1BaseBuilt.ToString() + " | Nível2=" + level2BaseBuilt.ToString() + " | Nível3=" + level3BaseBuilt.ToString() + " | Escadas L1=" + level1StairsBuilt.ToString() + " | Escadas L2=" + level2StairsBuilt.ToString();
            if (hasRoof)
                logMsg += " | Telhado=1";
            WriteToLog(logMsg, LogFile.INIT, false, LogType.INFO);

            count++;
        }
    }

    string jsonAction = "{\"action\":\"watchtowers_positions\",\"watchtower_data\":[" + watchtowersJson + "]}";
    AppendExternalAction(jsonAction);
    WriteToLog("SendWatchtowersStatus(): JSON com " + count.ToString() + " watchtowers enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
}

void InitWatchtowerTracking()
{
    WriteToLog("InitWatchtowerTracking(): Iniciando rastreamento de watchtowers...", LogFile.INIT, false, LogType.INFO);

    array<Object> trackedObjects = new array<Object>();
    GatherWorldObjects(trackedObjects);
    PopulateTrackedWatchtowers(trackedObjects);
}

void ScanWatchtowers()
{
    if (!m_TrackedWatchtowers || m_TrackedWatchtowers.Count() == 0)
        InitWatchtowerTracking();

    CleanTrackedWatchtowers();
    SendWatchtowersStatus();
}