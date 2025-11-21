
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

bool IsFlagPartBuilt(Object flagObject, string partName)
{
    if (!flagObject || partName == "")
        return false;

    BaseBuildingBase buildingBase = BaseBuildingBase.Cast(flagObject);
    if (!buildingBase)
        return false;

    Construction construction = buildingBase.GetConstruction();
    if (!construction)
        return false;

    ConstructionPart flagPart = construction.GetConstructionPart(partName);
    if (!flagPart)
        return false;

    return flagPart.IsBuilt();
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

bool RegisterWatchtowerAtPosition(vector targetPosition, float searchRadius = 10.0)
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

            // Verificar partes das paredes para cada nível
            bool level1Wall1LowerBuilt = false;
            bool level1Wall1UpperBuilt = false;
            bool level1Wall2LowerBuilt = false;
            bool level1Wall2UpperBuilt = false;
            bool level1Wall3LowerBuilt = false;
            bool level1Wall3UpperBuilt = false;

            bool level2Wall1LowerBuilt = false;
            bool level2Wall1UpperBuilt = false;
            bool level2Wall2LowerBuilt = false;
            bool level2Wall2UpperBuilt = false;
            bool level2Wall3LowerBuilt = false;
            bool level2Wall3UpperBuilt = false;

            bool level3Wall1LowerBuilt = false;
            bool level3Wall1UpperBuilt = false;
            bool level3Wall2LowerBuilt = false;
            bool level3Wall2UpperBuilt = false;
            bool level3Wall3LowerBuilt = false;
            bool level3Wall3UpperBuilt = false;

            if (construction)
            {
                string partName;
                ConstructionPart part;
                
                // Nível 1 - Parede 1
                array<string> level1Wall1LowerParts = { "level_1_wall_1_down", "level_1_wall_1_wood_down", "level_1_wall_1_metal_down" };
                foreach (partName : level1Wall1LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall1LowerBuilt = true;
                        break;
                    }
                }
                array<string> level1Wall1UpperParts = { "level_1_wall_1_up", "level_1_wall_1_wood_up", "level_1_wall_1_metal_up" };
                foreach (partName : level1Wall1UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall1UpperBuilt = true;
                        break;
                    }
                }

                // Nível 1 - Parede 2
                array<string> level1Wall2LowerParts = { "level_1_wall_2_down", "level_1_wall_2_wood_down", "level_1_wall_2_metal_down" };
                foreach (partName : level1Wall2LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall2LowerBuilt = true;
                        break;
                    }
                }
                array<string> level1Wall2UpperParts = { "level_1_wall_2_up", "level_1_wall_2_wood_up", "level_1_wall_2_metal_up" };
                foreach (partName : level1Wall2UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall2UpperBuilt = true;
                        break;
                    }
                }

                // Nível 1 - Parede 3
                array<string> level1Wall3LowerParts = { "level_1_wall_3_down", "level_1_wall_3_wood_down", "level_1_wall_3_metal_down" };
                foreach (partName : level1Wall3LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall3LowerBuilt = true;
                        break;
                    }
                }
                array<string> level1Wall3UpperParts = { "level_1_wall_3_up", "level_1_wall_3_wood_up", "level_1_wall_3_metal_up" };
                foreach (partName : level1Wall3UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level1Wall3UpperBuilt = true;
                        break;
                    }
                }

                // Nível 2 - Parede 1
                array<string> level2Wall1LowerParts = { "level_2_wall_1_down", "level_2_wall_1_wood_down", "level_2_wall_1_metal_down" };
                foreach (partName : level2Wall1LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall1LowerBuilt = true;
                        break;
                    }
                }
                array<string> level2Wall1UpperParts = { "level_2_wall_1_up", "level_2_wall_1_wood_up", "level_2_wall_1_metal_up" };
                foreach (partName : level2Wall1UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall1UpperBuilt = true;
                        break;
                    }
                }

                // Nível 2 - Parede 2
                array<string> level2Wall2LowerParts = { "level_2_wall_2_down", "level_2_wall_2_wood_down", "level_2_wall_2_metal_down" };
                foreach (partName : level2Wall2LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall2LowerBuilt = true;
                        break;
                    }
                }
                array<string> level2Wall2UpperParts = { "level_2_wall_2_up", "level_2_wall_2_wood_up", "level_2_wall_2_metal_up" };
                foreach (partName : level2Wall2UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall2UpperBuilt = true;
                        break;
                    }
                }

                // Nível 2 - Parede 3
                array<string> level2Wall3LowerParts = { "level_2_wall_3_down", "level_2_wall_3_wood_down", "level_2_wall_3_metal_down" };
                foreach (partName : level2Wall3LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall3LowerBuilt = true;
                        break;
                    }
                }
                array<string> level2Wall3UpperParts = { "level_2_wall_3_up", "level_2_wall_3_wood_up", "level_2_wall_3_metal_up" };
                foreach (partName : level2Wall3UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level2Wall3UpperBuilt = true;
                        break;
                    }
                }

                // Nível 3 - Parede 1
                array<string> level3Wall1LowerParts = { "level_3_wall_1_down", "level_3_wall_1_wood_down", "level_3_wall_1_metal_down" };
                foreach (partName : level3Wall1LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall1LowerBuilt = true;
                        break;
                    }
                }
                array<string> level3Wall1UpperParts = { "level_3_wall_1_up", "level_3_wall_1_wood_up", "level_3_wall_1_metal_up" };
                foreach (partName : level3Wall1UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall1UpperBuilt = true;
                        break;
                    }
                }

                // Nível 3 - Parede 2
                array<string> level3Wall2LowerParts = { "level_3_wall_2_down", "level_3_wall_2_wood_down", "level_3_wall_2_metal_down" };
                foreach (partName : level3Wall2LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall2LowerBuilt = true;
                        break;
                    }
                }
                array<string> level3Wall2UpperParts = { "level_3_wall_2_up", "level_3_wall_2_wood_up", "level_3_wall_2_metal_up" };
                foreach (partName : level3Wall2UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall2UpperBuilt = true;
                        break;
                    }
                }

                // Nível 3 - Parede 3
                array<string> level3Wall3LowerParts = { "level_3_wall_3_down", "level_3_wall_3_wood_down", "level_3_wall_3_metal_down" };
                foreach (partName : level3Wall3LowerParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall3LowerBuilt = true;
                        break;
                    }
                }
                array<string> level3Wall3UpperParts = { "level_3_wall_3_up", "level_3_wall_3_wood_up", "level_3_wall_3_metal_up" };
                foreach (partName : level3Wall3UpperParts)
                {
                    part = construction.GetConstructionPart(partName);
                    if (part && part.IsBuilt())
                    {
                        level3Wall3UpperBuilt = true;
                        break;
                    }
                }
            }

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
            watchtowersJson += ",\"level_1_wall_1_lower_built\":" + BoolToJson(level1Wall1LowerBuilt);
            watchtowersJson += ",\"level_1_wall_1_upper_built\":" + BoolToJson(level1Wall1UpperBuilt);
            watchtowersJson += ",\"level_1_wall_2_lower_built\":" + BoolToJson(level1Wall2LowerBuilt);
            watchtowersJson += ",\"level_1_wall_2_upper_built\":" + BoolToJson(level1Wall2UpperBuilt);
            watchtowersJson += ",\"level_1_wall_3_lower_built\":" + BoolToJson(level1Wall3LowerBuilt);
            watchtowersJson += ",\"level_1_wall_3_upper_built\":" + BoolToJson(level1Wall3UpperBuilt);
            watchtowersJson += ",\"level_2_wall_1_lower_built\":" + BoolToJson(level2Wall1LowerBuilt);
            watchtowersJson += ",\"level_2_wall_1_upper_built\":" + BoolToJson(level2Wall1UpperBuilt);
            watchtowersJson += ",\"level_2_wall_2_lower_built\":" + BoolToJson(level2Wall2LowerBuilt);
            watchtowersJson += ",\"level_2_wall_2_upper_built\":" + BoolToJson(level2Wall2UpperBuilt);
            watchtowersJson += ",\"level_2_wall_3_lower_built\":" + BoolToJson(level2Wall3LowerBuilt);
            watchtowersJson += ",\"level_2_wall_3_upper_built\":" + BoolToJson(level2Wall3UpperBuilt);
            watchtowersJson += ",\"level_3_wall_1_lower_built\":" + BoolToJson(level3Wall1LowerBuilt);
            watchtowersJson += ",\"level_3_wall_1_upper_built\":" + BoolToJson(level3Wall1UpperBuilt);
            watchtowersJson += ",\"level_3_wall_2_lower_built\":" + BoolToJson(level3Wall2LowerBuilt);
            watchtowersJson += ",\"level_3_wall_2_upper_built\":" + BoolToJson(level3Wall2UpperBuilt);
            watchtowersJson += ",\"level_3_wall_3_lower_built\":" + BoolToJson(level3Wall3LowerBuilt);
            watchtowersJson += ",\"level_3_wall_3_upper_built\":" + BoolToJson(level3Wall3UpperBuilt);
            watchtowersJson += "}";

            string logMsg = "[WATCHTOWER] Posição=(" + posX + ", " + posZ + ", " + posY + ") | Nível1=" + level1BaseBuilt.ToString() + " | Nível2=" + level2BaseBuilt.ToString() + " | Nível3=" + level3BaseBuilt.ToString() + " | Escadas L1=" + level1StairsBuilt.ToString() + " | Escadas L2=" + level2StairsBuilt.ToString();
            if (hasRoof)
                logMsg += " | Telhado=1";
            logMsg += " | L1 Paredes: W1(" + level1Wall1LowerBuilt.ToString() + "/" + level1Wall1UpperBuilt.ToString() + ") W2(" + level1Wall2LowerBuilt.ToString() + "/" + level1Wall2UpperBuilt.ToString() + ") W3(" + level1Wall3LowerBuilt.ToString() + "/" + level1Wall3UpperBuilt.ToString() + ")";
            logMsg += " | L2 Paredes: W1(" + level2Wall1LowerBuilt.ToString() + "/" + level2Wall1UpperBuilt.ToString() + ") W2(" + level2Wall2LowerBuilt.ToString() + "/" + level2Wall2UpperBuilt.ToString() + ") W3(" + level2Wall3LowerBuilt.ToString() + "/" + level2Wall3UpperBuilt.ToString() + ")";
            logMsg += " | L3 Paredes: W1(" + level3Wall1LowerBuilt.ToString() + "/" + level3Wall1UpperBuilt.ToString() + ") W2(" + level3Wall2LowerBuilt.ToString() + "/" + level3Wall2UpperBuilt.ToString() + ") W3(" + level3Wall3LowerBuilt.ToString() + "/" + level3Wall3UpperBuilt.ToString() + ")";
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

void PopulateTrackedFlags(array<Object> worldObjects)
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    if (!m_TrackedFlags)
    {
        WriteToLog("PopulateTrackedFlags(): Inicializando array m_TrackedFlags...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedFlags = new array<Object>();
    }
    else
    {
        WriteToLog("PopulateTrackedFlags(): Array m_TrackedFlags já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedFlags.Clear();
    }

    if (!worldObjects)
    {
        WriteToLog("PopulateTrackedFlags(): Lista de objetos vazia recebida.", LogFile.INIT, false, LogType.WARNING);
        return;
    }

    foreach (Object candidateObject : worldObjects)
    {
        if (!candidateObject)
            continue;

        string objectType = candidateObject.GetType();
        if (objectType != "TerritoryFlag")
            continue;

        m_TrackedFlags.Insert(candidateObject);
    }

    WriteToLog("PopulateTrackedFlags(): Total de flags em rastreamento: " + m_TrackedFlags.Count().ToString(), LogFile.INIT, false, LogType.INFO);
}

void RegisterFlag(Object newFlag)
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    if (!newFlag)
        return;

    string objectType = newFlag.GetType();
    if (objectType != "TerritoryFlag")
    {
        WriteToLog("RegisterFlag(): Objeto não é TerritoryFlag. Tipo: " + objectType, LogFile.INIT, false, LogType.WARNING);
        return;
    }

    if (!m_TrackedFlags)
        m_TrackedFlags = new array<Object>();

    int trackedCount = m_TrackedFlags.Count();
    for (int trackedIndex = 0; trackedIndex < trackedCount; trackedIndex++)
    {
        Object trackedFlag = m_TrackedFlags.Get(trackedIndex);
        if (!trackedFlag)
            continue;

        if (trackedFlag == newFlag)
        {
            WriteToLog("RegisterFlag(): Flag já está rastreada, ignorando.", LogFile.INIT, false, LogType.DEBUG);
            return;
        }
    }

    m_TrackedFlags.Insert(newFlag);

    vector flagPosition = newFlag.GetPosition();
    vector flagOrientation = newFlag.GetOrientation();
    WriteToLog("RegisterFlag(): Flag adicionada em " + flagPosition.ToString() + " orientação " + flagOrientation.ToString(), LogFile.INIT, false, LogType.INFO);
}

bool RegisterFlagAtPosition(vector targetPosition, float searchRadius = 10.0)
{
    if (!GetGame() || !GetGame().IsServer())
        return false;

    if (searchRadius <= 0)
        searchRadius = 10.0;

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(targetPosition, searchRadius, nearbyObjects, null);

    if (!nearbyObjects || nearbyObjects.Count() == 0)
    {
        WriteToLog("RegisterFlagAtPosition(): Nenhum objeto encontrado próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    WriteToLog("RegisterFlagAtPosition(): DEBUG - Total de objetos encontrados: " + nearbyObjects.Count().ToString() + " na posição " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.DEBUG);

    Object closestFlag;
    float closestDistance = searchRadius + 1.0;
    int flagCount = 0;
    int objectIndex = 0;

    foreach (Object candidateObject : nearbyObjects)
    {
        if (!candidateObject)
        {
            objectIndex++;
            continue;
        }

        string objectType = candidateObject.GetType();
        
        if (objectType != "TerritoryFlag")
        {
            WriteToLog("RegisterFlagAtPosition(): DEBUG - Objeto #" + objectIndex.ToString() + " não é TerritoryFlag. Tipo: " + objectType, LogFile.INIT, false, LogType.DEBUG);
            objectIndex++;
            continue;
        }

        flagCount++;
        vector candidatePosition = candidateObject.GetPosition();
        float candidateDistance = vector.Distance(candidatePosition, targetPosition);
        
        WriteToLog("RegisterFlagAtPosition(): DEBUG - Flag encontrada #" + flagCount.ToString() + " tipo: " + objectType + " posição: " + candidatePosition.ToString() + " distância: " + candidateDistance.ToString() + "m", LogFile.INIT, false, LogType.DEBUG);
        
        if (candidateDistance > searchRadius)
        {
            WriteToLog("RegisterFlagAtPosition(): DEBUG - Flag #" + flagCount.ToString() + " fora do raio (distância: " + candidateDistance.ToString() + "m > raio: " + searchRadius.ToString() + "m)", LogFile.INIT, false, LogType.DEBUG);
            objectIndex++;
            continue;
        }

        if (!closestFlag || candidateDistance < closestDistance)
        {
            closestFlag = candidateObject;
            closestDistance = candidateDistance;
            WriteToLog("RegisterFlagAtPosition(): DEBUG - Nova flag mais próxima selecionada (distância: " + closestDistance.ToString() + "m)", LogFile.INIT, false, LogType.DEBUG);
        }
        
        objectIndex++;
    }

    WriteToLog("RegisterFlagAtPosition(): DEBUG - Total de flags encontradas: " + flagCount.ToString(), LogFile.INIT, false, LogType.DEBUG);

    if (!closestFlag)
    {
        WriteToLog("RegisterFlagAtPosition(): Nenhuma flag válida encontrada próxima a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + "). Total de objetos: " + nearbyObjects.Count().ToString() + ", Total de flags: " + flagCount.ToString(), LogFile.INIT, false, LogType.WARNING);
        return false;
    }

    RegisterFlag(closestFlag);

    WriteToLog("RegisterFlagAtPosition(): Flag registrada a " + closestDistance.ToString() + "m da posição alvo", LogFile.INIT, false, LogType.INFO);
    return true;
}

void CleanTrackedFlags()
{
    if (!m_TrackedFlags)
        return;

    int removedCount = 0;
    for (int i = m_TrackedFlags.Count() - 1; i >= 0; i--)
    {
        Object trackedFlag = m_TrackedFlags.Get(i);
        if (!trackedFlag)
        {
            m_TrackedFlags.Remove(i);
            removedCount++;
            continue;
        }

        string objectType = trackedFlag.GetType();
        if (objectType != "TerritoryFlag")
        {
            m_TrackedFlags.Remove(i);
            removedCount++;
            continue;
        }
    }

    if (removedCount > 0)
    {
        WriteToLog("CleanTrackedFlags(): " + removedCount.ToString() + " flags inválidas removidas do rastreamento", LogFile.INIT, false, LogType.DEBUG);
    }
}

void SendFlagsStatus()
{
    int count = 0;
    string flagsJson = "";

    if (m_TrackedFlags)
    {
        foreach (Object trackedFlag : m_TrackedFlags)
        {
            if (!trackedFlag)
                continue;

            string objectType = trackedFlag.GetType();
            if (objectType != "TerritoryFlag")
                continue;

            BaseBuildingBase buildingBase = BaseBuildingBase.Cast(trackedFlag);
            bool hasBase = false;
            bool hasFlagBase = false;
            bool flagRaised = false;
            float flagHeight = 0.0;

            if (buildingBase)
            {
                hasBase = buildingBase.HasBase();

                if (buildingBase.GetInventory())
                {
                    for (int i = 0; i < buildingBase.GetInventory().AttachmentCount(); i++)
                    {
                        EntityAI attachment = buildingBase.GetInventory().GetAttachmentFromIndex(i);
                        if (attachment)
                        {
                            string attachmentType = attachment.GetType();
                            if (attachmentType.IndexOf("Flag_") == 0)
                            {
                                hasFlagBase = true;
                                flagRaised = true;

                                vector flagBasePos = attachment.GetPosition();
                                vector flagPolePos = trackedFlag.GetPosition();
                                flagHeight = Math.AbsFloat(flagBasePos[1] - flagPolePos[1]);
                                break;
                            }
                        }
                    }
                }
            }

            vector pos = trackedFlag.GetPosition();
            vector ori = trackedFlag.GetOrientation();

            string posX = pos[0].ToString();
            string posZ = pos[1].ToString();
            string posY = pos[2].ToString();
            string oriX = ori[0].ToString();
            string oriY = ori[1].ToString();
            string oriZ = ori[2].ToString();
            string flagHeightStr = flagHeight.ToString();

            if (flagsJson != "")
                flagsJson += ",";

            flagsJson += "{\"position\":{\"x\":" + posX + ",\"z\":" + posZ + ",\"y\":" + posY + "}";
            flagsJson += ",\"orientation\":{\"x\":" + oriX + ",\"y\":" + oriY + ",\"z\":" + oriZ + "}";
            flagsJson += ",\"has_base\":" + BoolToJson(hasBase);
            flagsJson += ",\"has_flag_base\":" + BoolToJson(hasFlagBase);
            flagsJson += ",\"flag_raised\":" + BoolToJson(flagRaised);
            flagsJson += ",\"flag_height\":" + flagHeightStr;
            flagsJson += "}";

            string logMsg = "[FLAG] Posição=(" + posX + ", " + posZ + ", " + posY + ") | HasBase=" + hasBase.ToString() + " | HasFlagBase=" + hasFlagBase.ToString() + " | FlagRaised=" + flagRaised.ToString() + " | FlagHeight=" + flagHeightStr;
            WriteToLog(logMsg, LogFile.INIT, false, LogType.INFO);

            count++;
        }
    }

    string jsonAction = "{\"action\":\"flags_positions\",\"flag_data\":[" + flagsJson + "]}";
    AppendExternalAction(jsonAction);
    WriteToLog("SendFlagsStatus(): JSON com " + count.ToString() + " flags enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
}

void InitFlagTracking()
{
    WriteToLog("InitFlagTracking(): Iniciando rastreamento de flags...", LogFile.INIT, false, LogType.INFO);

    array<Object> trackedObjects = new array<Object>();
    GatherWorldObjects(trackedObjects);
    PopulateTrackedFlags(trackedObjects);
}

void ScanFlags()
{
    if (!m_TrackedFlags || m_TrackedFlags.Count() == 0)
        InitFlagTracking();

    CleanTrackedFlags();
    SendFlagsStatus();
}