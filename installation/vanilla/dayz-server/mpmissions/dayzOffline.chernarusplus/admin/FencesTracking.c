
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