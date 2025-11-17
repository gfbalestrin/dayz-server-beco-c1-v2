// ============================================================================
// FUNÇÕES DE TRACKING DE VEÍCULOS
// ============================================================================

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

        float vehicleHealth = vehicle.GetHealth("", "");
        if (vehicleHealth <= 0.0)
        {
            string vehicleName = vehicle.GetDisplayName();
            vector vehiclePosition = vehicle.GetPosition();
            m_TrackedVehicles.Remove(i);
            cleanedDestroyed++;
            WriteToLog("CleanTrackedVehicles(): Veículo destruído removido - Nome: " + vehicleName + " em " + vehiclePosition.ToString() + " (health: " + vehicleHealth.ToString() + ")", LogFile.INIT, false, LogType.INFO);
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
        foreach (string ch : unsafeChars)
        {
            safeName.Replace(ch, "-");
        }
        
        if (vehiclesJson != "")
            vehiclesJson += ",";
        
        vehiclesJson += "{\"vehicle_id\":\"" + vehicleIdentifier + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + position[0].ToString() + ",\"z\":" + position[1].ToString() + ",\"y\":" + position[2].ToString() + "}";
    }

    string jsonAction = "{\"action\":\"vehicles_positions\",\"vehicles\":[" + vehiclesJson + "]}";
    AppendExternalAction(jsonAction, false);
    
    WriteToLog("SendVehiclesPositions(): Posições de " + m_TrackedVehicles.Count().ToString() + " veículos enviadas via ExternalAction", LogFile.INIT, false, LogType.DEBUG);
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
}