TStringArray GetContainerTypes()
{
	TStringArray containerTypes = new TStringArray;
	containerTypes.Insert("WoodenCrate");
	containerTypes.Insert("Barrel_Yellow");
	containerTypes.Insert("Barrel_Red");
	containerTypes.Insert("Barrel_Blue");
	containerTypes.Insert("Barrel_Green");
	containerTypes.Insert("CarTent");
	containerTypes.Insert("LargeTent");
	containerTypes.Insert("MediumTent");
	containerTypes.Insert("MediumTent_Green");
	containerTypes.Insert("MediumTent_Orange");
	containerTypes.Insert("PartyTent");
	containerTypes.Insert("PartyTent_Blue");
	containerTypes.Insert("PartyTent_Brown");
	containerTypes.Insert("PartyTent_Lunapark");
	containerTypes.Insert("ShelterStick");
	containerTypes.Insert("ShelterFabric");
	containerTypes.Insert("ShelterLeather");
	containerTypes.Insert("SeaChest");
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

EntityAI GetContainerFromUndergroundStash(EntityAI undergroundStash)
{
	if (!undergroundStash)
		return null;
	
	string stashType = undergroundStash.GetType();
	if (stashType != "UndergroundStash")
		return null;
	
	if (!undergroundStash.GetInventory())
		return null;
	
	vector stashPosition = undergroundStash.GetPosition();
	
	CargoBase stashCargo = undergroundStash.GetInventory().GetCargo();
	if (stashCargo)
	{
		for (int cargoIndex = 0; cargoIndex < stashCargo.GetItemCount(); cargoIndex++)
		{
			EntityAI cargoItem = stashCargo.GetItem(cargoIndex);
			if (!cargoItem)
				continue;
			
			string cargoType = cargoItem.GetType();
			if (IsContainerType(cargoType))
			{
				WriteToLog("GetContainerFromUndergroundStash(): Container encontrado dentro do UndergroundStash - Tipo: " + cargoType + " em " + stashPosition.ToString(), LogFile.INIT, false, LogType.INFO);
				return cargoItem;
			}
		}
	}
	
	int attachmentCount = undergroundStash.GetInventory().AttachmentCount();
	for (int attachmentIndex = 0; attachmentIndex < attachmentCount; attachmentIndex++)
	{
		EntityAI attachmentItem = undergroundStash.GetInventory().GetAttachmentFromIndex(attachmentIndex);
		if (!attachmentItem)
			continue;
		
		string attachmentType = attachmentItem.GetType();
		if (IsContainerType(attachmentType))
		{
			WriteToLog("GetContainerFromUndergroundStash(): Container encontrado como attachment no UndergroundStash - Tipo: " + attachmentType + " em " + stashPosition.ToString(), LogFile.INIT, false, LogType.INFO);
			return attachmentItem;
		}
	}
	
	WriteToLog("GetContainerFromUndergroundStash(): Nenhum container encontrado dentro do UndergroundStash em " + stashPosition.ToString(), LogFile.INIT, false, LogType.WARNING);
	return null;
}

bool IsContainerBuried(EntityAI container)
{
	if (!container)
		return false;

	string containerType = container.GetType();
	if (containerType == "UndergroundStash")
	{
		EntityAI innerContainer = GetContainerFromUndergroundStash(container);
		if (innerContainer)
		{
			vector containerPosition = container.GetPosition();
			WriteToLog("IsContainerBuried(): Container enterrado detectado (UndergroundStash contém container) em " + containerPosition.ToString(), LogFile.INIT, false, LogType.INFO);
			return true;
		}
		return false;
	}
	
	return false;
}

bool RegisterContainer(EntityAI newContainer)
{
	if (!GetGame() || !GetGame().IsServer())
		return false;

	if (!newContainer)
		return false;

	string containerType = newContainer.GetType();
	if (!IsContainerType(containerType))
		return false;

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
			return false;
		}
	}

	m_TrackedContainers.Insert(newContainer);

	vector containerPosition = newContainer.GetPosition();
	WriteToLog("RegisterContainer(): Container " + containerType + " adicionado em " + containerPosition.ToString(), LogFile.INIT, false, LogType.INFO);
	return true;
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

		EntityAI containerEntity = null;
		bool isBuried = false;

		if (objectType == "UndergroundStash")
		{
			EntityAI stashEntity = EntityAI.Cast(candidateObject);
			if (stashEntity)
			{
				containerEntity = GetContainerFromUndergroundStash(stashEntity);
				if (!containerEntity)
				{
					WriteToLog("BuildContainersData(): UndergroundStash sem container interno encontrado, ignorando", LogFile.INIT, false, LogType.WARNING);
					continue;
				}
				objectType = containerEntity.GetType();
				isBuried = true;
			}
			else
			{
				continue;
			}
		}
		else if (IsContainerType(objectType))
		{
			containerEntity = EntityAI.Cast(candidateObject);
			if (!containerEntity)
				continue;
		}
		else
		{
			continue;
		}

		totalContainers++;

		vector containerPosition = containerEntity.GetPosition();
		vector containerOrientation = containerEntity.GetOrientation();

		//WriteToLog("Loot container found: " + objectType + " at " + containerPosition.ToString() + " with orientation " + containerOrientation.ToString(), LogFile.INIT, false, LogType.INFO);

		string itemsJson = "";
		bool containerHasItems = false;
		string containerIdentifier = "";

		if (containerEntity)
		{
			int pidLow1 = 0;
			int pidLow2 = 0;
			int pidHigh1 = 0;
			int pidHigh2 = 0;
			containerEntity.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

			bool hasPersistent = false;
			if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
			{
				hasPersistent = true;
			}

			string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
			containerIdentifier = persistentKey;
			if (!hasPersistent)
			{
				containerIdentifier = "pending-" + containerEntity.GetID().ToString();
			}
			
			if (!isBuried)
			{
				isBuried = IsContainerBuried(containerEntity);
			}
			
			if (!containerEntity.GetInventory())
			{
				if (isBuried)
				{
					WriteToLog("BuildContainersData(): Container enterrado sem inventário acessível - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
				}
			}
			else
			{
				CargoBase containerCargo = containerEntity.GetInventory().GetCargo();
				if (!containerCargo)
				{
					if (isBuried)
					{
						WriteToLog("BuildContainersData(): Container enterrado sem Cargo acessível - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
					}
				}
				else
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

						//WriteToLog("Item found: " + cargoType + " with health " + cargoHealth.ToString(), LogFile.INIT, false, LogType.INFO);

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

					//WriteToLog("Attachment found: " + attachmentType + " with health " + attachmentHealth.ToString(), LogFile.INIT, false, LogType.INFO);

					if (itemsJson != "")
						itemsJson += ",";
					itemsJson += "{\"type\":\"" + attachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
				}
			}
		}

		bool isShelterType = objectType.Contains("Shelter");
		
		if (containerHasItems || isShelterType || isBuried)
		{
			if (containerHasItems)
			{
				totalContainersWithItems++;
			}
			else
			{
				totalContainersEmpty++;
			}

			string positionJson = "{\"x\":" + containerPosition[0].ToString() + ",\"z\":" + containerPosition[1].ToString() + ",\"y\":" + containerPosition[2].ToString() + "}";
			string orientationJson = "{\"x\":" + containerOrientation[0].ToString() + ",\"y\":" + containerOrientation[1].ToString() + ",\"z\":" + containerOrientation[2].ToString() + "}";
			string isBuriedStr = isBuried.ToString();
			string containerJson = "{\"container_id\":\"" + containerIdentifier + "\",\"container_type\":\"" + objectType + "\",\"position\":" + positionJson + ",\"orientation\":" + orientationJson + ",\"items\":[" + itemsJson + "],\"is_buried\":" + isBuriedStr + "}";
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
	AppendExternalAction(jsonAction, false);
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

		EntityAI candidateContainer = null;

		if (objectType == "UndergroundStash")
		{
			EntityAI stashEntity = EntityAI.Cast(candidateObject);
			if (stashEntity)
			{
				candidateContainer = GetContainerFromUndergroundStash(stashEntity);
				if (!candidateContainer)
				{
					WriteToLog("PopulateTrackedContainers(): UndergroundStash sem container interno encontrado, ignorando", LogFile.INIT, false, LogType.WARNING);
					continue;
				}
			}
			else
			{
				continue;
			}
		}
		else if (IsContainerType(objectType))
		{
			candidateContainer = EntityAI.Cast(candidateObject);
			if (!candidateContainer)
				continue;
		}
		else
		{
			continue;
		}

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
	int preservedBuried = 0;
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
			bool isBuried = IsContainerBuried(container);
			string containerType = container.GetType();
			vector containerPosition = container.GetPosition();
			
			if (isBuried)
			{
				preservedBuried++;
				WriteToLog("CleanTrackedContainers(): Container enterrado preservado - Tipo: " + containerType + " em " + containerPosition.ToString() + " (health: " + containerHealth.ToString() + ")", LogFile.INIT, false, LogType.INFO);
				continue;
			}
			
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

	if (preservedBuried > 0)
	{
		WriteToLog("CleanTrackedContainers(): " + preservedBuried.ToString() + " containers enterrados preservados (health <= 0 mas ainda válidos)", LogFile.INIT, false, LogType.INFO);
	}
}

bool RegisterContainerAtPosition(vector targetPosition, float searchRadius = 3.0)
{
	if (!GetGame() || !GetGame().IsServer())
		return false;

	if (searchRadius <= 0)
		searchRadius = 3.0;

	array<Object> nearbyObjects = new array<Object>();
	GetGame().GetObjectsAtPosition(targetPosition, searchRadius, nearbyObjects, null);

	if (!nearbyObjects || nearbyObjects.Count() == 0)
	{
		WriteToLog("RegisterContainerAtPosition(): Nenhum objeto encontrado próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
		return false;
	}

	// Coletar todos os containers válidos com suas distâncias
	array<EntityAI> validContainers = new array<EntityAI>();
	array<float> containerDistances = new array<float>();

	foreach (Object candidateObject : nearbyObjects)
	{
		if (!candidateObject)
			continue;

		string objectType = candidateObject.GetType();
		EntityAI candidateContainer = null;

		if (objectType == "UndergroundStash")
		{
			EntityAI stashEntity = EntityAI.Cast(candidateObject);
			if (stashEntity)
			{
				candidateContainer = GetContainerFromUndergroundStash(stashEntity);
				if (!candidateContainer)
					continue;
			}
			else
			{
				continue;
			}
		}
		else if (IsContainerType(objectType))
		{
			candidateContainer = EntityAI.Cast(candidateObject);
			if (!candidateContainer)
				continue;
		}
		else
		{
			continue;
		}

		vector candidatePosition = candidateContainer.GetPosition();
		float candidateDistance = vector.Distance(candidatePosition, targetPosition);
		if (candidateDistance > searchRadius)
			continue;

		validContainers.Insert(candidateContainer);
		containerDistances.Insert(candidateDistance);
	}

	if (validContainers.Count() == 0)
	{
		WriteToLog("RegisterContainerAtPosition(): Nenhum container válido encontrado próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
		return false;
	}

	// Ordenar containers por distância (bubble sort simples)
	int containerCount = validContainers.Count();
	for (int i = 0; i < containerCount - 1; i++)
	{
		for (int j = 0; j < containerCount - i - 1; j++)
		{
			if (containerDistances.Get(j) > containerDistances.Get(j + 1))
			{
				// Trocar distâncias
				float tempDistance = containerDistances.Get(j);
				containerDistances.Set(j, containerDistances.Get(j + 1));
				containerDistances.Set(j + 1, tempDistance);

				// Trocar containers
				EntityAI tempContainer = validContainers.Get(j);
				validContainers.Set(j, validContainers.Get(j + 1));
				validContainers.Set(j + 1, tempContainer);
			}
		}
	}

	// Tentar registrar cada container em ordem de distância até encontrar um que possa ser registrado
	for (int containerIndex = 0; containerIndex < containerCount; containerIndex++)
	{
		EntityAI selectedContainer = validContainers.Get(containerIndex);
		float selectedDistance = containerDistances.Get(containerIndex);

		bool registered = RegisterContainer(selectedContainer);
		if (registered)
		{
			WriteToLog("RegisterContainerAtPosition(): Container registrado a " + selectedDistance.ToString() + "m da posição alvo", LogFile.INIT, false, LogType.INFO);
			return true;
		}
	}

	// Todos os containers já estavam rastreados
	WriteToLog("RegisterContainerAtPosition(): Todos os containers encontrados já estão rastreados próximo a " + targetPosition.ToString() + " (raio=" + searchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
	return false;
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
		int pidLow1 = 0;
		int pidLow2 = 0;
		int pidHigh1 = 0;
		int pidHigh2 = 0;
		container.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

		bool hasPersistent = false;
		if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
		{
			hasPersistent = true;
		}

		string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
		string containerIdentifier = persistentKey;
		if (!hasPersistent)
		{
			containerIdentifier = "pending-" + container.GetID().ToString();
		}

		vector containerPosition = container.GetPosition();
		vector containerOrientation = container.GetOrientation();
		bool isBuried = IsContainerBuried(container);

		string itemsJson = "";
		bool containerHasItems = false;

		if (!container.GetInventory())
		{
			if (isBuried)
			{
				WriteToLog("CheckContainersForLoot(): Container enterrado sem inventário acessível - Container ID: " + containerIdentifier + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
			}
		}
		else
		{
			CargoBase containerCargo = container.GetInventory().GetCargo();
			if (!containerCargo)
			{
				if (isBuried)
				{
					WriteToLog("CheckContainersForLoot(): Container enterrado sem Cargo acessível - Container ID: " + containerIdentifier + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
				}
			}
			else
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
		}

		if (containerHasItems)
		{
			containersWithItems++;
		}

		string positionJson = "{\"x\":" + containerPosition[0].ToString() + ",\"z\":" + containerPosition[1].ToString() + ",\"y\":" + containerPosition[2].ToString() + "}";
		string orientationJson = "{\"x\":" + containerOrientation[0].ToString() + ",\"y\":" + containerOrientation[1].ToString() + ",\"z\":" + containerOrientation[2].ToString() + "}";
		string isBuriedStr = isBuried.ToString();
		string containerJson = "{\"container_id\":\"" + containerIdentifier + "\",\"container_type\":\"" + containerType + "\",\"position\":" + positionJson + ",\"orientation\":" + orientationJson + ",\"items\":[" + itemsJson + "],\"is_buried\":" + isBuriedStr + "}";
		if (containersJson != "")
			containersJson += ",";
		containersJson += containerJson;
	}

	if (containersTotal > 0)
	{
		string jsonAction = "{\"action\":\"containers_positions\",\"container_data\":[" + containersJson + "]}";
		AppendExternalAction(jsonAction, false);
		WriteToLog("CheckContainersForLoot(): JSON com " + containersTotal.ToString() + " containers (com itens: " + containersWithItems.ToString() + ", vazios: " + (containersTotal - containersWithItems).ToString() + ") e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
	}
}

void LogContainersStatusSimple()
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	int startTime = GetGame().GetTime();

	if (!m_TrackedContainers || m_TrackedContainers.Count() == 0)
	{
		WriteToLog("LogContainersStatusSimple(): Nenhum container rastreado no momento.", LogFile.INIT, false, LogType.INFO);
		return;
	}

	int totalContainers = 0;
	int shelterContainers = 0;

	foreach (EntityAI trackedContainer : m_TrackedContainers)
	{
		if (!trackedContainer)
			continue;

		totalContainers++;

		string containerType = trackedContainer.GetType();
		bool isShelter = false;
		if (containerType.Contains("Shelter"))
		{
			isShelter = true;
			shelterContainers++;
		}
	}

	int endTime = GetGame().GetTime();
	int elapsedMs = endTime - startTime;

	WriteToLog("[CONTAINER_SIMPLE] Total=" + totalContainers.ToString() + " Shelters=" + shelterContainers.ToString() + " Tempo=" + elapsedMs.ToString() + "ms", LogFile.INIT, false, LogType.INFO);
}

void SendContainersPositionsSimple()
{
	int startTime = GetGame().GetTime();

	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!m_TrackedContainers || m_TrackedContainers.Count() == 0)
		return;

	string containersJson = "";

	foreach (EntityAI trackedContainer : m_TrackedContainers)
	{
		if (!trackedContainer)
			continue;

		vector position = trackedContainer.GetPosition();
		string containerType = trackedContainer.GetType();

		bool isShelter = false;
		if (containerType.Contains("Shelter"))
		{
			isShelter = true;
		}

		float containerHealth = trackedContainer.GetHealth("", "");
		bool isBuried = IsContainerBuried(trackedContainer);

		int pidLow1 = 0;
		int pidLow2 = 0;
		int pidHigh1 = 0;
		int pidHigh2 = 0;
		trackedContainer.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

		bool hasPersistent = false;
		if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
		{
			hasPersistent = true;
		}

		string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
		string containerIdentifier = persistentKey;
		if (!hasPersistent)
		{
			containerIdentifier = "pending-" + trackedContainer.GetID().ToString();
		}

		string safeType = containerType;
		TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
		foreach (string unsafeChar : unsafeChars)
		{
			safeType.Replace(unsafeChar, "-");
		}

		string posXStr = position[0].ToString();
		string posZStr = position[1].ToString();
		string posYStr = position[2].ToString();
		string healthStr = containerHealth.ToString();
		string isShelterStr = isShelter.ToString();
		string isBuriedStr = isBuried.ToString();

		string containerJson = "{\"container_id\":\"" + containerIdentifier + "\",\"container_type\":\"" + safeType + "\",\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr;
		containerJson += ",\"health\":" + healthStr;
		containerJson += ",\"is_shelter\":" + isShelterStr;
		containerJson += ",\"is_buried\":" + isBuriedStr;
		containerJson += ",\"items\":[]";
		containerJson += ",\"update_type\":\"position_only\"}";

		if (containersJson != "")
			containersJson += ",";
		
		containersJson += containerJson;
	}

	string jsonAction = "{\"action\":\"containers_positions\",\"containers\":[" + containersJson + "],\"update_type\":\"position_only\"}";
	AppendExternalAction(jsonAction, false);
	
	int endTime = GetGame().GetTime();
	int elapsedMs = endTime - startTime;
	WriteToLog("SendContainersPositionsSimple(): Posições simplificadas de " + m_TrackedContainers.Count().ToString() + " containers enviadas via ExternalAction - Tempo=" + elapsedMs.ToString() + "ms", LogFile.INIT, false, LogType.DEBUG);
}