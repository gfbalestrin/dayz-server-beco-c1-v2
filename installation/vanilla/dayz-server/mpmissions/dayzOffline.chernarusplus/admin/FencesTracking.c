
void ScanFences()
{
    WriteToLog("ScanFences(): Iniciando scan de fences", LogFile.INIT, false, LogType.INFO);
    array<Object> objects = new array<Object>;
    GetGame().GetObjectsAtPosition(Vector(0,0,0), 99999, objects, NULL);

    int count = 0;
    string fencesJson = "";

    foreach (Object obj : objects)
    {
        Fence fence = Fence.Cast(obj);
		if (!fence)
			continue;

		bool hasBase = fence.HasBase();
		if (!hasBase)
			continue;

		Construction construction = fence.GetConstruction();
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

		count++;
		vector pos = fence.GetPosition();
		vector ori = fence.GetOrientation();

		string openState;
		if (fence.IsOpened())
			openState = "Aberto";
		else
			openState = "Fechado";

		bool hasGate = fence.HasFullyConstructedGate();

		string gateState;
		if (hasGate)
			gateState = "Sim";
		else
			gateState = "Não";

		bool isLocked = fence.IsLocked();
		string lockedState;
		if (isLocked)
			lockedState = "Sim";
		else
			lockedState = "Não";

		// Coleta anexos (ex: camonet, arame farpado, cadeado)
		TStringArray attachments = new TStringArray;
		string attachmentsJson = "";
		if (fence.GetInventory())
		{
			for (int i = 0; i < fence.GetInventory().AttachmentCount(); i++)
			{
				EntityAI att = fence.GetInventory().GetAttachmentFromIndex(i);
				if (att)
				{
					string attType = att.GetType();
					attachments.Insert(attType);
					
					// Monta JSON de attachments
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

		// Monta JSON do fence
		if (fencesJson != "")
			fencesJson += ",";
		string posX = pos[0].ToString();
		string posZ = pos[1].ToString();
		string posY = pos[2].ToString();
		string oriX = ori[0].ToString();
		string oriY = ori[1].ToString();
		string oriZ = ori[2].ToString();
		string hasGateStr = hasGate.ToString();
		string isOpenedStr = fence.IsOpened().ToString();
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
    }

    // Envia JSON via ExternalAction
    string jsonAction = "{\"action\":\"fences_positions\",\"fence_data\":[" + fencesJson + "]}";
    AppendExternalAction(jsonAction);
    WriteToLog("ScanFences(): JSON com " + count.ToString() + " fences enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);

    string summary = "[FENCE SCAN] Total de estruturas (Fence) encontradas: " + count.ToString();
    Print(summary);
    WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
}