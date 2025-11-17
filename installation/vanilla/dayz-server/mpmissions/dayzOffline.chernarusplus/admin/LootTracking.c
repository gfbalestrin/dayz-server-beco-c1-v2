TStringArray GetContainerTypes()
{
	TStringArray containerTypes = new TStringArray;
	containerTypes.Insert("WoodenCrate");
	containerTypes.Insert("Barrel_Yellow");
	containerTypes.Insert("Barrel_Red");
	containerTypes.Insert("Barrel_Blue");
	containerTypes.Insert("CarTent");
	containerTypes.Insert("LargeTent");
	containerTypes.Insert("MediumTent");
	containerTypes.Insert("PartyTent");
	return containerTypes;
}

bool IsContainerType(string objectType)
{
	if (!objectType || objectType == "")
		return false;

	TStringArray containerTypes = GetContainerTypes();
	foreach (string containerType : containerTypes)
	{
		if (objectType == containerType)
			return true;
	}

	return false;
}

void RegisterContainer(EntityAI newContainer)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!newContainer)
		return;

	string containerType = newContainer.GetType();
	if (!IsContainerType(containerType))
		return;

	if (!m_TrackedContainers)
		m_TrackedContainers = new array<EntityAI>();

	int trackedCount = m_TrackedContainers.Count();
	for (int trackedIndex = 0; trackedIndex < trackedCount; trackedIndex++)
	{
		EntityAI trackedContainer = m_TrackedContainers.Get(trackedIndex);
		if (!trackedContainer)
			continue;

		if (trackedContainer == newContainer)
		{
			WriteToLog("RegisterContainer(): Container já está rastreado, ignorando.", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
	}

	m_TrackedContainers.Insert(newContainer);

	vector containerPosition = newContainer.GetPosition();
	WriteToLog("RegisterContainer(): Container " + containerType + " adicionado em " + containerPosition.ToString(), LogFile.INIT, false, LogType.INFO);
}

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

	foreach (Object candidateObject : worldObjects)
	{
		if (!candidateObject)
			continue;

		string objectType = candidateObject.GetType();

		if (!IsContainerType(objectType))
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

void PopulateTrackedContainers(array<Object> worldObjects)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!m_TrackedContainers)
	{
		WriteToLog("PopulateTrackedContainers(): Inicializando array m_TrackedContainers...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedContainers = new array<EntityAI>();
	}
	else
	{
		WriteToLog("PopulateTrackedContainers(): Array m_TrackedContainers já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedContainers.Clear();
	}

	if (!worldObjects)
	{
		WriteToLog("PopulateTrackedContainers(): Lista de objetos vazia recebida.", LogFile.INIT, false, LogType.WARNING);
		return;
	}

	foreach (Object candidateObject : worldObjects)
	{
		if (!candidateObject)
			continue;

		string objectType = candidateObject.GetType();

		if (!IsContainerType(objectType))
			continue;

		EntityAI candidateContainer = EntityAI.Cast(candidateObject);
		if (!candidateContainer)
			continue;

		m_TrackedContainers.Insert(candidateContainer);
	}

	WriteToLog("PopulateTrackedContainers(): Total de containers em rastreamento: " + m_TrackedContainers.Count().ToString(), LogFile.INIT, false, LogType.INFO);
}

void CleanTrackedContainers()
{
	if (!m_TrackedContainers)
		return;

	int cleanedNull = 0;
	int cleanedDestroyed = 0;
	for (int i = m_TrackedContainers.Count() - 1; i >= 0; i--)
	{
		EntityAI container = m_TrackedContainers.Get(i);
		if (!container)
		{
			m_TrackedContainers.Remove(i);
			cleanedNull++;
			continue;
		}

		float containerHealth = container.GetHealth("", "");
		if (containerHealth <= 0.0)
		{
			string containerType = container.GetType();
			vector containerPosition = container.GetPosition();
			m_TrackedContainers.Remove(i);
			cleanedDestroyed++;
			WriteToLog("CleanTrackedContainers(): Container destruído removido - Tipo: " + containerType + " em " + containerPosition.ToString() + " (health: " + containerHealth.ToString() + ")", LogFile.INIT, false, LogType.INFO);
		}
	}

	if (cleanedNull > 0)
	{
		WriteToLog("CleanTrackedContainers(): " + cleanedNull.ToString() + " containers null removidos", LogFile.INIT, false, LogType.DEBUG);
	}

	if (cleanedDestroyed > 0)
	{
		WriteToLog("CleanTrackedContainers(): " + cleanedDestroyed.ToString() + " containers destruídos removidos", LogFile.INIT, false, LogType.INFO);
	}
}

void CheckContainersForLoot()
{
	if (!m_TrackedContainers || m_TrackedContainers.Count() == 0)
		return;

	string containersJson = "";
	int containersWithItems = 0;
	int containersTotal = 0;
	int totalItems = 0;

	foreach (EntityAI container : m_TrackedContainers)
	{
		if (!container)
			continue;

		containersTotal++;

		string containerType = container.GetType();
		vector containerPosition = container.GetPosition();
		vector containerOrientation = container.GetOrientation();

		string itemsJson = "";
		bool containerHasItems = false;

		CargoBase containerCargo = container.GetInventory().GetCargo();
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

				if (itemsJson != "")
					itemsJson += ",";
				itemsJson += "{\"type\":\"" + cargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
			}
		}

		for (int attachmentIndex = 0; attachmentIndex < container.GetInventory().AttachmentCount(); attachmentIndex++)
		{
			EntityAI attachmentItem = container.GetInventory().GetAttachmentFromIndex(attachmentIndex);
			if (!attachmentItem)
				continue;

			string attachmentType = attachmentItem.GetType();
			float attachmentHealth = attachmentItem.GetHealth("", "");
			totalItems++;
			containerHasItems = true;

			if (itemsJson != "")
				itemsJson += ",";
			itemsJson += "{\"type\":\"" + attachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
		}

		if (containerHasItems)
		{
			containersWithItems++;
		}

		string containerJson = "{\"container_type\":\"" + containerType + "\",\"position\":{\"x\":" + containerPosition[0].ToString() + ",\"z\":" + containerPosition[1].ToString() + ",\"y\":" + containerPosition[2].ToString() + "},\"orientation\":{\"x\":" + containerOrientation[0].ToString() + ",\"y\":" + containerOrientation[1].ToString() + ",\"z\":" + containerOrientation[2].ToString() + "},\"items\":[" + itemsJson + "]}";
		if (containersJson != "")
			containersJson += ",";
		containersJson += containerJson;
	}

	if (containersTotal > 0)
	{
		string jsonAction = "{\"action\":\"containers_positions\",\"container_data\":[" + containersJson + "]}";
		AppendExternalAction(jsonAction);
		WriteToLog("CheckContainersForLoot(): JSON com " + containersTotal.ToString() + " containers (com itens: " + containersWithItems.ToString() + ", vazios: " + (containersTotal - containersWithItems).ToString() + ") e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
	}
}
}