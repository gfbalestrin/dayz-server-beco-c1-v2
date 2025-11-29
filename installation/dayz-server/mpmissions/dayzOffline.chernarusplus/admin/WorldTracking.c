void GatherWorldObjects(array<Object> destination)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!destination)
		return;

	destination.Clear();

	vector trackingCenter = "7500 0 7500";
	float trackingRadius = 25000;

	GetGame().GetObjectsAtPosition(trackingCenter, trackingRadius, destination, null);
}

void ProcessAllWorldObjectsOptimized(array<Object> worldObjects, out string containersJson, out int totalContainers, out int totalContainersWithItems, out int totalContainersEmpty, out int totalItems, out int totalContainersBuried)
{
	containersJson = "";
	totalContainers = 0;
	totalContainersWithItems = 0;
	totalContainersEmpty = 0;
	totalItems = 0;
	totalContainersBuried = 0;

	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!worldObjects || worldObjects.Count() == 0)
		return;

	// Inicializar arrays de tracking
	if (!m_TrackedFences)
		m_TrackedFences = new array<Fence>();
	else
		m_TrackedFences.Clear();

	if (!m_TrackedWatchtowers)
		m_TrackedWatchtowers = new array<Watchtower>();
	else
		m_TrackedWatchtowers.Clear();

	if (!m_TrackedFlags)
		m_TrackedFlags = new array<Object>();
	else
		m_TrackedFlags.Clear();

	if (!m_TrackedVehicles)
		m_TrackedVehicles = new array<CarScript>();
	else
		m_TrackedVehicles.Clear();

	if (!m_TrackedContainers)
		m_TrackedContainers = new array<EntityAI>();
	else
		m_TrackedContainers.Clear();

	// Array temporário para containers JSON (otimização de concatenação)
	array<string> containersJsonArray = new array<string>();

	// Processar todos os objetos em uma única iteração
	foreach (Object candidateObject : worldObjects)
	{
		if (!candidateObject)
			continue;

		string objectType = candidateObject.GetType();
		if (!objectType || objectType == "")
			continue;

		// Processar Fences
		if (objectType.Contains("Fence"))
		{
			Fence candidateFence = Fence.Cast(candidateObject);
			if (candidateFence && candidateFence.HasBase())
			{
				m_TrackedFences.Insert(candidateFence);
			}
			continue;
		}

		// Processar Watchtowers
		if (objectType.Contains("Watchtower"))
		{
			Watchtower candidateWatchtower = Watchtower.Cast(candidateObject);
			if (candidateWatchtower && candidateWatchtower.HasBase())
			{
				m_TrackedWatchtowers.Insert(candidateWatchtower);
			}
			continue;
		}

		// Processar Flags
		if (objectType == "TerritoryFlag")
		{
			m_TrackedFlags.Insert(candidateObject);
			continue;
		}

		// Processar Vehicles (tentar Cast direto, mais eficiente)
		CarScript candidateVehicle = CarScript.Cast(candidateObject);
		if (candidateVehicle)
		{
			m_TrackedVehicles.Insert(candidateVehicle);
			continue;
		}

		// Processar Containers (mais complexo, precisa processar items também)
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
					WriteToLog("ProcessAllWorldObjectsOptimized(): UndergroundStash sem container interno encontrado, ignorando", LogFile.INIT, false, LogType.WARNING);
					continue;
				}
				objectType = containerEntity.GetType();
				isBuried = true;
				totalContainersBuried++;
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

		m_TrackedContainers.Insert(containerEntity);

		vector containerPosition = containerEntity.GetPosition();
		vector containerOrientation = containerEntity.GetOrientation();

		string itemsJson = "";
		bool containerHasItems = false;
		string containerIdentifier = "";

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

		// Processar items do container
		if (!isBuried)
		{
			isBuried = IsContainerBuried(containerEntity);
			if (isBuried)
			{
				totalContainersBuried++;
			}
		}
		
		if (!containerEntity.GetInventory())
		{
			if (isBuried)
			{
				WriteToLog("ProcessAllWorldObjectsOptimized(): Container enterrado sem inventário acessível - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
			}
			else
			{
				WriteToLog("ProcessAllWorldObjectsOptimized(): Container sem inventário acessível - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.WARNING);
			}
		}
		else
		{
			CargoBase containerCargo = containerEntity.GetInventory().GetCargo();
			if (!containerCargo)
			{
				if (isBuried)
				{
					WriteToLog("ProcessAllWorldObjectsOptimized(): Container enterrado sem Cargo acessível - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.DEBUG);
				}
			}
			else
			{
				int cargoItemCount = containerCargo.GetItemCount();
				if (isBuried && cargoItemCount > 0)
				{
					WriteToLog("ProcessAllWorldObjectsOptimized(): Container enterrado com " + cargoItemCount.ToString() + " itens no cargo - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.INFO);
				}
				
				for (int cargoIndex = 0; cargoIndex < cargoItemCount; cargoIndex++)
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

			// Processar attachments do container
			int attachmentCount = containerEntity.GetInventory().AttachmentCount();
			if (isBuried && attachmentCount > 0)
			{
				WriteToLog("ProcessAllWorldObjectsOptimized(): Container enterrado com " + attachmentCount.ToString() + " attachments - Tipo: " + objectType + " em " + containerPosition.ToString(), LogFile.INIT, false, LogType.INFO);
			}
			
			for (int attachmentIndex = 0; attachmentIndex < attachmentCount; attachmentIndex++)
			{
				EntityAI attachmentItem = containerEntity.GetInventory().GetAttachmentFromIndex(attachmentIndex);
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
			string containerJsonItem = "{\"container_id\":\"" + containerIdentifier + "\",\"container_type\":\"" + objectType + "\",\"position\":" + positionJson + ",\"orientation\":" + orientationJson + ",\"items\":[" + itemsJson + "],\"is_buried\":" + isBuriedStr + "}";
			containersJsonArray.Insert(containerJsonItem);
		}
		else
		{
			totalContainersEmpty++;
		}
	}

	// Construir JSON final de containers (otimização: join ao invés de concatenação)
	if (containersJsonArray.Count() > 0)
	{
		containersJson = string.Join(",", containersJsonArray);
	}

	WriteToLog("ProcessAllWorldObjectsOptimized(): Fences: " + m_TrackedFences.Count().ToString() + ", Watchtowers: " + m_TrackedWatchtowers.Count().ToString() + ", Flags: " + m_TrackedFlags.Count().ToString() + ", Vehicles: " + m_TrackedVehicles.Count().ToString() + ", Containers: " + m_TrackedContainers.Count().ToString() + " (enterrados: " + totalContainersBuried.ToString() + ")", LogFile.INIT, false, LogType.INFO);
}

void InitWorldTracking()
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	WriteToLog("InitWorldTracking(): Iniciando varredura otimizada única para fences, watchtowers, flags, veículos e containers...", LogFile.INIT, false, LogType.INFO);

	array<Object> worldObjects = new array<Object>();
	GatherWorldObjects(worldObjects);

	if (!worldObjects || worldObjects.Count() == 0)
	{
		WriteToLog("InitWorldTracking(): Nenhum objeto encontrado durante a varredura.", LogFile.INIT, false, LogType.WARNING);
		return;
	}

	// Processar todos os objetos em uma única iteração otimizada
	string containersJson;
	int totalContainers;
	int totalContainersWithItems;
	int totalContainersEmpty;
	int totalItems;
	int totalContainersBuried;
	ProcessAllWorldObjectsOptimized(worldObjects, containersJson, totalContainers, totalContainersWithItems, totalContainersEmpty, totalItems, totalContainersBuried);

	CleanTrackedFences();
	CleanTrackedWatchtowers();
	CleanTrackedFlags();
	CleanTrackedVehicles();

	SendFencesStatus();
	SendWatchtowersStatus();
	SendFlagsStatus();
	SendVehiclesPositions();

	string payloadContainers = containersJson;
	if (payloadContainers == "")
		payloadContainers = "";

	string containersAction = "{\"action\":\"containers_positions\",\"container_data\":[" + payloadContainers + "]}";
	AppendExternalAction(containersAction, false);
	WriteToLog("InitWorldTracking(): JSON com " + totalContainersWithItems.ToString() + " containers com itens e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);

	string summary = string.Format("InitWorldTracking(): Containers totais: %1 (com itens: %2, vazios: %3, enterrados: %4, itens: %5)", totalContainers, totalContainersWithItems, totalContainersEmpty, totalContainersBuried, totalItems);
	WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
}

