void BuildContainersData(array<Object> worldObjects, out string containersJson, out int totalContainers, out int totalContainersWithItems, out int totalContainersEmpty, out int totalItems)
{
	containersJson = "";
	totalContainers = 0;
	totalContainersWithItems = 0;
	totalContainersEmpty = 0;
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

			//WriteToLog("Loot container found: " + objectType + " at " + containerPosition.ToString() + " with orientation " + containerOrientation.ToString(), LogFile.INIT, false, LogType.INFO);

			string itemsJson = "";
			bool containerHasItems = false;

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
						containerHasItems = true;

						WriteToLog("Item found: " + cargoType + " with health " + cargoHealth.ToString(), LogFile.INIT, false, LogType.INFO);

						if (itemsJson != "")
							itemsJson += ",";
						itemsJson += "{\"type\":\"" + cargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
					}
				} 

				for (int attachmentIndex = 0; attachmentIndex < containerEntity.GetInventory().AttachmentCount(); attachmentIndex++)
				{
					EntityAI attachmentItem = containerEntity.GetInventory().GetAttachmentFromIndex(attachmentIndex);
					if (!attachmentItem)
						continue;

					string attachmentType = attachmentItem.GetType();
					float attachmentHealth = attachmentItem.GetHealth("", "");
					totalItems++;
					containerHasItems = true;

					WriteToLog("Attachment found: " + attachmentType + " with health " + attachmentHealth.ToString(), LogFile.INIT, false, LogType.INFO);

					if (itemsJson != "")
						itemsJson += ",";
					itemsJson += "{\"type\":\"" + attachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
				}
			}

			if (containerHasItems)
			{
				totalContainersWithItems++;
				string containerJson = "{\"container_type\":\"" + objectType + "\",\"position\":{\"x\":" + containerPosition[0].ToString() + ",\"z\":" + containerPosition[1].ToString() + ",\"y\":" + containerPosition[2].ToString() + "},\"orientation\":{\"x\":" + containerOrientation[0].ToString() + ",\"y\":" + containerOrientation[1].ToString() + ",\"z\":" + containerOrientation[2].ToString() + "},\"items\":[" + itemsJson + "]}";
				if (containersJson != "")
					containersJson += ",";
				containersJson += containerJson;
			}
			else
			{
				totalContainersEmpty++;
			}

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
	int totalContainersWithItems;
	int totalContainersEmpty;
	int totalItems;
	BuildContainersData(trackedObjects, containersJson, totalContainers, totalContainersWithItems, totalContainersEmpty, totalItems);

	string payloadContainers = containersJson;
	if (payloadContainers == "")
		payloadContainers = "";

	string jsonAction = "{\"action\":\"containers_positions\",\"container_data\":[" + payloadContainers + "]}";
	AppendExternalAction(jsonAction);
	WriteToLog("LogLootContainersDetailed(): JSON com " + totalContainersWithItems.ToString() + " containers com itens e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);

	string summary = string.Format("[LOOT SCAN] Containers: %1 (com itens: %2, vazios: %3, itens: %4)", totalContainers, totalContainersWithItems, totalContainersEmpty, totalItems);
	Print(summary);
	WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
}