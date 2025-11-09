void BuildContainersData(array<Object> worldObjects, out string containersJson, out int totalContainers, out int totalItems)
{
	containersJson = "";
	totalContainers = 0;
	totalItems = 0;

	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!worldObjects)
		return;

	TStringArray lootTypes = new TStringArray;
	lootTypes.Insert("WoodenCrate");
	lootTypes.Insert("Barrel_Yellow");
	lootTypes.Insert("Barrel_Red");
	lootTypes.Insert("Barrel_Blue");
	lootTypes.Insert("CarTent");
	lootTypes.Insert("LargeTent");
	lootTypes.Insert("MediumTent");
	lootTypes.Insert("PartyTent");

	foreach (Object candidateObject : worldObjects)
	{
		if (!candidateObject)
			continue;

		string objectType = candidateObject.GetType();

		foreach (string lootType : lootTypes)
		{
			if (objectType != lootType)
				continue;

			totalContainers++;

			vector containerPosition = candidateObject.GetPosition();
			vector containerOrientation = candidateObject.GetOrientation();

			WriteToLog("Loot container found: " + objectType + " at " + containerPosition.ToString() + " with orientation " + containerOrientation.ToString(), LogFile.INIT, false, LogType.INFO);

			string containerJson = "";
			string itemsJson = "";

			EntityAI containerEntity = EntityAI.Cast(candidateObject);
			if (containerEntity)
			{
                CargoBase containerCargo = containerEntity.GetInventory().GetCargo();
				if (containerCargo)
				{
					for (int cargoIndex = 0; cargoIndex < containerCargo.GetItemCount(); cargoIndex++)
					{
						EntityAI cargoItem = containerCargo.GetItem(cargoIndex);
						if (!cargoItem)
							continue;

						string cargoType = cargoItem.GetType();
						float cargoHealth = cargoItem.GetHealth("", "");
						totalItems++;

						WriteToLog("Item found: " + cargoType + " with health " + cargoHealth.ToString(), LogFile.INIT, false, LogType.INFO);

						if (itemsJson != "")
							itemsJson += ",";
						itemsJson += "{\"type\":\"" + cargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
					}
				} else {
                    continue;
                }

				for (int attachmentIndex = 0; attachmentIndex < containerEntity.GetInventory().AttachmentCount(); attachmentIndex++)
				{
					EntityAI attachmentItem = containerEntity.GetInventory().GetAttachmentFromIndex(attachmentIndex);
					if (!attachmentItem)
						continue;

					string attachmentType = attachmentItem.GetType();
					float attachmentHealth = attachmentItem.GetHealth("", "");
					totalItems++;

					WriteToLog("Attachment found: " + attachmentType + " with health " + attachmentHealth.ToString(), LogFile.INIT, false, LogType.INFO);

					if (itemsJson != "")
						itemsJson += ",";
					itemsJson += "{\"type\":\"" + attachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
				}
			}

			containerJson = "{\"container_type\":\"" + objectType + "\",\"position\":{\"x\":" + containerPosition[0].ToString() + ",\"z\":" + containerPosition[1].ToString() + ",\"y\":" + containerPosition[2].ToString() + "},\"orientation\":{\"x\":" + containerOrientation[0].ToString() + ",\"y\":" + containerOrientation[1].ToString() + ",\"z\":" + containerOrientation[2].ToString() + "},\"items\":[" + itemsJson + "]}";

			if (containersJson != "")
				containersJson += ",";
			containersJson += containerJson;

			break;
		}
	}
}

void LogLootContainersDetailed()
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	array<Object> trackedObjects = new array<Object>();
	GatherWorldObjects(trackedObjects);

	string containersJson;
	int totalContainers;
	int totalItems;
	BuildContainersData(trackedObjects, containersJson, totalContainers, totalItems);

	if (containersJson != "")
	{
		string jsonAction = "{\"action\":\"containers_positions\",\"container_data\":[" + containersJson + "]}";
		AppendExternalAction(jsonAction);
		WriteToLog("LogLootContainersDetailed(): JSON com " + totalContainers.ToString() + " containers e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
	}

	string summary = string.Format("[LOOT SCAN] Containers: %1 ", totalContainers);
	Print(summary);
	WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
}