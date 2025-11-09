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

void InitWorldTracking()
{
	if (!GetGame() || !GetGame().IsServer())
		return;

	WriteToLog("InitWorldTracking(): Iniciando varredura única para fences, veículos e containers...", LogFile.INIT, false, LogType.INFO);

	array<Object> worldObjects = new array<Object>();
	GatherWorldObjects(worldObjects);

	if (!worldObjects || worldObjects.Count() == 0)
	{
		WriteToLog("InitWorldTracking(): Nenhum objeto encontrado durante a varredura.", LogFile.INIT, false, LogType.WARNING);
		return;
	}

	PopulateTrackedFences(worldObjects);
	PopulateTrackedVehicles(worldObjects);

	string containersJson;
	int totalContainers;
	int totalItems;
	BuildContainersData(worldObjects, containersJson, totalContainers, totalItems);

	CleanTrackedFences();
	CleanTrackedVehicles();

	SendFencesStatus();
	SendVehiclesPositions();

	if (containersJson != "")
	{
		string containersAction = "{\"action\":\"containers_positions\",\"container_data\":[" + containersJson + "]}";
		AppendExternalAction(containersAction);
		WriteToLog("InitWorldTracking(): JSON com " + totalContainers.ToString() + " containers e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
	}

	WriteToLog("InitWorldTracking(): Varredura finalizada.", LogFile.INIT, false, LogType.INFO);
}

