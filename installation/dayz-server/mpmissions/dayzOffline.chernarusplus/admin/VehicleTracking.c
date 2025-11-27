// ============================================================================
// FUNÇÕES DE TRACKING DE VEÍCULOS
// ============================================================================

ref map<string, bool> m_VehicleMissingZonesLogged;

void LogMissingVehicleZone(string vehicleType, string zoneName)
{
	if (!m_VehicleMissingZonesLogged)
		m_VehicleMissingZonesLogged = new map<string, bool>();

	string key = vehicleType + "::" + zoneName;
	if (m_VehicleMissingZonesLogged.Contains(key))
		return;

	m_VehicleMissingZonesLogged.Insert(key, true);
	WriteToLog("VehicleTracking(): Zona de dano \"" + zoneName + "\" não encontrada para o tipo " + vehicleType + ", omitindo dados de saúde no JSON.", LogFile.INIT, false, LogType.DEBUG);
}

bool TryGetVehicleZoneHealth(CarScript vehicle, string zoneName, out float outHealth)
{
	outHealth = 0.0;

	if (!vehicle || zoneName == "")
		return false;

	if (!GetGame())
		return false;

	string vehicleType = vehicle.GetType();
	string configPath = "CfgVehicles " + vehicleType + " DamageSystem DamageZones " + zoneName;

	if (!GetGame().ConfigIsExisting(configPath))
	{
		LogMissingVehicleZone(vehicleType, zoneName);
		return false;
	}

	outHealth = vehicle.GetHealth01(zoneName, "");
	return true;
}

string BuildVehicleHealthPartsJson(CarScript vehicle)
{
	string healthPartsJson = "";
	float zoneHealth = 0.0;

	if (TryGetVehicleZoneHealth(vehicle, "Engine", zoneHealth))
	{
		healthPartsJson = "\"engine\":" + zoneHealth.ToString();
	}

	if (TryGetVehicleZoneHealth(vehicle, "Body", zoneHealth))
	{
		if (healthPartsJson != "")
			healthPartsJson += ",";

		healthPartsJson += "\"body\":" + zoneHealth.ToString();
	}

	if (TryGetVehicleZoneHealth(vehicle, "FuelTank", zoneHealth))
	{
		if (healthPartsJson != "")
			healthPartsJson += ",";

		healthPartsJson += "\"fuel_tank\":" + zoneHealth.ToString();
	}

	return healthPartsJson;
}

bool IsVehicle(EntityAI entity)
{
	if (!entity)
		return false;

	CarScript vehicle = CarScript.Cast(entity);
	return vehicle != null;
}

void RegisterVehicle(EntityAI newVehicle)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!newVehicle)
		return;

	if (!IsVehicle(newVehicle))
		return;

	CarScript vehicleScript = CarScript.Cast(newVehicle);
	if (!vehicleScript)
		return;

	if (!m_TrackedVehicles)
		m_TrackedVehicles = new array<CarScript>();

	int trackedCount = m_TrackedVehicles.Count();
	for (int trackedIndex = 0; trackedIndex < trackedCount; trackedIndex++)
	{
		CarScript trackedVehicle = m_TrackedVehicles.Get(trackedIndex);
		if (!trackedVehicle)
			continue;

		if (trackedVehicle == vehicleScript)
		{
			WriteToLog("RegisterVehicle(): Veículo já está rastreado, ignorando.", LogFile.INIT, false, LogType.DEBUG);
			return;
		}
	}

	m_TrackedVehicles.Insert(vehicleScript);

	vector vehiclePosition = vehicleScript.GetPosition();
	string vehicleName = vehicleScript.GetDisplayName();
	WriteToLog("RegisterVehicle(): Veículo " + vehicleName + " adicionado em " + vehiclePosition.ToString(), LogFile.INIT, false, LogType.INFO);
}

// Inicializa o rastreamento de veículos
void PopulateTrackedVehicles(array<Object> worldObjects)
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!m_TrackedVehicles)
	{
		WriteToLog("PopulateTrackedVehicles(): Inicializando array m_TrackedVehicles...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedVehicles = new array<CarScript>();
	}
	else
	{
		WriteToLog("PopulateTrackedVehicles(): Array m_TrackedVehicles já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
		m_TrackedVehicles.Clear();
	}

	if (!worldObjects)
	{
		WriteToLog("PopulateTrackedVehicles(): Lista de objetos vazia recebida.", LogFile.INIT, false, LogType.WARNING);
		return;
	}

	foreach (Object candidateObject : worldObjects)
	{
		CarScript candidateVehicle = CarScript.Cast(candidateObject);
		if (!candidateVehicle)
			continue;

		m_TrackedVehicles.Insert(candidateVehicle);
	}

	WriteToLog("PopulateTrackedVehicles(): Total de veículos em rastreamento: " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
}

void InitVehicleTracking()
{
	WriteToLog("Iniciando rastreamento de veículos...", LogFile.INIT, false, LogType.DEBUG);

	array<Object> trackedObjects = new array<Object>();
	GatherWorldObjects(trackedObjects);
	PopulateTrackedVehicles(trackedObjects);
}

// Limpa veículos null do array de rastreamento
void CleanTrackedVehicles()
{
    if (!m_TrackedVehicles)
        return;
        
    int cleanedNull = 0;
    int cleanedDestroyed = 0;
    for (int i = m_TrackedVehicles.Count() - 1; i >= 0; i--)
    {
        CarScript vehicle = m_TrackedVehicles.Get(i);
        if (!vehicle)
        {
            m_TrackedVehicles.Remove(i);
            cleanedNull++;
            continue;
        }

        // Verificar se veículo está destruído usando múltiplos métodos
        bool isDestroyed = false;
        float vehicleHealth = vehicle.GetHealth("", "");
        bool isDamageDestroyed = vehicle.IsDamageDestroyed();
        
        float engineHealth = 0.0;
        bool hasEngineHealth = TryGetVehicleZoneHealth(vehicle, "Engine", engineHealth);
        
        // Considerar destruído se: health geral <= 0, IsDamageDestroyed() retorna true, ou motor health <= 0
        if (vehicleHealth <= 0.0 || isDamageDestroyed || (hasEngineHealth && engineHealth <= 0.0))
        {
            isDestroyed = true;
        }
        
        if (isDestroyed)
        {
            string vehicleName = vehicle.GetDisplayName();
            vector vehiclePosition = vehicle.GetPosition();
            m_TrackedVehicles.Remove(i);
            cleanedDestroyed++;
            string destroyReason = "";
            if (vehicleHealth <= 0.0)
            {
                destroyReason = "health geral: " + vehicleHealth.ToString();
            }
            else if (isDamageDestroyed)
            {
                destroyReason = "IsDamageDestroyed() = true";
            }
            else if (hasEngineHealth && engineHealth <= 0.0)
            {
                destroyReason = "motor health: " + engineHealth.ToString();
            }
            WriteToLog("CleanTrackedVehicles(): Veículo destruído removido - Nome: " + vehicleName + " em " + vehiclePosition.ToString() + " (" + destroyReason + ")", LogFile.INIT, false, LogType.INFO);
        }
    }
    
    if (cleanedNull > 0)
    {
        WriteToLog("CleanTrackedVehicles(): " + cleanedNull.ToString() + " veículos null removidos", LogFile.INIT, false, LogType.DEBUG);
    }

    if (cleanedDestroyed > 0)
    {
        WriteToLog("CleanTrackedVehicles(): " + cleanedDestroyed.ToString() + " veículos destruídos removidos", LogFile.INIT, false, LogType.INFO);
    }
}	

// Envia posições de todos os veículos rastreados via ExternalAction
void SendVehiclesPositions()
{
    if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
        return;

    string vehiclesJson = "";

    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        if (!vehicle)
            continue;

        vector position = vehicle.GetPosition();
        string vehicleName = vehicle.GetDisplayName();
        float vehicleLifetime = vehicle.GetLifetime();
        float vehicleLifetimeMax = vehicle.GetLifetimeMax();

        int pidLow1 = 0;
        int pidLow2 = 0;
        int pidHigh1 = 0;
        int pidHigh2 = 0;
        vehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

        bool hasPersistent = false;
        if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
        {
            hasPersistent = true;
        }

        string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
        string vehicleIdentifier = persistentKey;
        if (!hasPersistent)
        {
            vehicleIdentifier = "pending-" + vehicle.GetID().ToString();
        }

        // Sanitiza o nome do veículo
        string safeName = vehicleName;
        TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
        foreach (string unsafeChar : unsafeChars)
        {
            safeName.Replace(unsafeChar, "-");
        }

        string itemsJson = "";
        string attachmentsJson = "";

        if (vehicle && vehicle.GetInventory())
        {
            // Coletar itens do cargo
            CargoBase vehicleCargo = vehicle.GetInventory().GetCargo();
            if (vehicleCargo)
            {
                for (int cargoIndex = 0; cargoIndex < vehicleCargo.GetItemCount(); cargoIndex++)
                {
                    EntityAI cargoItem = vehicleCargo.GetItem(cargoIndex);
                    if (!cargoItem)
                       	continue;

                    string cargoType = cargoItem.GetType();
                    float cargoHealth = cargoItem.GetHealth("", "");

                    string safeCargoType = cargoType;
                    foreach (string unsafeChar2 : unsafeChars)
                    {
                        safeCargoType.Replace(unsafeChar2, "-");
                    }

                    if (itemsJson != "")
                        itemsJson += ",";
                    itemsJson += "{\"type\":\"" + safeCargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
                }
            }
			
			int AttachmentCount = vehicle.GetInventory().AttachmentCount();

            // Coletar attachments (partes do veículo)
            for (int attachmentIndex = 0; attachmentIndex < AttachmentCount; attachmentIndex++)
            {
                EntityAI attachmentItem = vehicle.GetInventory().GetAttachmentFromIndex(attachmentIndex);
                if (!attachmentItem)
                    continue;

                string attachmentType = attachmentItem.GetType();
                float attachmentHealth = attachmentItem.GetHealth("", "");

                string safeAttachmentType = attachmentType;
                foreach (string unsafeChar3 : unsafeChars)
                {
                    safeAttachmentType.Replace(unsafeChar3, "-");
                }

                if (attachmentsJson != "")
                    attachmentsJson += ",";
                attachmentsJson += "{\"type\":\"" + safeAttachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
            }
        }

        // Coletar saúde de partes principais (omitindo zonas ausentes)
        string healthPartsJson = BuildVehicleHealthPartsJson(vehicle);
        
        string posXStr = position[0].ToString();
        string posZStr = position[1].ToString();
        string posYStr = position[2].ToString();
        string vehicleJsonPart1 = "{\"vehicle_id\":\"" + vehicleIdentifier + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr;
        string vehicleJsonPart2 = ",\"items\":[" + itemsJson + "],\"attachments\":[" + attachmentsJson + "],\"health_parts\":{" + healthPartsJson + "},\"lifetime\":" + vehicleLifetime.ToString() + ",\"lifetime_max\":" + vehicleLifetimeMax.ToString() + "}";
        string vehicleJson = vehicleJsonPart1 + vehicleJsonPart2;
        
        if (vehiclesJson != "")
            vehiclesJson += ",";
        
        vehiclesJson += vehicleJson;

        //WriteToLog("[LIFETIME] VehicleId=" + vehicleIdentifier + " (" + safeName + ") attachments=" + AttachmentCount.ToString() + " lifetime=" + vehicleLifetime.ToString() + " lifetime_max=" + vehicleLifetimeMax.ToString(), LogFile.INIT, false, LogType.DEBUG);
    }

    string jsonAction = "{\"action\":\"vehicles_positions\",\"vehicles\":[" + vehiclesJson + "]}";
    AppendExternalAction(jsonAction, false);
    
    WriteToLog("SendVehiclesPositions(): Posições de " + m_TrackedVehicles.Count().ToString() + " veículos enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
}

void SendVehiclesPositionsSimple()
{
	int startTime = GetGame().GetTime();

    if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
        return;

    string vehiclesJson = "";

    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        if (!vehicle)
            continue;

        vector position = vehicle.GetPosition();
        string vehicleName = vehicle.GetDisplayName();

        int pidLow1 = 0;
        int pidLow2 = 0;
        int pidHigh1 = 0;
        int pidHigh2 = 0;
        vehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

        bool hasPersistent = false;
        if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
        {
            hasPersistent = true;
        }

        string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
        string vehicleIdentifier = persistentKey;
        if (!hasPersistent)
        {
            vehicleIdentifier = "pending-" + vehicle.GetID().ToString();
        }

        // Sanitiza o nome do veículo
        string safeName = vehicleName;
        TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
        foreach (string unsafeChar : unsafeChars)
        {
            safeName.Replace(unsafeChar, "-");
        }

        string posXStr = position[0].ToString();
        string posZStr = position[1].ToString();
        string posYStr = position[2].ToString();
        
        // Coletar saúde de partes principais (omitindo zonas ausentes)
        string healthPartsJson = BuildVehicleHealthPartsJson(vehicle);
        
        // JSON simplificado com flag de update parcial (incluindo health_parts)
        string vehicleJson = "{\"vehicle_id\":\"" + vehicleIdentifier + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr + ",\"health_parts\":{" + healthPartsJson + "},\"update_type\":\"position_only\"}";
        
        if (vehiclesJson != "")
            vehiclesJson += ",";
        
        vehiclesJson += vehicleJson;
    }

    string jsonAction = "{\"action\":\"vehicles_positions\",\"vehicles\":[" + vehiclesJson + "],\"update_type\":\"position_only\"}";
    AppendExternalAction(jsonAction, false);
    
	int endTime = GetGame().GetTime();
	int elapsedMs = endTime - startTime;
    WriteToLog("SendVehiclesPositionsSimple(): Posições simplificadas de " + m_TrackedVehicles.Count().ToString() + " veículos enviadas via ExternalAction - Tempo=" + elapsedMs.ToString() + "ms", LogFile.INIT, false, LogType.DEBUG);
}

void LogVehiclesPositionsSimple()
{
    if (!GetGame() || !GetGame().IsServer())
        return;

    int startTime = GetGame().GetTime();

    if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
    {
        WriteToLog("LogVehiclesPositionsSimple(): Nenhum veículo em m_TrackedVehicles. Execute PopulateTrackedVehicles antes do teste.", LogFile.INIT, false, LogType.WARNING);
        return;
    }

    int loggedVehicles = 0;
    int activeVehicles = 0;
    int destroyedVehicles = 0;

    foreach (CarScript candidateVehicle : m_TrackedVehicles)
    {
        if (!candidateVehicle)
            continue;

        loggedVehicles++;

        float vehicleHealth = candidateVehicle.GetHealth("", "");
        bool isDestroyed = (vehicleHealth <= 0.0 || candidateVehicle.IsDamageDestroyed());

        if (isDestroyed)
            destroyedVehicles++;
        else
            activeVehicles++;
    }

    int endTime = GetGame().GetTime();
    int elapsedMs = endTime - startTime;

    WriteToLog("[VEHICLE_SIMPLE] Total=" + loggedVehicles.ToString() + " Ativos=" + activeVehicles.ToString() + " Destruidos=" + destroyedVehicles.ToString() + " Tempo=" + elapsedMs.ToString() + "ms", LogFile.INIT, false, LogType.INFO);
}

void CheckVehiclesForLoot()
{
	if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
		return;

	string vehiclesJson = "";
	int vehiclesWithItems = 0;
	int vehiclesTotal = 0;
	int totalItems = 0;

	foreach (CarScript vehicle : m_TrackedVehicles)
	{
		if (!vehicle)
			continue;

		vehiclesTotal++;

        vector vehiclePosition = vehicle.GetPosition();
        string vehicleName = vehicle.GetDisplayName();
        float vehicleLifetime = vehicle.GetLifetime();
        float vehicleLifetimeMax = vehicle.GetLifetimeMax();

		int pidLow1 = 0;
		int pidLow2 = 0;
		int pidHigh1 = 0;
		int pidHigh2 = 0;
		vehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

		bool hasPersistent = false;
		if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
		{
			hasPersistent = true;
		}

		string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
		string vehicleIdentifier = persistentKey;
		if (!hasPersistent)
		{
			vehicleIdentifier = "pending-" + vehicle.GetID().ToString();
		}

		// Sanitiza o nome do veículo
		string safeName = vehicleName;
		TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
		foreach (string unsafeChar : unsafeChars)
		{
			safeName.Replace(unsafeChar, "-");
		}

		string itemsJson = "";
		string attachmentsJson = "";
		bool vehicleHasItems = false;

		if (vehicle && vehicle.GetInventory())
		{
			// Coletar itens do cargo
			CargoBase vehicleCargo = vehicle.GetInventory().GetCargo();
			if (vehicleCargo)
			{
				for (int cargoIndex = 0; cargoIndex < vehicleCargo.GetItemCount(); cargoIndex++)
				{
					EntityAI cargoItem = vehicleCargo.GetItem(cargoIndex);
					if (!cargoItem)
						continue;

					string cargoType = cargoItem.GetType();
					float cargoHealth = cargoItem.GetHealth("", "");
					totalItems++;
					vehicleHasItems = true;

					string safeCargoType = cargoType;
					foreach (string unsafeChar2 : unsafeChars)
					{
						safeCargoType.Replace(unsafeChar2, "-");
					}

					if (itemsJson != "")
						itemsJson += ",";
					itemsJson += "{\"type\":\"" + safeCargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
				}
			}

			// Coletar attachments (partes do veículo)
			for (int attachmentIndex = 0; attachmentIndex < vehicle.GetInventory().AttachmentCount(); attachmentIndex++)
			{
				EntityAI attachmentItem = vehicle.GetInventory().GetAttachmentFromIndex(attachmentIndex);
				if (!attachmentItem)
					continue;

				string attachmentType = attachmentItem.GetType();
				float attachmentHealth = attachmentItem.GetHealth("", "");

				string safeAttachmentType = attachmentType;
				foreach (string unsafeChar3 : unsafeChars)
				{
					safeAttachmentType.Replace(unsafeChar3, "-");
				}

				if (attachmentsJson != "")
					attachmentsJson += ",";
				attachmentsJson += "{\"type\":\"" + safeAttachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
			}
		}

		// Coletar saúde de partes principais (omitindo zonas ausentes)
		string healthPartsJson = BuildVehicleHealthPartsJson(vehicle);

		if (vehicleHasItems)
		{
			vehiclesWithItems++;
		}

		string posXStr = vehiclePosition[0].ToString();
		string posZStr = vehiclePosition[1].ToString();
		string posYStr = vehiclePosition[2].ToString();
		string vehicleJsonPart1 = "{\"vehicle_id\":\"" + vehicleIdentifier + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr;
        string vehicleJsonPart2 = ",\"items\":[" + itemsJson + "],\"attachments\":[" + attachmentsJson + "],\"health_parts\":{" + healthPartsJson + "},\"lifetime\":" + vehicleLifetime.ToString() + ",\"lifetime_max\":" + vehicleLifetimeMax.ToString() + "}";
		string vehicleJson = vehicleJsonPart1 + vehicleJsonPart2;
		
		if (vehiclesJson != "")
			vehiclesJson += ",";
		vehiclesJson += vehicleJson;

        //WriteToLog("[LIFETIME] VehicleId=" + vehicleIdentifier + " (" + safeName + ") lifetime=" + vehicleLifetime.ToString() + " lifetime_max=" + vehicleLifetimeMax.ToString(), LogFile.INIT, false, LogType.DEBUG);
	}

	if (vehiclesTotal > 0)
	{
		string jsonAction = "{\"action\":\"vehicles_positions\",\"vehicles\":[" + vehiclesJson + "]}";
		AppendExternalAction(jsonAction, false);
		WriteToLog("CheckVehiclesForLoot(): JSON com " + vehiclesTotal.ToString() + " veículos (com itens: " + vehiclesWithItems.ToString() + ", vazios: " + (vehiclesTotal - vehiclesWithItems).ToString() + ") e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
	}
}

void LogAllVehicles()
{
    WriteToLog("Iniciando varredura de veículos no mundo...", LogFile.INIT, false, LogType.DEBUG);	

    vector center = "7500 0 7500"; // Centro aproximado do mapa Chernarus
    float radius = 20000; // Varre praticamente o mapa todo

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(center, radius, nearbyObjects, null);

    int count = 0;

    foreach (Object obj : nearbyObjects)
    {
        if (!obj)
            continue;

        CarScript vehicle = CarScript.Cast(obj);
        if (vehicle)
        {
            vector pos = vehicle.GetPosition();
            string name = vehicle.GetDisplayName();
            WriteToLog("[VEÍCULO] " + name + " em " + pos.ToString(), LogFile.INIT, false, LogType.DEBUG);
            count++;
        }
    }

    WriteToLog("Total de veículos detectados: " + count.ToString(), LogFile.INIT, false, LogType.DEBUG);
}


void TrackVehiclePositions()
{
    // Verifica se o array foi inicializado
    if (!m_TrackedVehicles)
    {
        WriteToLog("[TRACKING] Array m_TrackedVehicles não foi inicializado ainda, ignorando rastreamento...", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    WriteToLog("[TRACKING] Atualização de posições dos veículos... " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);

    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        //if (vehicle && vehicle.IsAlive())
        if (vehicle)
        {
            vector pos = vehicle.GetPosition();
            WriteToLog("[POSIÇÃO] " + vehicle.GetDisplayName() + " em " + pos.ToString(), LogFile.INIT, false, LogType.DEBUG);
        }
        else
        {
            WriteToLog("[REMOVER] Veículo inválido ou destruído.", LogFile.INIT, false, LogType.DEBUG);
        }
    }
}

void BuildVehiclesData(array<Object> worldObjects, out string vehiclesJson, out int totalVehicles, out int totalVehiclesWithItems, out int totalItems)
{
	vehiclesJson = "";
	totalVehicles = 0;
	totalVehiclesWithItems = 0;
	totalItems = 0;

	if (!GetGame() || !GetGame().IsServer())
		return;

	if (!worldObjects)
		return;

	foreach (Object candidateObject : worldObjects)
	{
		if (!candidateObject)
			continue;

		CarScript candidateVehicle = CarScript.Cast(candidateObject);
		if (!candidateVehicle)
			continue;

		totalVehicles++;

        vector vehiclePosition = candidateVehicle.GetPosition();
        string vehicleName = candidateVehicle.GetDisplayName();
        float candidateLifetime = candidateVehicle.GetLifetime();
        float candidateLifetimeMax = candidateVehicle.GetLifetimeMax();

		int pidLow1 = 0;
		int pidLow2 = 0;
		int pidHigh1 = 0;
		int pidHigh2 = 0;
		candidateVehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);

		bool hasPersistent = false;
		if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
		{
			hasPersistent = true;
		}

		string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
		string vehicleIdentifier = persistentKey;
		if (!hasPersistent)
		{
			vehicleIdentifier = "pending-" + candidateVehicle.GetID().ToString();
		}

		// Sanitiza o nome do veículo
		string safeName = vehicleName;
		TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
		foreach (string unsafeChar : unsafeChars)
		{
			safeName.Replace(unsafeChar, "-");
		}

		string itemsJson = "";
		string attachmentsJson = "";
		bool vehicleHasItems = false;
		int vehicleItemsCount = 0;

		if (candidateVehicle && candidateVehicle.GetInventory())
		{
			// Coletar itens do cargo
			CargoBase vehicleCargo = candidateVehicle.GetInventory().GetCargo();
			if (vehicleCargo)
			{
				for (int cargoIndex = 0; cargoIndex < vehicleCargo.GetItemCount(); cargoIndex++)
				{
					EntityAI cargoItem = vehicleCargo.GetItem(cargoIndex);
					if (!cargoItem)
						continue;

					string cargoType = cargoItem.GetType();
					float cargoHealth = cargoItem.GetHealth("", "");
					vehicleItemsCount++;
					totalItems++;
					vehicleHasItems = true;

					string safeCargoType = cargoType;
					foreach (string unsafeChar2 : unsafeChars)
					{
						safeCargoType.Replace(unsafeChar2, "-");
					}

					if (itemsJson != "")
						itemsJson += ",";
					itemsJson += "{\"type\":\"" + safeCargoType + "\",\"health\":" + cargoHealth.ToString() + "}";
				}
			}

			// Coletar attachments (partes do veículo)
			for (int attachmentIndex = 0; attachmentIndex < candidateVehicle.GetInventory().AttachmentCount(); attachmentIndex++)
			{
				EntityAI attachmentItem = candidateVehicle.GetInventory().GetAttachmentFromIndex(attachmentIndex);
				if (!attachmentItem)
					continue;

				string attachmentType = attachmentItem.GetType();
				float attachmentHealth = attachmentItem.GetHealth("", "");

				string safeAttachmentType = attachmentType;
				foreach (string unsafeChar3 : unsafeChars)
				{
					safeAttachmentType.Replace(unsafeChar3, "-");
				}

				if (attachmentsJson != "")
					attachmentsJson += ",";
				attachmentsJson += "{\"type\":\"" + safeAttachmentType + "\",\"health\":" + attachmentHealth.ToString() + "}";
			}
		}

		// Coletar saúde de partes principais (omitindo zonas ausentes)
		string healthPartsJson = BuildVehicleHealthPartsJson(candidateVehicle);

		if (vehicleHasItems)
		{
			totalVehiclesWithItems++;
		}

		string posXStr = vehiclePosition[0].ToString();
		string posZStr = vehiclePosition[1].ToString();
		string posYStr = vehiclePosition[2].ToString();
		string vehicleJsonPart1 = "{\"vehicle_id\":\"" + vehicleIdentifier + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr;
        string vehicleJsonPart2 = ",\"items\":[" + itemsJson + "],\"attachments\":[" + attachmentsJson + "],\"health_parts\":{" + healthPartsJson + "},\"lifetime\":" + candidateLifetime.ToString() + ",\"lifetime_max\":" + candidateLifetimeMax.ToString() + "}";
		string vehicleJson = vehicleJsonPart1 + vehicleJsonPart2;
		
		if (vehiclesJson != "")
			vehiclesJson += ",";
		vehiclesJson += vehicleJson;

        //WriteToLog("[LIFETIME] VehicleId=" + vehicleIdentifier + " (" + safeName + ") lifetime=" + candidateLifetime.ToString() + " lifetime_max=" + candidateLifetimeMax.ToString(), LogFile.INIT, false, LogType.DEBUG);
	}
}