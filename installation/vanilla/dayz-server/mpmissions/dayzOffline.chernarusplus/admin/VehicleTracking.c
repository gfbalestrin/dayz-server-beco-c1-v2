// ============================================================================
// FUNÇÕES DE TRACKING DE VEÍCULOS
// ============================================================================

// Inicializa o rastreamento de veículos
void InitVehicleTracking()
{
    WriteToLog("Iniciando rastreamento de veículos...", LogFile.INIT, false, LogType.DEBUG);

    // Garante que o array seja inicializado
    if (!m_TrackedVehicles)
    {
        WriteToLog("Inicializando array m_TrackedVehicles...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedVehicles = new array<CarScript>();
    }
    else
    {
        WriteToLog("Array m_TrackedVehicles já existe, limpando conteúdo...", LogFile.INIT, false, LogType.DEBUG);
        m_TrackedVehicles.Clear();
    }

    vector center = "7500 0 7500";
    float radius = 20000;

    array<Object> nearbyObjects = new array<Object>();
    GetGame().GetObjectsAtPosition(center, radius, nearbyObjects, null);

    foreach (Object obj : nearbyObjects)
    {
        CarScript vehicle = CarScript.Cast(obj);
        if (vehicle)
        {
            m_TrackedVehicles.Insert(vehicle);
            //WriteToLog("[TRACKING] Veículo adicionado: " + vehicle.GetDisplayName(), LogFile.INIT, false, LogType.DEBUG);
        }
    }

    WriteToLog("Total de veículos em rastreamento: " + m_TrackedVehicles.Count().ToString(), LogFile.INIT, false, LogType.DEBUG);
}

// Limpa veículos null do array de rastreamento
void CleanTrackedVehicles()
{
    if (!m_TrackedVehicles)
        return;
        
    int cleaned = 0;
    for (int i = m_TrackedVehicles.Count() - 1; i >= 0; i--)
    {
        if (!m_TrackedVehicles.Get(i))
        {
            m_TrackedVehicles.Remove(i);
            cleaned++;
        }
    }
    
    if (cleaned > 0)
    {
        WriteToLog("CleanTrackedVehicles(): " + cleaned.ToString() + " veículos null removidos", LogFile.INIT, false, LogType.DEBUG);
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
        int vehicleId = vehicle.GetID();
        
        // Sanitiza o nome do veículo
        string safeName = vehicleName;
        TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
        foreach (string ch : unsafeChars)
        {
            safeName.Replace(ch, "-");
        }
        
        if (vehiclesJson != "")
            vehiclesJson += ",";
        
        vehiclesJson += "{\"vehicle_id\":\"" + vehicleId.ToString() + "\",\"vehicle_name\":\"" + safeName + "\",\"x\":" + position[0].ToString() + ",\"z\":" + position[1].ToString() + ",\"y\":" + position[2].ToString() + "}";
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