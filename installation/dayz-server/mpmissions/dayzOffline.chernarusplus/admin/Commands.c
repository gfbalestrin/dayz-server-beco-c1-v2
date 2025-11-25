void CheckCommands()
{
    // Verifica se já está processando comandos
    if (m_IsProcessingCommands)
    {
        WriteToLog("CheckCommands(): Já está processando comandos, pulando execução", LogFile.INIT, false, LogType.DEBUG);
        return;
    }
    
    // Define flag de processamento
    m_IsProcessingCommands = true;
    
    string path = ExternalCommandsFile;
    FileHandle file = OpenFile(path, FileMode.READ);
    if (file == 0) 
    {
        m_IsProcessingCommands = false;
        return;
    }

    string line;
    while (FGets(file, line) > 0)
    {
        line = line.Trim();
        if (line == "") continue;

        TStringArray tokens = new TStringArray;
        line.Split(" ", tokens);
        if (tokens.Count() < 2) 
            continue;

        ExecuteCommand(tokens);
    }

    CloseFile(file);
    
    // Limpa o arquivo apenas após processar tudo
    FileHandle clearFile = OpenFile(path, FileMode.WRITE);
    if (clearFile != 0)
        CloseFile(clearFile);
    
    // Libera o lock
    m_IsProcessingCommands = false;
    
    //WriteToLog("CheckCommands(): Processamento concluído", LogFile.INIT, false, LogType.DEBUG);
}

bool ExecuteCheckFenceCommand(string playerID, string fenceIdentifierParam, string fenceRequestId)
{
    string fenceSanitizedRequestId = SanitizeForJson(fenceRequestId);
    
    // Tentar encontrar em m_TrackedFences primeiro
    Fence fenceTrackedFence = null;
    Watchtower fenceTrackedWatchtower = null;
    Object fenceTrackedFlag = null;
    string fenceStructureType = "";
    
    // Verificar se o ID está no formato baseado em coordenadas (Fence_x_y_z, Watchtower_x_y_z, Flag_x_y_z)
    bool fenceIdIsCoordinateBased = false;
    float fenceCoordX = 0.0;
    float fenceCoordY = 0.0;
    float fenceCoordZ = 0.0;
    string fenceExpectedType = "";
    
    if (fenceIdentifierParam.IndexOf("Fence_") == 0)
    {
        fenceExpectedType = "fence";
        string fenceCoordPart = fenceIdentifierParam;
        fenceCoordPart = fenceCoordPart.Substring(6, fenceCoordPart.Length() - 6); // Remove "Fence_"
        TStringArray fenceCoordParts = new TStringArray;
        fenceCoordPart.Split("_", fenceCoordParts);
        if (fenceCoordParts.Count() >= 3)
        {
            // Formato ID: Fence_{coord_x}_{coord_y}_{coord_z}
            // Onde: coord_x = position.x (leste-oeste), coord_y = position.y (norte-sul), coord_z = position.z (altura)
            // DayZ GetPosition(): [x (leste-oeste), y (altura), z (norte-sul)]
            fenceCoordX = fenceCoordParts.Get(0).ToFloat(); // x (leste-oeste) → [0]
            float fenceIdCoordY = fenceCoordParts.Get(1).ToFloat(); // y do ID (norte-sul) → [2] do DayZ
            float fenceIdCoordZ = fenceCoordParts.Get(2).ToFloat(); // z do ID (altura) → [1] do DayZ
            fenceCoordY = fenceIdCoordZ; // altura → [1]
            fenceCoordZ = fenceIdCoordY; // norte-sul → [2]
            fenceIdIsCoordinateBased = true;
        }
    }
    else if (fenceIdentifierParam.IndexOf("Watchtower_") == 0)
    {
        fenceExpectedType = "watchtower";
        string fenceWtCoordPart = fenceIdentifierParam;
        fenceWtCoordPart = fenceWtCoordPart.Substring(11, fenceWtCoordPart.Length() - 11); // Remove "Watchtower_"
        TStringArray fenceWtCoordParts = new TStringArray;
        fenceWtCoordPart.Split("_", fenceWtCoordParts);
        if (fenceWtCoordParts.Count() >= 3)
        {
            // Formato ID: Watchtower_{coord_x}_{coord_z}_{coord_y}
            // Onde: coord_x = position.x (leste-oeste), coord_z = position.z (altura), coord_y = position.y (norte-sul)
            // DayZ GetPosition(): [x (leste-oeste), y (altura), z (norte-sul)]
            fenceCoordX = fenceWtCoordParts.Get(0).ToFloat(); // x (leste-oeste) → [0]
            float fenceWtIdCoordZ = fenceWtCoordParts.Get(1).ToFloat(); // z do ID (altura) → [1] do DayZ
            float fenceWtIdCoordY = fenceWtCoordParts.Get(2).ToFloat(); // y do ID (norte-sul) → [2] do DayZ
            fenceCoordY = fenceWtIdCoordZ; // altura → [1]
            fenceCoordZ = fenceWtIdCoordY; // norte-sul → [2]
            fenceIdIsCoordinateBased = true;
        }
    }
    else if (fenceIdentifierParam.IndexOf("Flag_") == 0)
    {
        fenceExpectedType = "flag";
        string fenceFlagCoordPart = fenceIdentifierParam;
        fenceFlagCoordPart = fenceFlagCoordPart.Substring(5, fenceFlagCoordPart.Length() - 5); // Remove "Flag_"
        TStringArray fenceFlagCoordParts = new TStringArray;
        fenceFlagCoordPart.Split("_", fenceFlagCoordParts);
        if (fenceFlagCoordParts.Count() >= 3)
        {
            // Formato ID: Flag_{coord_x}_{coord_z}_{coord_y}
            // Onde: coord_x = position.x (leste-oeste), coord_z = position.z (altura), coord_y = position.y (norte-sul)
            // DayZ GetPosition(): [x (leste-oeste), y (altura), z (norte-sul)]
            fenceCoordX = fenceFlagCoordParts.Get(0).ToFloat(); // x (leste-oeste) → [0]
            float fenceFlagIdCoordZ = fenceFlagCoordParts.Get(1).ToFloat(); // z do ID (altura) → [1] do DayZ
            float fenceFlagIdCoordY = fenceFlagCoordParts.Get(2).ToFloat(); // y do ID (norte-sul) → [2] do DayZ
            fenceCoordY = fenceFlagIdCoordZ; // altura → [1]
            fenceCoordZ = fenceFlagIdCoordY; // norte-sul → [2]
            fenceIdIsCoordinateBased = true;
        }
    }
    
    // Se o ID é baseado em coordenadas, buscar pela posição
    if (fenceIdIsCoordinateBased)
    {
        // DayZ Vector: Vector(x, y, z) onde x=leste-oeste, y=altura, z=norte-sul
        vector fenceSearchPosition = Vector(fenceCoordX, fenceCoordY, fenceCoordZ);
        float fenceSearchRadius = 10.0; // Raio maior para tolerar pequenas diferenças de coordenadas
        
        // Buscar em fences primeiro
        if (fenceExpectedType == "fence" && m_TrackedFences && m_TrackedFences.Count() > 0)
        {
            foreach (Fence fenceCandidateFence : m_TrackedFences)
            {
                if (!fenceCandidateFence)
                    continue;
                
                vector fenceCandidatePos = fenceCandidateFence.GetPosition();
                float fenceCandidateDistance = vector.Distance(fenceCandidatePos, fenceSearchPosition);
                
                if (fenceCandidateDistance <= fenceSearchRadius)
                {
                    fenceTrackedFence = fenceCandidateFence;
                    fenceStructureType = "fence";
                    break;
                }
            }
        }
        
        // Buscar em watchtowers
        if (!fenceTrackedFence && fenceExpectedType == "watchtower" && m_TrackedWatchtowers && m_TrackedWatchtowers.Count() > 0)
        {
            foreach (Watchtower fenceCandidateWatchtower : m_TrackedWatchtowers)
            {
                if (!fenceCandidateWatchtower)
                    continue;
                
                vector fenceWtCandidatePos = fenceCandidateWatchtower.GetPosition();
                float fenceWtCandidateDistance = vector.Distance(fenceWtCandidatePos, fenceSearchPosition);
                
                if (fenceWtCandidateDistance <= fenceSearchRadius)
                {
                    fenceTrackedWatchtower = fenceCandidateWatchtower;
                    fenceStructureType = "watchtower";
                    break;
                }
            }
        }
        
        // Buscar em flags
        if (!fenceTrackedFence && !fenceTrackedWatchtower && fenceExpectedType == "flag" && m_TrackedFlags && m_TrackedFlags.Count() > 0)
        {
            foreach (Object fenceCandidateFlag : m_TrackedFlags)
            {
                if (!fenceCandidateFlag)
                    continue;
                
                vector fenceFlagCandidatePos = fenceCandidateFlag.GetPosition();
                float fenceFlagCandidateDistance = vector.Distance(fenceFlagCandidatePos, fenceSearchPosition);
                
                if (fenceFlagCandidateDistance <= fenceSearchRadius)
                {
                    fenceTrackedFlag = fenceCandidateFlag;
                    fenceStructureType = "flag";
                    break;
                }
            }
        }
    }
    
    // Se não encontrou por coordenadas, tentar por PersistentID
    if (!fenceTrackedFence && !fenceTrackedWatchtower && !fenceTrackedFlag && m_TrackedFences && m_TrackedFences.Count() > 0)
    {
        foreach (Fence fencePidCandidateFence : m_TrackedFences)
        {
            if (!fencePidCandidateFence)
                continue;
            
            int fencePidLow1 = 0;
            int fencePidLow2 = 0;
            int fencePidHigh1 = 0;
            int fencePidHigh2 = 0;
            fencePidCandidateFence.GetPersistentID(fencePidLow1, fencePidLow2, fencePidHigh1, fencePidHigh2);
            
            bool fenceHasPersistent = (fencePidLow1 != 0 || fencePidLow2 != 0 || fencePidHigh1 != 0 || fencePidHigh2 != 0);
            string fencePersistentKey = fencePidLow1.ToString() + "-" + fencePidLow2.ToString() + "-" + fencePidHigh1.ToString() + "-" + fencePidHigh2.ToString();
            string fenceCandidateIdentifier = fencePersistentKey;
            if (!fenceHasPersistent)
            {
                fenceCandidateIdentifier = "pending-" + fencePidCandidateFence.GetID().ToString();
            }
            
            if (fenceCandidateIdentifier == fenceIdentifierParam)
            {
                fenceTrackedFence = fencePidCandidateFence;
                fenceStructureType = "fence";
                break;
            }
        }
    }
    
    // Se não encontrou em fences, tentar watchtowers
    if (!fenceTrackedFence && m_TrackedWatchtowers && m_TrackedWatchtowers.Count() > 0)
    {
        foreach (Watchtower fencePidCandidateWatchtower : m_TrackedWatchtowers)
        {
            if (!fencePidCandidateWatchtower)
                continue;
            
            int fenceWtPidLow1 = 0;
            int fenceWtPidLow2 = 0;
            int fenceWtPidHigh1 = 0;
            int fenceWtPidHigh2 = 0;
            fencePidCandidateWatchtower.GetPersistentID(fenceWtPidLow1, fenceWtPidLow2, fenceWtPidHigh1, fenceWtPidHigh2);
            
            bool fenceWtHasPersistent = (fenceWtPidLow1 != 0 || fenceWtPidLow2 != 0 || fenceWtPidHigh1 != 0 || fenceWtPidHigh2 != 0);
            string fenceWtPersistentKey = fenceWtPidLow1.ToString() + "-" + fenceWtPidLow2.ToString() + "-" + fenceWtPidHigh1.ToString() + "-" + fenceWtPidHigh2.ToString();
            string fenceWtCandidateIdentifier = fenceWtPersistentKey;
            if (!fenceWtHasPersistent)
            {
                fenceWtCandidateIdentifier = "pending-" + fencePidCandidateWatchtower.GetID().ToString();
            }
            
            if (fenceWtCandidateIdentifier == fenceIdentifierParam)
            {
                fenceTrackedWatchtower = fencePidCandidateWatchtower;
                fenceStructureType = "watchtower";
                break;
            }
        }
    }
    
    // Se não encontrou em watchtowers, tentar flags
    if (!fenceTrackedFence && !fenceTrackedWatchtower && m_TrackedFlags && m_TrackedFlags.Count() > 0)
    {
        foreach (Object fencePidCandidateFlag : m_TrackedFlags)
        {
            if (!fencePidCandidateFlag)
                continue;
            
            EntityAI fenceFlagEntity = EntityAI.Cast(fencePidCandidateFlag);
            int fenceFlagPidLow1 = 0;
            int fenceFlagPidLow2 = 0;
            int fenceFlagPidHigh1 = 0;
            int fenceFlagPidHigh2 = 0;
            bool fenceFlagHasPersistent = false;
            string fenceFlagCandidateIdentifier = "";
            
            if (fenceFlagEntity)
            {
                fenceFlagEntity.GetPersistentID(fenceFlagPidLow1, fenceFlagPidLow2, fenceFlagPidHigh1, fenceFlagPidHigh2);
                fenceFlagHasPersistent = (fenceFlagPidLow1 != 0 || fenceFlagPidLow2 != 0 || fenceFlagPidHigh1 != 0 || fenceFlagPidHigh2 != 0);
            }
            
            if (fenceFlagHasPersistent)
            {
                string fenceFlagPersistentKey = fenceFlagPidLow1.ToString() + "-" + fenceFlagPidLow2.ToString() + "-" + fenceFlagPidHigh1.ToString() + "-" + fenceFlagPidHigh2.ToString();
                fenceFlagCandidateIdentifier = fenceFlagPersistentKey;
            }
            else
            {
                fenceFlagCandidateIdentifier = "pending-" + fencePidCandidateFlag.GetID().ToString();
            }
            
            if (fenceFlagCandidateIdentifier == fenceIdentifierParam)
            {
                fenceTrackedFlag = fencePidCandidateFlag;
                fenceStructureType = "flag";
                break;
            }
        }
    }
    
    // Verificar se encontrou alguma construção
    if (!fenceTrackedFence && !fenceTrackedWatchtower && !fenceTrackedFlag)
    {
        string fenceNotFoundMessage = "Construção não encontrada: " + fenceIdentifierParam;
        WriteToLog("ExecuteCommand(): checkfence - " + fenceNotFoundMessage + " (request_id: " + fenceRequestId + ")", LogFile.INIT, false, LogType.ERROR);
        
        string fenceNotFoundJson = "{\"request_id\":\"" + fenceSanitizedRequestId + "\",\"command\":\"checkfence\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(fenceNotFoundMessage) + "\"}";
        AppendCommandResult(fenceNotFoundJson, false);
        return false;
    }
    
    // Coletar dados baseado no tipo
    vector fencePosition;
    vector fenceOrientation;
    string fenceResultJson = "{\"request_id\":\"" + fenceSanitizedRequestId + "\",\"command\":\"checkfence\",\"status\":\"success\",\"structure_type\":\"" + fenceStructureType + "\"";
    
    if (fenceTrackedFence)
    {
        // Dados de Fence
        if (fenceTrackedFence.GetHealth("", "") <= 0)
        {
            string fenceDestroyedMessage = "Fence está destruída";
            WriteToLog("ExecuteCommand(): checkfence - " + fenceDestroyedMessage + " (request_id: " + fenceRequestId + ")", LogFile.INIT, false, LogType.WARNING);
            
            string fenceDestroyedJson = "{\"request_id\":\"" + fenceSanitizedRequestId + "\",\"command\":\"checkfence\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(fenceDestroyedMessage) + "\"}";
            AppendCommandResult(fenceDestroyedJson, false);
            return false;
        }
        
        fencePosition = fenceTrackedFence.GetPosition();
        fenceOrientation = fenceTrackedFence.GetOrientation();
        
        bool fenceHasBase = fenceTrackedFence.HasBase();
        Construction fenceConstruction = fenceTrackedFence.GetConstruction();
        bool fenceLowerPanelBuilt = false;
        bool fenceUpperPanelBuilt = false;
        
        if (fenceConstruction)
        {
            array<string> fenceLowerParts = { "wall_wood_down", "wall_metal_down" };
            foreach (string fenceLowerPartName : fenceLowerParts)
            {
                ConstructionPart fenceLowerPart = fenceConstruction.GetConstructionPart(fenceLowerPartName);
                if (fenceLowerPart && fenceLowerPart.IsBuilt())
                {
                    fenceLowerPanelBuilt = true;
                    break;
                }
            }
            
            array<string> fenceUpperParts = { "wall_wood_up", "wall_metal_up" };
            foreach (string fenceUpperPartName : fenceUpperParts)
            {
                ConstructionPart fenceUpperPart = fenceConstruction.GetConstructionPart(fenceUpperPartName);
                if (fenceUpperPart && fenceUpperPart.IsBuilt())
                {
                    fenceUpperPanelBuilt = true;
                    break;
                }
            }
        }
        
        bool fenceHasGate = fenceTrackedFence.HasFullyConstructedGate();
        bool fenceIsOpened = fenceTrackedFence.IsOpened();
        bool fenceIsLocked = fenceTrackedFence.IsLocked();
        
        string fenceAttachmentsJson = "";
        if (fenceTrackedFence.GetInventory())
        {
            int fenceAttachmentCount = fenceTrackedFence.GetInventory().AttachmentCount();
            for (int fenceAttachmentIndex = 0; fenceAttachmentIndex < fenceAttachmentCount; fenceAttachmentIndex++)
            {
                EntityAI fenceAttachmentItem = fenceTrackedFence.GetInventory().GetAttachmentFromIndex(fenceAttachmentIndex);
                if (!fenceAttachmentItem)
                    continue;
                
                string fenceAttachmentType = fenceAttachmentItem.GetType();
                TStringArray fenceUnsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
                foreach (string fenceUnsafeChar : fenceUnsafeChars)
                {
                    fenceAttachmentType.Replace(fenceUnsafeChar, "-");
                }
                
                if (fenceAttachmentsJson != "")
                    fenceAttachmentsJson = fenceAttachmentsJson + ",";
                
                fenceAttachmentsJson = fenceAttachmentsJson + "\"" + SanitizeForJson(fenceAttachmentType) + "\"";
            }
        }
        
        int fencePidLow1Result = 0;
        int fencePidLow2Result = 0;
        int fencePidHigh1Result = 0;
        int fencePidHigh2Result = 0;
        fenceTrackedFence.GetPersistentID(fencePidLow1Result, fencePidLow2Result, fencePidHigh1Result, fencePidHigh2Result);
        bool fenceHasPersistentResult = (fencePidLow1Result != 0 || fencePidLow2Result != 0 || fencePidHigh1Result != 0 || fencePidHigh2Result != 0);
        string fencePersistentKeyResult = fencePidLow1Result.ToString() + "-" + fencePidLow2Result.ToString() + "-" + fencePidHigh1Result.ToString() + "-" + fencePidHigh2Result.ToString();
        string fenceFinalIdentifier = fencePersistentKeyResult;
        if (!fenceHasPersistentResult)
        {
            fenceFinalIdentifier = "pending-" + fenceTrackedFence.GetID().ToString();
        }
        
        string fencePosXStr = fencePosition[0].ToString();
        string fencePosZStr = fencePosition[1].ToString();
        string fencePosYStr = fencePosition[2].ToString();
        
        string fenceOriXStr = fenceOrientation[0].ToString();
        string fenceOriYStr = fenceOrientation[1].ToString();
        string fenceOriZStr = fenceOrientation[2].ToString();
        
        fenceResultJson = fenceResultJson + ",\"fence_id\":\"" + SanitizeForJson(fenceFinalIdentifier) + "\"";
        fenceResultJson = fenceResultJson + ",\"position\":{\"x\":" + fencePosXStr + ",\"z\":" + fencePosZStr + ",\"y\":" + fencePosYStr + "}";
        fenceResultJson = fenceResultJson + ",\"orientation\":{\"x\":" + fenceOriXStr + ",\"y\":" + fenceOriYStr + ",\"z\":" + fenceOriZStr + "}";
        fenceResultJson = fenceResultJson + ",\"has_base\":" + BoolToJson(fenceHasBase);
        fenceResultJson = fenceResultJson + ",\"lower_panel_built\":" + BoolToJson(fenceLowerPanelBuilt);
        fenceResultJson = fenceResultJson + ",\"upper_panel_built\":" + BoolToJson(fenceUpperPanelBuilt);
        fenceResultJson = fenceResultJson + ",\"has_gate\":" + BoolToJson(fenceHasGate);
        fenceResultJson = fenceResultJson + ",\"is_opened\":" + BoolToJson(fenceIsOpened);
        fenceResultJson = fenceResultJson + ",\"is_locked\":" + BoolToJson(fenceIsLocked);
        fenceResultJson = fenceResultJson + ",\"attachments\":[" + fenceAttachmentsJson + "]";
    }
    else if (fenceTrackedWatchtower)
    {
        // Dados de Watchtower
        if (fenceTrackedWatchtower.GetHealth("", "") <= 0)
        {
            string fenceWtDestroyedMessage = "Watchtower está destruída";
            WriteToLog("ExecuteCommand(): checkfence - " + fenceWtDestroyedMessage + " (request_id: " + fenceRequestId + ")", LogFile.INIT, false, LogType.WARNING);
            
            string fenceWtDestroyedJson = "{\"request_id\":\"" + fenceSanitizedRequestId + "\",\"command\":\"checkfence\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(fenceWtDestroyedMessage) + "\"}";
            AppendCommandResult(fenceWtDestroyedJson, false);
            return false;
        }
        
        fencePosition = fenceTrackedWatchtower.GetPosition();
        fenceOrientation = fenceTrackedWatchtower.GetOrientation();
        
        bool fenceWtHasBase = fenceTrackedWatchtower.HasBase();
        Construction fenceWtConstruction = fenceTrackedWatchtower.GetConstruction();
        
        bool fenceWtLevel1BaseBuilt = IsWatchtowerPartBuilt(fenceWtConstruction, "level_1_base");
        bool fenceWtLevel2BaseBuilt = IsWatchtowerPartBuilt(fenceWtConstruction, "level_2_base");
        bool fenceWtLevel3BaseBuilt = IsWatchtowerPartBuilt(fenceWtConstruction, "level_3_base");
        bool fenceWtLevel1StairsBuilt = IsWatchtowerPartBuilt(fenceWtConstruction, "level_1_stairs");
        bool fenceWtLevel2StairsBuilt = IsWatchtowerPartBuilt(fenceWtConstruction, "level_2_stairs");
        bool fenceWtHasRoof = IsWatchtowerPartBuilt(fenceWtConstruction, "roof");
        
        // Paredes nível 1
        bool fenceWtLevel1Wall1LowerBuilt = false;
        bool fenceWtLevel1Wall1UpperBuilt = false;
        bool fenceWtLevel1Wall2LowerBuilt = false;
        bool fenceWtLevel1Wall2UpperBuilt = false;
        bool fenceWtLevel1Wall3LowerBuilt = false;
        bool fenceWtLevel1Wall3UpperBuilt = false;
        
        // Paredes nível 2
        bool fenceWtLevel2Wall1LowerBuilt = false;
        bool fenceWtLevel2Wall1UpperBuilt = false;
        bool fenceWtLevel2Wall2LowerBuilt = false;
        bool fenceWtLevel2Wall2UpperBuilt = false;
        bool fenceWtLevel2Wall3LowerBuilt = false;
        bool fenceWtLevel2Wall3UpperBuilt = false;
        
        // Paredes nível 3
        bool fenceWtLevel3Wall1LowerBuilt = false;
        bool fenceWtLevel3Wall1UpperBuilt = false;
        bool fenceWtLevel3Wall2LowerBuilt = false;
        bool fenceWtLevel3Wall2UpperBuilt = false;
        bool fenceWtLevel3Wall3LowerBuilt = false;
        bool fenceWtLevel3Wall3UpperBuilt = false;
        
        if (fenceWtConstruction)
        {
            array<string> fenceWtLevel1Wall1LowerParts = { "level_1_wall_1_down", "level_1_wall_1_wood_down", "level_1_wall_1_metal_down" };
            fenceWtLevel1Wall1LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall1LowerParts);
            array<string> fenceWtLevel1Wall1UpperParts = { "level_1_wall_1_up", "level_1_wall_1_wood_up", "level_1_wall_1_metal_up" };
            fenceWtLevel1Wall1UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall1UpperParts);
            
            array<string> fenceWtLevel1Wall2LowerParts = { "level_1_wall_2_down", "level_1_wall_2_wood_down", "level_1_wall_2_metal_down" };
            fenceWtLevel1Wall2LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall2LowerParts);
            array<string> fenceWtLevel1Wall2UpperParts = { "level_1_wall_2_up", "level_1_wall_2_wood_up", "level_1_wall_2_metal_up" };
            fenceWtLevel1Wall2UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall2UpperParts);
            
            array<string> fenceWtLevel1Wall3LowerParts = { "level_1_wall_3_down", "level_1_wall_3_wood_down", "level_1_wall_3_metal_down" };
            fenceWtLevel1Wall3LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall3LowerParts);
            array<string> fenceWtLevel1Wall3UpperParts = { "level_1_wall_3_up", "level_1_wall_3_wood_up", "level_1_wall_3_metal_up" };
            fenceWtLevel1Wall3UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel1Wall3UpperParts);
            
            array<string> fenceWtLevel2Wall1LowerParts = { "level_2_wall_1_down", "level_2_wall_1_wood_down", "level_2_wall_1_metal_down" };
            fenceWtLevel2Wall1LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall1LowerParts);
            array<string> fenceWtLevel2Wall1UpperParts = { "level_2_wall_1_up", "level_2_wall_1_wood_up", "level_2_wall_1_metal_up" };
            fenceWtLevel2Wall1UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall1UpperParts);
            
            array<string> fenceWtLevel2Wall2LowerParts = { "level_2_wall_2_down", "level_2_wall_2_wood_down", "level_2_wall_2_metal_down" };
            fenceWtLevel2Wall2LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall2LowerParts);
            array<string> fenceWtLevel2Wall2UpperParts = { "level_2_wall_2_up", "level_2_wall_2_wood_up", "level_2_wall_2_metal_up" };
            fenceWtLevel2Wall2UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall2UpperParts);
            
            array<string> fenceWtLevel2Wall3LowerParts = { "level_2_wall_3_down", "level_2_wall_3_wood_down", "level_2_wall_3_metal_down" };
            fenceWtLevel2Wall3LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall3LowerParts);
            array<string> fenceWtLevel2Wall3UpperParts = { "level_2_wall_3_up", "level_2_wall_3_wood_up", "level_2_wall_3_metal_up" };
            fenceWtLevel2Wall3UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel2Wall3UpperParts);
            
            array<string> fenceWtLevel3Wall1LowerParts = { "level_3_wall_1_down", "level_3_wall_1_wood_down", "level_3_wall_1_metal_down" };
            fenceWtLevel3Wall1LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall1LowerParts);
            array<string> fenceWtLevel3Wall1UpperParts = { "level_3_wall_1_up", "level_3_wall_1_wood_up", "level_3_wall_1_metal_up" };
            fenceWtLevel3Wall1UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall1UpperParts);
            
            array<string> fenceWtLevel3Wall2LowerParts = { "level_3_wall_2_down", "level_3_wall_2_wood_down", "level_3_wall_2_metal_down" };
            fenceWtLevel3Wall2LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall2LowerParts);
            array<string> fenceWtLevel3Wall2UpperParts = { "level_3_wall_2_up", "level_3_wall_2_wood_up", "level_3_wall_2_metal_up" };
            fenceWtLevel3Wall2UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall2UpperParts);
            
            array<string> fenceWtLevel3Wall3LowerParts = { "level_3_wall_3_down", "level_3_wall_3_wood_down", "level_3_wall_3_metal_down" };
            fenceWtLevel3Wall3LowerBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall3LowerParts);
            array<string> fenceWtLevel3Wall3UpperParts = { "level_3_wall_3_up", "level_3_wall_3_wood_up", "level_3_wall_3_metal_up" };
            fenceWtLevel3Wall3UpperBuilt = IsAnyWatchtowerPartBuilt(fenceWtConstruction, fenceWtLevel3Wall3UpperParts);
        }
        
        int fenceWtPidLow1Result = 0;
        int fenceWtPidLow2Result = 0;
        int fenceWtPidHigh1Result = 0;
        int fenceWtPidHigh2Result = 0;
        fenceTrackedWatchtower.GetPersistentID(fenceWtPidLow1Result, fenceWtPidLow2Result, fenceWtPidHigh1Result, fenceWtPidHigh2Result);
        bool fenceWtHasPersistentResult = (fenceWtPidLow1Result != 0 || fenceWtPidLow2Result != 0 || fenceWtPidHigh1Result != 0 || fenceWtPidHigh2Result != 0);
        string fenceWtPersistentKeyResult = fenceWtPidLow1Result.ToString() + "-" + fenceWtPidLow2Result.ToString() + "-" + fenceWtPidHigh1Result.ToString() + "-" + fenceWtPidHigh2Result.ToString();
        string fenceWtFinalIdentifier = fenceWtPersistentKeyResult;
        if (!fenceWtHasPersistentResult)
        {
            fenceWtFinalIdentifier = "pending-" + fenceTrackedWatchtower.GetID().ToString();
        }
        
        string fenceWtPosXStr = fencePosition[0].ToString();
        string fenceWtPosZStr = fencePosition[1].ToString();
        string fenceWtPosYStr = fencePosition[2].ToString();
        
        string fenceWtOriXStr = fenceOrientation[0].ToString();
        string fenceWtOriYStr = fenceOrientation[1].ToString();
        string fenceWtOriZStr = fenceOrientation[2].ToString();
        
        fenceResultJson = fenceResultJson + ",\"fence_id\":\"" + SanitizeForJson(fenceWtFinalIdentifier) + "\"";
        fenceResultJson = fenceResultJson + ",\"position\":{\"x\":" + fenceWtPosXStr + ",\"z\":" + fenceWtPosZStr + ",\"y\":" + fenceWtPosYStr + "}";
        fenceResultJson = fenceResultJson + ",\"orientation\":{\"x\":" + fenceWtOriXStr + ",\"y\":" + fenceWtOriYStr + ",\"z\":" + fenceWtOriZStr + "}";
        fenceResultJson = fenceResultJson + ",\"has_base\":" + BoolToJson(fenceWtHasBase);
        fenceResultJson = fenceResultJson + ",\"level_1_base\":" + BoolToJson(fenceWtLevel1BaseBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_base\":" + BoolToJson(fenceWtLevel2BaseBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_base\":" + BoolToJson(fenceWtLevel3BaseBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_stairs\":" + BoolToJson(fenceWtLevel1StairsBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_stairs\":" + BoolToJson(fenceWtLevel2StairsBuilt);
        fenceResultJson = fenceResultJson + ",\"has_roof\":" + BoolToJson(fenceWtHasRoof);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_1_lower_built\":" + BoolToJson(fenceWtLevel1Wall1LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_1_upper_built\":" + BoolToJson(fenceWtLevel1Wall1UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_2_lower_built\":" + BoolToJson(fenceWtLevel1Wall2LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_2_upper_built\":" + BoolToJson(fenceWtLevel1Wall2UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_3_lower_built\":" + BoolToJson(fenceWtLevel1Wall3LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_1_wall_3_upper_built\":" + BoolToJson(fenceWtLevel1Wall3UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_1_lower_built\":" + BoolToJson(fenceWtLevel2Wall1LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_1_upper_built\":" + BoolToJson(fenceWtLevel2Wall1UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_2_lower_built\":" + BoolToJson(fenceWtLevel2Wall2LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_2_upper_built\":" + BoolToJson(fenceWtLevel2Wall2UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_3_lower_built\":" + BoolToJson(fenceWtLevel2Wall3LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_2_wall_3_upper_built\":" + BoolToJson(fenceWtLevel2Wall3UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_1_lower_built\":" + BoolToJson(fenceWtLevel3Wall1LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_1_upper_built\":" + BoolToJson(fenceWtLevel3Wall1UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_2_lower_built\":" + BoolToJson(fenceWtLevel3Wall2LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_2_upper_built\":" + BoolToJson(fenceWtLevel3Wall2UpperBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_3_lower_built\":" + BoolToJson(fenceWtLevel3Wall3LowerBuilt);
        fenceResultJson = fenceResultJson + ",\"level_3_wall_3_upper_built\":" + BoolToJson(fenceWtLevel3Wall3UpperBuilt);
    }
    else if (fenceTrackedFlag)
    {
        // Dados de Flag
        if (fenceTrackedFlag.GetHealth("", "") <= 0)
        {
            string fenceFlagDestroyedMessage = "Flag está destruída";
            WriteToLog("ExecuteCommand(): checkfence - " + fenceFlagDestroyedMessage + " (request_id: " + fenceRequestId + ")", LogFile.INIT, false, LogType.WARNING);
            
            string fenceFlagDestroyedJson = "{\"request_id\":\"" + fenceSanitizedRequestId + "\",\"command\":\"checkfence\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(fenceFlagDestroyedMessage) + "\"}";
            AppendCommandResult(fenceFlagDestroyedJson, false);
            return false;
        }
        
        fencePosition = fenceTrackedFlag.GetPosition();
        fenceOrientation = fenceTrackedFlag.GetOrientation();
        
        BaseBuildingBase fenceFlagBuildingBase = BaseBuildingBase.Cast(fenceTrackedFlag);
        bool fenceFlagHasBase = false;
        bool fenceFlagHasFlagBase = false;
        bool fenceFlagRaised = false;
        float fenceFlagHeight = 0.0;
        
        if (fenceFlagBuildingBase)
        {
            fenceFlagHasBase = fenceFlagBuildingBase.HasBase();
            
            if (fenceFlagBuildingBase.GetInventory())
            {
                for (int fenceFlagAttachmentIndex = 0; fenceFlagAttachmentIndex < fenceFlagBuildingBase.GetInventory().AttachmentCount(); fenceFlagAttachmentIndex++)
                {
                    EntityAI fenceFlagAttachment = fenceFlagBuildingBase.GetInventory().GetAttachmentFromIndex(fenceFlagAttachmentIndex);
                    if (fenceFlagAttachment)
                    {
                        string fenceFlagAttachmentType = fenceFlagAttachment.GetType();
                        if (fenceFlagAttachmentType.IndexOf("Flag_") == 0)
                        {
                            fenceFlagHasFlagBase = true;
                            fenceFlagRaised = true;
                            
                            vector fenceFlagBasePos = fenceFlagAttachment.GetPosition();
                            vector fenceFlagPolePos = fenceTrackedFlag.GetPosition();
                            fenceFlagHeight = Math.AbsFloat(fenceFlagBasePos[1] - fenceFlagPolePos[1]);
                            break;
                        }
                    }
                }
            }
        }
        
        EntityAI fenceFlagEntityResult = EntityAI.Cast(fenceTrackedFlag);
        int fenceFlagPidLow1Result = 0;
        int fenceFlagPidLow2Result = 0;
        int fenceFlagPidHigh1Result = 0;
        int fenceFlagPidHigh2Result = 0;
        bool fenceFlagHasPersistentResult = false;
        string fenceFlagFinalIdentifier = "";
        
        if (fenceFlagEntityResult)
        {
            fenceFlagEntityResult.GetPersistentID(fenceFlagPidLow1Result, fenceFlagPidLow2Result, fenceFlagPidHigh1Result, fenceFlagPidHigh2Result);
            fenceFlagHasPersistentResult = (fenceFlagPidLow1Result != 0 || fenceFlagPidLow2Result != 0 || fenceFlagPidHigh1Result != 0 || fenceFlagPidHigh2Result != 0);
        }
        
        if (fenceFlagHasPersistentResult)
        {
            string fenceFlagPersistentKeyResult = fenceFlagPidLow1Result.ToString() + "-" + fenceFlagPidLow2Result.ToString() + "-" + fenceFlagPidHigh1Result.ToString() + "-" + fenceFlagPidHigh2Result.ToString();
            fenceFlagFinalIdentifier = fenceFlagPersistentKeyResult;
        }
        else
        {
            fenceFlagFinalIdentifier = "pending-" + fenceTrackedFlag.GetID().ToString();
        }
        
        string fenceFlagPosXStr = fencePosition[0].ToString();
        string fenceFlagPosZStr = fencePosition[1].ToString();
        string fenceFlagPosYStr = fencePosition[2].ToString();
        
        string fenceFlagOriXStr = fenceOrientation[0].ToString();
        string fenceFlagOriYStr = fenceOrientation[1].ToString();
        string fenceFlagOriZStr = fenceOrientation[2].ToString();
        
        string fenceFlagHeightStr = fenceFlagHeight.ToString();
        
        fenceResultJson = fenceResultJson + ",\"fence_id\":\"" + SanitizeForJson(fenceFlagFinalIdentifier) + "\"";
        fenceResultJson = fenceResultJson + ",\"position\":{\"x\":" + fenceFlagPosXStr + ",\"z\":" + fenceFlagPosZStr + ",\"y\":" + fenceFlagPosYStr + "}";
        fenceResultJson = fenceResultJson + ",\"orientation\":{\"x\":" + fenceFlagOriXStr + ",\"y\":" + fenceFlagOriYStr + ",\"z\":" + fenceFlagOriZStr + "}";
        fenceResultJson = fenceResultJson + ",\"has_base\":" + BoolToJson(fenceFlagHasBase);
        fenceResultJson = fenceResultJson + ",\"has_flag_base\":" + BoolToJson(fenceFlagHasFlagBase);
        fenceResultJson = fenceResultJson + ",\"flag_raised\":" + BoolToJson(fenceFlagRaised);
        fenceResultJson = fenceResultJson + ",\"flag_height\":" + fenceFlagHeightStr;
    }
    
    fenceResultJson = fenceResultJson + "}";
    
    AppendCommandResult(fenceResultJson);
    WriteToLog("ExecuteCommand(): checkfence - Dados enviados para construção tipo " + fenceStructureType + " (request_id: " + fenceRequestId + ")", LogFile.INIT, false, LogType.INFO);
    
    return true;
}

bool ExecuteCommand(TStringArray tokens)
{
    string playerID = tokens[0];
    string command = tokens[1];    

    WriteToLog("ExecuteCommand(): Executando comando: " + command + " para: " + playerID, LogFile.INIT, false, LogType.DEBUG);
    
    // Comandos que não requerem jogador online
    bool isSystemCommand = (playerID == "SYSTEM");
    
    if (isSystemCommand)
    {
        // Processar comandos do sistema
        switch (command)
        {
            case "createitem":
                return ExecuteCreateItem(tokens);
            case "createvehicle":
                return ExecuteCreateVehicle(tokens);
            case "createcontainer":
                return ExecuteCreateContainer(tokens);
            case "createweapon":
                return ExecuteCreateWeapon(tokens);
            case "scanobjects":
                InitWorldTracking();
                return true;
            case "checkvehicle":
                if (tokens.Count() < 4)
                {
                    WriteToLog("ExecuteCommand(): checkvehicle requer vehicle_id e request_id", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }
                
                string vehicleIdentifierParam = tokens[2];
                string vehicleRequestId = tokens[3];
                
                string sanitizedVehicleRequestId = SanitizeForJson(vehicleRequestId);
                
                if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
                {
                    string trackingErrorMessage = "Sistema de rastreamento de veículos não inicializado";
                    WriteToLog("ExecuteCommand(): checkvehicle - " + trackingErrorMessage, LogFile.INIT, false, LogType.ERROR);
                    
                    string trackingErrorJson = "{\"request_id\":\"" + sanitizedVehicleRequestId + "\",\"command\":\"checkvehicle\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(trackingErrorMessage) + "\"}";
                    AppendCommandResult(trackingErrorJson, false);
                    return false;
                }
                
                CarScript trackedVehicle = null;
                foreach (CarScript candidateVehicle : m_TrackedVehicles)
                {
                    if (!candidateVehicle)
                        continue;
                    
                    int pidLow1 = 0;
                    int pidLow2 = 0;
                    int pidHigh1 = 0;
                    int pidHigh2 = 0;
                    candidateVehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
                    
                    bool hasPersistent = (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0);
                    string persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
                    string candidateIdentifier = persistentKey;
                    if (!hasPersistent)
                    {
                        candidateIdentifier = "pending-" + candidateVehicle.GetID().ToString();
                    }
                    
                    if (candidateIdentifier == vehicleIdentifierParam)
                    {
                        trackedVehicle = candidateVehicle;
                        break;
                    }
                }
                
                if (!trackedVehicle)
                {
                    string notFoundMessage = "Veículo não encontrado: " + vehicleIdentifierParam;
                    WriteToLog("ExecuteCommand(): checkvehicle - " + notFoundMessage + " (request_id: " + vehicleRequestId + ")", LogFile.INIT, false, LogType.ERROR);
                    
                    string notFoundJson = "{\"request_id\":\"" + sanitizedVehicleRequestId + "\",\"command\":\"checkvehicle\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(notFoundMessage) + "\"}";
                    AppendCommandResult(notFoundJson, false);
                    return false;
                }
                
                if (trackedVehicle.GetHealth("", "") <= 0)
                {
                    string destroyedMessage = "Veículo está destruído: " + trackedVehicle.GetDisplayName();
                    WriteToLog("ExecuteCommand(): checkvehicle - " + destroyedMessage + " (request_id: " + vehicleRequestId + ")", LogFile.INIT, false, LogType.WARNING);
                    
                    string destroyedJson = "{\"request_id\":\"" + sanitizedVehicleRequestId + "\",\"command\":\"checkvehicle\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(destroyedMessage) + "\"}";
                    AppendCommandResult(destroyedJson, false);
                    return false;
                }
                
                vector trackedPosition = trackedVehicle.GetPosition();
                string vehicleName = trackedVehicle.GetDisplayName();
                float vehicleLifetime = trackedVehicle.GetLifetime();
                float vehicleLifetimeMax = trackedVehicle.GetLifetimeMax();
                
                TStringArray unsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
                foreach (string unsafeChar : unsafeChars)
                {
                    vehicleName.Replace(unsafeChar, "-");
                }
                
                string itemsJson = "";
                string attachmentsJson = "";
                
                if (trackedVehicle && trackedVehicle.GetInventory())
                {
                    CargoBase vehicleCargo = trackedVehicle.GetInventory().GetCargo();
                    if (vehicleCargo)
                    {
                        for (int cargoIndex = 0; cargoIndex < vehicleCargo.GetItemCount(); cargoIndex++)
                        {
                            EntityAI cargoItem = vehicleCargo.GetItem(cargoIndex);
                            if (!cargoItem)
                                continue;
                            
                            string cargoType = cargoItem.GetType();
                            foreach (string unsafeCharItem : unsafeChars)
                            {
                                cargoType.Replace(unsafeCharItem, "-");
                            }
                            
                            if (itemsJson != "")
                                itemsJson = itemsJson + ",";
                            
                            itemsJson = itemsJson + "{\"type\":\"" + SanitizeForJson(cargoType) + "\",\"health\":" + cargoItem.GetHealth("", "").ToString() + "}";
                        }
                    }
                    
                    int attachmentCount = trackedVehicle.GetInventory().AttachmentCount();
                    for (int attachmentIndex = 0; attachmentIndex < attachmentCount; attachmentIndex++)
                    {
                        EntityAI attachmentItem = trackedVehicle.GetInventory().GetAttachmentFromIndex(attachmentIndex);
                        if (!attachmentItem)
                            continue;
                        
                        string attachmentType = attachmentItem.GetType();
                        foreach (string unsafeCharAttachment : unsafeChars)
                        {
                            attachmentType.Replace(unsafeCharAttachment, "-");
                        }
                        
                        if (attachmentsJson != "")
                            attachmentsJson = attachmentsJson + ",";
                        
                        attachmentsJson = attachmentsJson + "{\"type\":\"" + SanitizeForJson(attachmentType) + "\",\"health\":" + attachmentItem.GetHealth("", "").ToString() + "}";
                    }
                }
                
                string healthPartsJson = BuildVehicleHealthPartsJson(trackedVehicle);
                
                int pidLow1Result = 0;
                int pidLow2Result = 0;
                int pidHigh1Result = 0;
                int pidHigh2Result = 0;
                trackedVehicle.GetPersistentID(pidLow1Result, pidLow2Result, pidHigh1Result, pidHigh2Result);
                bool hasPersistentResult = (pidLow1Result != 0 || pidLow2Result != 0 || pidHigh1Result != 0 || pidHigh2Result != 0);
                string persistentKeyResult = pidLow1Result.ToString() + "-" + pidLow2Result.ToString() + "-" + pidHigh1Result.ToString() + "-" + pidHigh2Result.ToString();
                string finalVehicleIdentifier = persistentKeyResult;
                if (!hasPersistentResult)
                {
                    finalVehicleIdentifier = "pending-" + trackedVehicle.GetID().ToString();
                }
                
                string sanitizedVehicleIdentifier = SanitizeForJson(finalVehicleIdentifier);
                string sanitizedVehicleName = SanitizeForJson(vehicleName);
                
                string posXStr = trackedPosition[0].ToString();
                string posZStr = trackedPosition[1].ToString();
                string posYStr = trackedPosition[2].ToString();
                
                string vehicleResultJson = "{\"request_id\":\"" + sanitizedVehicleRequestId + "\",\"command\":\"checkvehicle\",\"status\":\"success\"";
                vehicleResultJson = vehicleResultJson + ",\"vehicle_id\":\"" + sanitizedVehicleIdentifier + "\",\"vehicle_name\":\"" + sanitizedVehicleName + "\"";
                vehicleResultJson = vehicleResultJson + ",\"position\":{\"x\":" + posXStr + ",\"z\":" + posZStr + ",\"y\":" + posYStr + "}";
                vehicleResultJson = vehicleResultJson + ",\"items\":[" + itemsJson + "],\"attachments\":[" + attachmentsJson + "]";
                vehicleResultJson = vehicleResultJson + ",\"health_parts\":{" + healthPartsJson + "}";
                vehicleResultJson = vehicleResultJson + ",\"lifetime\":" + vehicleLifetime.ToString() + ",\"lifetime_max\":" + vehicleLifetimeMax.ToString() + "}";
                
                AppendCommandResult(vehicleResultJson, false);
                WriteToLog("ExecuteCommand(): checkvehicle - Dados enviados para veículo " + sanitizedVehicleName + " (request_id: " + vehicleRequestId + ")", LogFile.INIT, false, LogType.INFO);
                
                return true;
            case "checkcontainer":
                if (tokens.Count() < 4)
                {
                    WriteToLog("ExecuteCommand(): checkcontainer requer container_id e request_id", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }
                
                string contIdentifierParam = tokens[2];
                string contRequestId = tokens[3];
                
                string sanitizedContRequestId = SanitizeForJson(contRequestId);
                
                if (!m_TrackedContainers || m_TrackedContainers.Count() == 0)
                {
                    string contTrackingErrorMessage = "Sistema de rastreamento de containers não inicializado";
                    WriteToLog("ExecuteCommand(): checkcontainer - " + contTrackingErrorMessage, LogFile.INIT, false, LogType.ERROR);
                    
                    string contTrackingErrorJson = "{\"request_id\":\"" + sanitizedContRequestId + "\",\"command\":\"checkcontainer\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(contTrackingErrorMessage) + "\"}";
                    AppendCommandResult(contTrackingErrorJson, false);
                    return false;
                }
                
                EntityAI contTrackedContainer = null;
                foreach (EntityAI contCandidateContainer : m_TrackedContainers)
                {
                    if (!contCandidateContainer)
                        continue;
                    
                    int contPidLow1 = 0;
                    int contPidLow2 = 0;
                    int contPidHigh1 = 0;
                    int contPidHigh2 = 0;
                    contCandidateContainer.GetPersistentID(contPidLow1, contPidLow2, contPidHigh1, contPidHigh2);
                    
                    bool contHasPersistent = (contPidLow1 != 0 || contPidLow2 != 0 || contPidHigh1 != 0 || contPidHigh2 != 0);
                    string contPersistentKey = contPidLow1.ToString() + "-" + contPidLow2.ToString() + "-" + contPidHigh1.ToString() + "-" + contPidHigh2.ToString();
                    string contCandidateIdentifier = contPersistentKey;
                    if (!contHasPersistent)
                    {
                        contCandidateIdentifier = "pending-" + contCandidateContainer.GetID().ToString();
                    }
                    
                    if (contCandidateIdentifier == contIdentifierParam)
                    {
                        contTrackedContainer = contCandidateContainer;
                        break;
                    }
                }
                
                if (!contTrackedContainer)
                {
                    string contNotFoundMessage = "Container não encontrado: " + contIdentifierParam;
                    WriteToLog("ExecuteCommand(): checkcontainer - " + contNotFoundMessage + " (request_id: " + contRequestId + ")", LogFile.INIT, false, LogType.ERROR);
                    
                    string contNotFoundJson = "{\"request_id\":\"" + sanitizedContRequestId + "\",\"command\":\"checkcontainer\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(contNotFoundMessage) + "\"}";
                    AppendCommandResult(contNotFoundJson, false);
                    return false;
                }
                
                if (contTrackedContainer.GetHealth("", "") <= 0)
                {
                    string contDestroyedMessage = "Container está destruído: " + contTrackedContainer.GetType();
                    WriteToLog("ExecuteCommand(): checkcontainer - " + contDestroyedMessage + " (request_id: " + contRequestId + ")", LogFile.INIT, false, LogType.WARNING);
                    
                    string contDestroyedJson = "{\"request_id\":\"" + sanitizedContRequestId + "\",\"command\":\"checkcontainer\",\"status\":\"error\",\"message\":\"" + SanitizeForJson(contDestroyedMessage) + "\"}";
                    AppendCommandResult(contDestroyedJson, false);
                    return false;
                }
                
                vector contTrackedPosition = contTrackedContainer.GetPosition();
                vector contTrackedOrientation = contTrackedContainer.GetOrientation();
                string contType = contTrackedContainer.GetType();
                
                TStringArray contUnsafeChars = {"|", ";", "`", "$", "\"", "'", "\\", "<", ">", "&"};
                foreach (string contUnsafeChar : contUnsafeChars)
                {
                    contType.Replace(contUnsafeChar, "-");
                }
                
                string contItemsJson = "";
                
                if (contTrackedContainer && contTrackedContainer.GetInventory())
                {
                    CargoBase contCargo = contTrackedContainer.GetInventory().GetCargo();
                    if (contCargo)
                    {
                        for (int contCargoIndex = 0; contCargoIndex < contCargo.GetItemCount(); contCargoIndex++)
                        {
                            EntityAI contCargoItem = contCargo.GetItem(contCargoIndex);
                            if (!contCargoItem)
                                continue;
                            
                            string contCargoType = contCargoItem.GetType();
                            foreach (string contUnsafeCharItem : contUnsafeChars)
                            {
                                contCargoType.Replace(contUnsafeCharItem, "-");
                            }
                            
                            if (contItemsJson != "")
                                contItemsJson = contItemsJson + ",";
                            
                            contItemsJson = contItemsJson + "{\"type\":\"" + SanitizeForJson(contCargoType) + "\",\"health\":" + contCargoItem.GetHealth("", "").ToString() + "}";
                        }
                    }
                    
                    int contAttachmentCount = contTrackedContainer.GetInventory().AttachmentCount();
                    for (int contAttachmentIndex = 0; contAttachmentIndex < contAttachmentCount; contAttachmentIndex++)
                    {
                        EntityAI contAttachmentItem = contTrackedContainer.GetInventory().GetAttachmentFromIndex(contAttachmentIndex);
                        if (!contAttachmentItem)
                            continue;
                        
                        string contAttachmentType = contAttachmentItem.GetType();
                        foreach (string contUnsafeCharAttachment : contUnsafeChars)
                        {
                            contAttachmentType.Replace(contUnsafeCharAttachment, "-");
                        }
                        
                        if (contItemsJson != "")
                            contItemsJson = contItemsJson + ",";
                        
                        contItemsJson = contItemsJson + "{\"type\":\"" + SanitizeForJson(contAttachmentType) + "\",\"health\":" + contAttachmentItem.GetHealth("", "").ToString() + "}";
                    }
                }
                
                int contPidLow1Result = 0;
                int contPidLow2Result = 0;
                int contPidHigh1Result = 0;
                int contPidHigh2Result = 0;
                contTrackedContainer.GetPersistentID(contPidLow1Result, contPidLow2Result, contPidHigh1Result, contPidHigh2Result);
                bool contHasPersistentResult = (contPidLow1Result != 0 || contPidLow2Result != 0 || contPidHigh1Result != 0 || contPidHigh2Result != 0);
                string contPersistentKeyResult = contPidLow1Result.ToString() + "-" + contPidLow2Result.ToString() + "-" + contPidHigh1Result.ToString() + "-" + contPidHigh2Result.ToString();
                string contFinalIdentifier = contPersistentKeyResult;
                if (!contHasPersistentResult)
                {
                    contFinalIdentifier = "pending-" + contTrackedContainer.GetID().ToString();
                }
                
                string contSanitizedIdentifier = SanitizeForJson(contFinalIdentifier);
                string contSanitizedType = SanitizeForJson(contType);
                
                string contPosXStr = contTrackedPosition[0].ToString();
                string contPosZStr = contTrackedPosition[1].ToString();
                string contPosYStr = contTrackedPosition[2].ToString();
                
                string contOriXStr = contTrackedOrientation[0].ToString();
                string contOriYStr = contTrackedOrientation[1].ToString();
                string contOriZStr = contTrackedOrientation[2].ToString();
                
                string contResultJson = "{\"request_id\":\"" + sanitizedContRequestId + "\",\"command\":\"checkcontainer\",\"status\":\"success\"";
                contResultJson = contResultJson + ",\"container_id\":\"" + contSanitizedIdentifier + "\",\"container_type\":\"" + contSanitizedType + "\"";
                contResultJson = contResultJson + ",\"position\":{\"x\":" + contPosXStr + ",\"z\":" + contPosZStr + ",\"y\":" + contPosYStr + "}";
                contResultJson = contResultJson + ",\"orientation\":{\"x\":" + contOriXStr + ",\"y\":" + contOriYStr + ",\"z\":" + contOriZStr + "}";
                contResultJson = contResultJson + ",\"items\":[" + contItemsJson + "]}";
                
                AppendCommandResult(contResultJson, false);
                WriteToLog("ExecuteCommand(): checkcontainer - Dados enviados para container " + contSanitizedType + " (request_id: " + contRequestId + ")", LogFile.INIT, false, LogType.INFO);
                
                return true;
            case "checkfence":
                if (tokens.Count() < 4)
                {
                    WriteToLog("ExecuteCommand(): checkfence requer fence_id e request_id", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }
                
                return ExecuteCheckFenceCommand(playerID, tokens[2], tokens[3]);
            case "scanregion":
                if (tokens.Count() < 7)
                {
                    WriteToLog("ExecuteCommand(): scanregion requer coordenadas X Y Z, raio e request_id", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }
                
                float scanCoordX = tokens[2].ToFloat();
                float scanCoordZ = tokens[3].ToFloat();
                float scanCoordY = tokens[4].ToFloat();
                float scanRadius = tokens[5].ToFloat();
                string scanRequestId = tokens[6];
                
                if (scanRadius <= 0 || scanRadius > 100)
                {
                    WriteToLog("ExecuteCommand(): scanregion - Raio inválido: " + scanRadius.ToString() + " (deve estar entre 1 e 100)", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }
                
                vector scanPosition = Vector(scanCoordX, scanCoordY, scanCoordZ);
                
                WriteToLog("ExecuteCommand(): scanregion - Escaneando região em " + scanPosition.ToString() + " (raio: " + scanRadius.ToString() + "m, request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.INFO);
                
                array<Object> scannedObjects = new array<Object>();
                GetGame().GetObjectsAtPosition(scanPosition, scanRadius, scannedObjects, null);
                
                // TODO: Considerar adicionar verificação adicional de veículos rastreados (m_TrackedVehicles)
                // que estão dentro do raio do scan, pois GetObjectsAtPosition pode não retornar
                // veículos em certos estados (danificados, etc.). Isso garantiria que veículos
                // rastreados sejam incluídos mesmo que não sejam retornados pelo GetObjectsAtPosition.
                // AVISO: Testar impacto na performance antes de implementar.
                
                if (!scannedObjects || scannedObjects.Count() == 0)
                {
                    string emptyResultJson = "{\"request_id\":\"" + SanitizeForJson(scanRequestId) + "\",\"command\":\"scanregion\",\"center\":{\"x\":" + scanCoordX.ToString() + ",\"y\":" + scanCoordY.ToString() + ",\"z\":" + scanCoordZ.ToString() + "},\"radius\":" + scanRadius.ToString() + ",\"objects\":[]}";
                    AppendCommandResult(emptyResultJson, false);
                    WriteToLog("ExecuteCommand(): scanregion - Nenhum objeto encontrado na região (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.INFO);
                    return true;
                }
                
                WriteToLog("ExecuteCommand(): scanregion - Total de objetos encontrados pelo GetObjectsAtPosition: " + scannedObjects.Count().ToString() + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                
                // Logar todos os tipos de objetos encontrados ANTES dos filtros (para diagnóstico)
                string allTypesList = "";
                int allTypesCount = 0;
                int maxTypesToLog = 100; // Limitar a 100 tipos para não poluir muito
                
                foreach (Object objForType : scannedObjects)
                {
                    if (!objForType)
                        continue;
                    
                    string objTypeForLog = objForType.GetType();
                    if (objTypeForLog.Length() > 0 && allTypesCount < maxTypesToLog)
                    {
                        if (allTypesList != "")
                            allTypesList = allTypesList + ", ";
                        allTypesList = allTypesList + objTypeForLog;
                        allTypesCount++;
                    }
                }
                
                if (allTypesList.Length() > 0)
                {
                    WriteToLog("ExecuteCommand(): scanregion - Todos os tipos de objetos encontrados (antes dos filtros, " + allTypesCount.ToString() + " tipos): " + allTypesList + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                }
                
                // Coletar tipos únicos de objetos para debug (limitar a 50 tipos para não poluir muito)
                array<string> uniqueTypes = new array<string>();
                int typesLogged = 0;
                
                string objectsJson = "";
                int objectCount = 0;
                int filteredCount = 0;
                int natureFilteredCount = 0;
                int notDetectedCount = 0;
                
                foreach (Object scannedObj : scannedObjects)
                {
                    if (!scannedObj)
                        continue;
                    
                    // Filtrar objetos: excluir jogadores, edifícios estáticos, objetos do sistema
                    if (scannedObj.IsMan() || scannedObj.IsInherited(PlayerBase))
                    {
                        filteredCount++;
                        continue;
                    }
                    
                    if (scannedObj.IsInherited(BuildingBase) || scannedObj.IsInherited(House))
                    {
                        filteredCount++;
                        continue;
                    }
                    
                    // Obter informações do objeto
                    string objType = scannedObj.GetType();
                    
                    // Coletar tipos únicos para debug (limitar a 50)
                    if (typesLogged < 50 && objType.Length() > 0)
                    {
                        bool typeExists = false;
                        for (int typeIdx = 0; typeIdx < uniqueTypes.Count(); typeIdx++)
                        {
                            if (uniqueTypes.Get(typeIdx) == objType)
                            {
                                typeExists = true;
                                break;
                            }
                        }
                        if (!typeExists)
                        {
                            uniqueTypes.Insert(objType);
                            typesLogged++;
                        }
                    }
                    
                    // Filtrar objetos de natureza (árvores, arbustos, pedras, rochas)
                    bool isNatureObject = false;
                    string natureFilterReason = "";
                    
                    if (objType.Length() > 0)
                    {
                        // Verificar prefixos de natureza
                        if (objType.Length() >= 8 && objType.Substring(0, 8) == "BushSoft")
                        {
                            isNatureObject = true;
                            natureFilterReason = "BushSoft prefix";
                        }
                        else if (objType.Length() >= 8 && objType.Substring(0, 8) == "BushHard")
                        {
                            isNatureObject = true;
                            natureFilterReason = "BushHard prefix";
                        }
                        else if (objType.Length() >= 8 && objType.Substring(0, 8) == "TreeSoft")
                        {
                            isNatureObject = true;
                            natureFilterReason = "TreeSoft prefix";
                        }
                        else if (objType.Length() >= 8 && objType.Substring(0, 8) == "TreeHard")
                        {
                            isNatureObject = true;
                            natureFilterReason = "TreeHard prefix";
                        }
                        // Verificar prefixos de pedras e rochas estáticas
                        else if (objType.Length() >= 12 && objType.Substring(0, 12) == "Static_rock_")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Static_rock_ prefix";
                        }
                        else if (objType.Length() >= 13 && objType.Substring(0, 13) == "Static_stone")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Static_stone prefix";
                        }
                        else if (objType.Length() >= 14 && objType.Substring(0, 14) == "Static_stones_")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Static_stones_ prefix";
                        }
                        // Verificar objetos específicos de pedras e rochas
                        else if (objType == "Static_stone5")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        else if (objType == "Static_stone4")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        else if (objType == "Static_stones_erosion")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        else if (objType == "Static_rock_spike1")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        else if (objType == "Static_rock_wallh1")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        else if (objType == "Static_rock_monolith1")
                        {
                            isNatureObject = true;
                            natureFilterReason = "Specific static rock/stone";
                        }
                        // Verificar se contém palavras-chave de natureza
                        else if (objType.Contains("Tree"))
                        {
                            isNatureObject = true;
                            natureFilterReason = "Contains 'Tree'";
                        }
                        else if (objType.Contains("Bush"))
                        {
                            isNatureObject = true;
                            natureFilterReason = "Contains 'Bush'";
                        }
                        else if (objType.Contains("Static_rock"))
                        {
                            isNatureObject = true;
                            natureFilterReason = "Contains 'Static_rock'";
                        }
                        else if (objType.Contains("Static_stone"))
                        {
                            isNatureObject = true;
                            natureFilterReason = "Contains 'Static_stone'";
                        }
                    }
                    
                    if (isNatureObject)
                    {
                        natureFilteredCount++;
                        WriteToLog("ExecuteCommand(): scanregion - Objeto filtrado (natureza): " + objType + " - Razão: " + natureFilterReason + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                        continue;
                    }
                    
                    string objName = "";
                    
                    // Tentar obter nome do objeto
                    // Primeiro tentar cast direto de CarScript (como em VehicleTracking.c)
                    // Isso captura veículos que podem não ser detectados como IsInherited(CarScript)
                    CarScript scanVehicle = CarScript.Cast(scannedObj);
                    if (scanVehicle)
                    {
                        objName = scanVehicle.GetDisplayName();
                        WriteToLog("ExecuteCommand(): scanregion - Veículo detectado: " + objType + " (" + objName + ") em " + scanVehicle.GetPosition().ToString() + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                    }
                    else if (scannedObj.IsInherited(ItemBase))
                    {
                        ItemBase scanItemBase = ItemBase.Cast(scannedObj);
                        if (scanItemBase)
                        {
                            objName = scanItemBase.GetDisplayName();
                        }
                    }
                    else
                    {
                        // Para containers e outros objetos, usar EntityAI
                        EntityAI scanEntity = EntityAI.Cast(scannedObj);
                        if (scanEntity)
                        {
                            objName = scanEntity.GetDisplayName();
                        }
                    }
                    
                    if (objName == "")
                    {
                        objName = objType;
                        // Se não conseguiu obter nome e não é um tipo vazio, pode ser um objeto não detectado
                        if (objType.Length() > 0)
                        {
                            notDetectedCount++;
                            WriteToLog("ExecuteCommand(): scanregion - Objeto não detectado como veículo/item/container: " + objType + " em " + scannedObj.GetPosition().ToString() + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                        }
                    }
                    
                    vector objPosition = scannedObj.GetPosition();
                    
                    string scanSanitizedType = SanitizeForJson(objType);
                    string scanSanitizedName = SanitizeForJson(objName);
                    
                    if (objectsJson != "")
                        objectsJson = objectsJson + ",";
                    
                    objectsJson = objectsJson + "{\"type\":\"" + scanSanitizedType + "\",\"name\":\"" + scanSanitizedName + "\",\"position\":{\"x\":" + objPosition[0].ToString() + ",\"y\":" + objPosition[1].ToString() + ",\"z\":" + objPosition[2].ToString() + "}}";
                    
                    objectCount++;
                }
                
                // Logar tipos únicos encontrados
                if (uniqueTypes.Count() > 0)
                {
                    string typesList = "";
                    for (int i = 0; i < uniqueTypes.Count() && i < 50; i++)
                    {
                        if (typesList != "")
                            typesList = typesList + ", ";
                        typesList = typesList + uniqueTypes.Get(i);
                    }
                    WriteToLog("ExecuteCommand(): scanregion - Tipos únicos de objetos encontrados (" + uniqueTypes.Count().ToString() + "): " + typesList + " (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.DEBUG);
                }
                
                string scanSanitizedRequestId = SanitizeForJson(scanRequestId);
                string scanResultJson = "{\"request_id\":\"" + scanSanitizedRequestId + "\",\"command\":\"scanregion\",\"center\":{\"x\":" + scanCoordX.ToString() + ",\"y\":" + scanCoordY.ToString() + ",\"z\":" + scanCoordZ.ToString() + "},\"radius\":" + scanRadius.ToString() + ",\"objects\":[" + objectsJson + "]}";
                
                AppendCommandResult(scanResultJson, false);
                
                WriteToLog("ExecuteCommand(): scanregion - Escaneamento concluído: " + objectCount.ToString() + " objetos processados, " + filteredCount.ToString() + " objetos filtrados (jogadores/edifícios), " + natureFilteredCount.ToString() + " objetos filtrados (natureza), " + notDetectedCount.ToString() + " objetos não detectados (request_id: " + scanRequestId + ")", LogFile.INIT, false, LogType.INFO);
                
                return true;
            case "registerfence":
                if (tokens.Count() < 5)
                {
                    WriteToLog("ExecuteCommand(): registerfence requer coordenadas X Z Y", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }

                float regFencePosX = tokens[2].ToFloat();
                float regFencePosZ = tokens[3].ToFloat();
                float regFencePosY = tokens[4].ToFloat();
                vector regFencePosition = Vector(regFencePosX, regFencePosY, regFencePosZ);

                float regFenceSearchRadius = 3.0;
                if (tokens.Count() >= 6)
                {
                    float regFenceCandidateRadius = tokens[5].ToFloat();
                    if (regFenceCandidateRadius > 0)
                        regFenceSearchRadius = regFenceCandidateRadius;
                }

                bool regFenceRegistered = RegisterFenceAtPosition(regFencePosition, regFenceSearchRadius);
                if (regFenceRegistered)
                {
                    WriteToLog("ExecuteCommand(): registerfence executado com sucesso em " + regFencePosition.ToString() + " (raio=" + regFenceSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.INFO);
                    return true;
                }

                WriteToLog("ExecuteCommand(): registerfence falhou em encontrar fence em " + regFencePosition.ToString() + " (raio=" + regFenceSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
                return false;
            case "registerwatchtower":
                if (tokens.Count() < 5)
                {
                    WriteToLog("ExecuteCommand(): registerwatchtower requer coordenadas X Z Y", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }

                float watchtowerPosX = tokens[2].ToFloat();
                float watchtowerPosZ = tokens[3].ToFloat();
                float watchtowerPosY = tokens[4].ToFloat();
                vector watchtowerPosition = Vector(watchtowerPosX, watchtowerPosY, watchtowerPosZ);

                float watchtowerSearchRadius = 10.0; // Aumentado para 10.0 (igual ao da flag)
                if (tokens.Count() >= 6)
                {
                    float candidateWatchtowerRadius = tokens[5].ToFloat();
                    if (candidateWatchtowerRadius > 0)
                        watchtowerSearchRadius = candidateWatchtowerRadius;
                }

                bool watchtowerRegistered = RegisterWatchtowerAtPosition(watchtowerPosition, watchtowerSearchRadius);
                if (watchtowerRegistered)
                {
                    WriteToLog("ExecuteCommand(): registerwatchtower executado com sucesso em " + watchtowerPosition.ToString() + " (raio=" + watchtowerSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.INFO);
                    return true;
                }

                WriteToLog("ExecuteCommand(): registerwatchtower falhou em encontrar watchtower em " + watchtowerPosition.ToString() + " (raio=" + watchtowerSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
                return false;
            case "registerflag":
                if (tokens.Count() < 5)
                {
                    WriteToLog("ExecuteCommand(): registerflag requer coordenadas X Z Y", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }

                float flagPosX = tokens[2].ToFloat();
                float flagPosZ = tokens[3].ToFloat();
                float flagPosY = tokens[4].ToFloat();
                vector flagPosition = Vector(flagPosX, flagPosY, flagPosZ);

                float flagSearchRadius = 10.0;
                if (tokens.Count() >= 6)
                {
                    float candidateFlagRadius = tokens[5].ToFloat();
                    if (candidateFlagRadius > 0)
                        flagSearchRadius = candidateFlagRadius;
                }

                bool flagRegistered = RegisterFlagAtPosition(flagPosition, flagSearchRadius);
                if (flagRegistered)
                {
                    WriteToLog("ExecuteCommand(): registerflag executado com sucesso em " + flagPosition.ToString() + " (raio=" + flagSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.INFO);
                    return true;
                }

                WriteToLog("ExecuteCommand(): registerflag falhou em encontrar flag em " + flagPosition.ToString() + " (raio=" + flagSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
                return false;
            case "teleportvehicle":
                return ExecuteTeleportVehicle(tokens);
            case "flipvehicle":
                return ExecuteFlipVehicle(tokens);
            case "teleportcontainer":
                return ExecuteTeleportContainer(tokens);
            case "deleteentity":
                return ExecuteDeleteEntity(tokens);
            case "registercontainer":
                if (tokens.Count() < 5)
                {
                    WriteToLog("ExecuteCommand(): registercontainer requer coordenadas X Z Y", LogFile.INIT, false, LogType.ERROR);
                    return false;
                }

                float containerPosX = tokens[2].ToFloat();
                float containerPosZ = tokens[3].ToFloat();
                float containerPosY = tokens[4].ToFloat();
                vector containerPosition = Vector(containerPosX, containerPosY, containerPosZ);

                float containerSearchRadius = 3.0;
                if (tokens.Count() >= 6)
                {
                    float candidateContainerRadius = tokens[5].ToFloat();
                    if (candidateContainerRadius > 0)
                        containerSearchRadius = candidateContainerRadius;
                }

                bool containerRegistered = RegisterContainerAtPosition(containerPosition, containerSearchRadius);
                if (containerRegistered)
                {
                    WriteToLog("ExecuteCommand(): registercontainer executado com sucesso em " + containerPosition.ToString() + " (raio=" + containerSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.INFO);
                    return true;
                }

                WriteToLog("ExecuteCommand(): registercontainer falhou em encontrar container em " + containerPosition.ToString() + " (raio=" + containerSearchRadius.ToString() + ")", LogFile.INIT, false, LogType.WARNING);
                return false;
            default:
                WriteToLog("Comando do sistema desconhecido: " + command, LogFile.INIT, false, LogType.ERROR);
                return false;
        }
    }
    
    // Comandos que requerem jogador online
    PlayerBase target = null;
    array<Man> players = {};
    GetGame().GetPlayers(players);

    WriteToLog("ExecuteCommand(): Encontrados " + players.Count() + " jogadores.", LogFile.INIT, false, LogType.DEBUG);

    foreach (Man man : players)
    {
        PlayerBase player = PlayerBase.Cast(man);
        if (player && player.GetIdentity() && player.GetIdentity().GetId() == playerID)
        {
            target = player;
            break;
        }
    }

    if (!target || !target.IsAlive()) 
        return false;
    
    if (tokens.Count() >= 3)
    {
        string params = tokens[2];
        for (int iC = 0; iC < tokens.Count(); iC++) {
            if (iC < 4)
                continue;

            params = params + " " + tokens[iC];
        }
        string commandFull = command + " " + params;
        WriteToLog("PlayerID " + target.GetIdentity().GetName() + " (" + playerID + ")" + " digitou comando " + commandFull, LogFile.INIT, false, LogType.INFO);
    } else {
        WriteToLog("PlayerID " + target.GetIdentity().GetName() + " (" + playerID + ")" + " digitou comando " + command, LogFile.INIT, false, LogType.INFO);
    }

    switch (command)
    {
        case "help":
            if (IsDeathmatchEnabled) {
                SendPrivateMessage(playerID, "!loadouts -> Lista loadouts configurados", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!loadout meuloadout1' -> Ativa meuloadout1", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!loadout reset -> Gera nova senha aleatória para acessar o sistema de loadout: " + UrlAppPython, MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!maps -> Lista mapas disponíveis", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!votemap 1 -> Vota no mapa 1", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!players -> Lista jogadores online", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!kill -> Cometer suicídio", MessageColor.FRIENDLY);
            }
            
            if (CheckIfIsAdmin(playerID))
            {                
                SendPrivateMessage(playerID, "!heal -> Se cura", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!godmode -> Ativa godmode", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!ungodmode -> Desativa godmode", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!giveitem nomeitem 2 -> Cria 2 itens", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!spawnvehicle Sedan_02 -> Cria veículo", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!construct Land_Container_1Bo 1.0 1 6.0 90.0-> Cria 1 objeto container na altura de 1.0 m, 6.0 m de tamanho e angulo de 90 graus", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!settime 6 30 -> Altera o horário para as 06:30", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!setweather clear -> Altera o tempo para limpo. Opções: clear, cloudy, rain, foggy ou default", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!teleport 100.0 100.0 100.0 -> Teleporta para a posição 100.0, 100.0, 100.0", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!getposition -> Mostra posição atual", MessageColor.FRIENDLY);         
                SendPrivateMessage(playerID, "!goup 10.0 -> Eleva o jogador para 10.0 metros", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!setheight 10.0 -> Ajusta a altura do jogador para 10.0 metros", MessageColor.FRIENDLY);
            }
            break;
        case "teleport":            
            // Formato: PlayerID teleport CoordX CoordZ CoordY [AlturaOpcional]
            if (tokens.Count() >= 4)
            {
                vector posT = Vector(tokens[2].ToFloat(), 0, tokens[4].ToFloat()); // X e Y (CoordZ é Y)
                
                // Se altura foi fornecida, usar. Caso contrário, calcular automaticamente
                if (tokens.Count() >= 5 && tokens[3].ToFloat() != 0)
                {
                    posT[1] = tokens[3].ToFloat(); // Usar altura fornecida
                    WriteToLog("Usando altura fornecida: " + posT[1].ToString(), LogFile.INIT, false, LogType.INFO);
                }
                else
                {
                    // Calcular altura do terreno automaticamente
                    posT[1] = GetGame().SurfaceY(posT[0], posT[2]);
                    WriteToLog("Ajustando altura automaticamente para: " + posT[1].ToString(), LogFile.INIT, false, LogType.INFO);
                }
                
                target.SetPosition(posT);
                target.MessageStatus("Você foi teleportado");
                WriteToLog("Jogador " + playerID + " teleportado para X=" + posT[0].ToString() + " Y=" + posT[2].ToString() + " Z=" + posT[1].ToString(), LogFile.INIT, false, LogType.INFO);
            }
            break;

        case "heal":
            target.SetHealth("", "", 100);
            target.SetHealth("GlobalHealth", "Blood", 5000);
            target.SetHealth("GlobalHealth", "Shock", 5000);
            target.GetStatEnergy().Set(4000);
            target.GetStatWater().Set(4000);
            target.MessageStatus("Você foi curado");
            break;

        case "kill":
            target.SetAllowDamage(true);
            target.SetHealth("", "", 0);
            target.MessageStatus("Você foi eliminado");
            break;

        case "godmode":
            target.SetAllowDamage(false);
            target.MessageStatus("God Mode ativado");
            break;

        case "ungodmode":
            target.SetAllowDamage(true);
            target.MessageStatus("God Mode desativado");
            break;

        case "giveitem":    
            if (tokens.Count() >= 3)
            {
                string itemName = tokens[2];
                int limit = 1;
                if (tokens.Count() == 4)
                {
                    if (IsInteger(tokens[3]))
                        limit = tokens[3].ToInt();
                }
                for (int n = 1; n <= limit; n++)
                {
                    EntityAI item = target.GetInventory().CreateInInventory(itemName);
                    if (!item)
                        item = EntityAI.Cast(GetGame().CreateObject(itemName, target.GetPosition(), false, true));

                    if (item)
                    {
                        target.MessageStatus("Item recebido: " + itemName);
                        
                        if (IsContainerType(itemName))
                        {
                            RegisterContainer(item);
                        }
                        
                        if (IsVehicle(item))
                        {
                            RegisterVehicle(item);
                        }
                    }
                    else
                    {
                        target.MessageStatus("Erro ao criar item: " + itemName);
                        WriteToLog("Erro ao criar item: " + itemName, LogFile.INIT, false, LogType.ERROR);
                    }
                }
            }
                
            break;

        case "spawnvehicle":
            if (tokens.Count() == 3)
            {
                string vehicleType = tokens[2];
                SpawnVehicleWithPartsToPlayer(target, vehicleType);
            }
            break;

        case "createcontainer":
            ExecuteCreateContainer(tokens, target);
            target.MessageStatus("Container criado na sua posição");
            break;

        case "createweapon":
            ExecuteCreateWeapon(tokens, target);
            target.MessageStatus("Arma criada na sua posição");
            break;

        case "ghostmode":
            ApplyGhostMode(target, true);
            target.MessageStatus("Você está invisível");
            break;

        case "unghostmode":
            ApplyGhostMode(target, false);
            target.MessageStatus("Você está visível");
            break;

        case "kick":            
            PlayerIdentity identity = target.GetIdentity();
            string kickedPlayerName = target.GetIdentity().GetName();
            string kickedPlayerId = target.GetIdentity().GetId();
            string kickedSteamId = target.GetIdentity().GetPlainId();
            
            WriteToLog("ExecuteCommand(): !kick - Desconectando jogador: " + kickedPlayerName + " (PlayerID: " + kickedPlayerId + ", SteamID: " + kickedSteamId + ")", LogFile.INIT, false, LogType.INFO);
            target.MessageStatus("Seu jogador está bugado. Realizando ajuste...");
            GetGame().DisconnectPlayer(identity, kickedPlayerId);
            WriteToLog("ExecuteCommand(): !kick - Jogador desconectado com sucesso. Limpeza automática será realizada no próximo ciclo.", LogFile.INIT, false, LogType.INFO);
            break;

        case "desbug":
            vector currentPos = target.GetPosition();
            float offsetX = Math.RandomFloatInclusive(-1.0, 1.0);
            float offsetY = Math.RandomFloatInclusive(-0.5, 0.5);
            float offsetZ = Math.RandomFloatInclusive(-1.0, 1.0);
            vector newPos = currentPos + Vector(offsetX, offsetY, offsetZ);
            target.SetPosition(newPos);
            target.SetOrientation(target.GetOrientation());
            target.Update();
            target.MessageStatus("Posição ajustada: " + newPos.ToString());
            break;

        case "getposition":
            vector posP = target.GetPosition();
            target.MessageStatus("Posição atual: " + posP.ToString());
            WriteToLog(posP.ToString(), LogFile.POSITION, false);
            WriteToLog("Posição capturada: " + posP.ToString(), LogFile.INIT, false, LogType.DEBUG);
            break;
            case "construct":
            if (tokens.Count() >= 3)
            {
                float heightOffset = 1.0;
                int containerCount = 4;
                float containerLength = 6.0;
                float rotationOffset = 0.0;

                if (tokens.Count() >= 4)
                    heightOffset = tokens[3].ToFloat();

                if (tokens.Count() >= 5)
                    containerCount = tokens[4].ToInt();
                
                if (tokens.Count() >= 6)
                    containerLength = tokens[5].ToFloat();

                if (tokens.Count() >= 7)
                    rotationOffset = tokens[6].ToFloat();

                string buildName = tokens[2];
                CreateCustomObject(target, buildName, heightOffset, containerCount, containerLength, rotationOffset);
            }
            break;        
        case "votemap":
            if (tokens.Count() < 3) {
                g_VoteMapManager.CheckVotingStatus(playerID);                 
                return false;
            }

            if (!IsInteger(tokens[2])) {
                SendPrivateMessage(playerID, "ID do mapa é inválido", MessageColor.WARNING);
                return false;
            }

            int regionId = tokens[2].ToInt();
            g_VoteMapManager.CheckIfVotingAndStart(playerID, regionId);
            break;   
        case "nextmap":  
            SendPrivateMessage(playerID, "O próximo mapa será " + nextMap.Region, MessageColor.FRIENDLY);
            break;
        case "maps":          
            foreach (ref SafeZoneData mapL : maps) {
                if (mapL.IsDeleted)
                    continue;
                string linha = mapL.RegionId.ToString() + " - " + mapL.Region;                
                SendPrivateMessage(playerID, linha, MessageColor.FRIENDLY);
            }
            break;
        case "votekick":
            if (tokens.Count() < 3) {
                g_VoteKickManager.ListarJogadoresOnline(playerID);
                SendPrivateMessage(playerID, "Uso: !votekick <ID do jogador>", MessageColor.WARNING);
                return false;
            }

            if (!IsInteger(tokens[2])) {
                SendPrivateMessage(playerID, "ID inválido.", MessageColor.WARNING);
                return false;
            }

            string targetId = tokens[2];
            PlayerBase targetKick = null;
            foreach (Man manKick : players)
            {
                PlayerBase playerKick = PlayerBase.Cast(manKick);
                if (playerKick && playerKick.GetIdentity() && playerKick.GetIdentity().GetId() == targetId)
                {
                    targetKick = playerKick;
                    break;
                }
            }
            g_VoteKickManager.StartKickVote(playerID, targetId, targetKick.GetIdentity().GetName());
            break;
        case "players":          
            g_VoteKickManager.ListarJogadoresOnline(playerID);
            break;
        case "loadouts":
            //SendPrivateMessage(playerID, "Esse recurso não está disponível no momento", MessageColor.FRIENDLY);
            ShowLoadoutsToPlayer(playerID);
            break;
        case "loadout":
            //SendPrivateMessage(playerID, "Esse recurso não está disponível no momento", MessageColor.FRIENDLY);
            //break;
            if (tokens.Count() < 3) {
                ShowLoadoutsToPlayer(playerID);
                return true;
            }
            if (tokens[2] == "reset")
            {
                WriteToLog("PlayerID " + target.GetIdentity().GetName() + " (" + playerID + ")" + " solicitou reset de senha", LogFile.INIT, false, LogType.INFO);
                SendPrivateMessage(playerID, "Você solicitou a geração de uma nova de senha de acesso! Aguarde um momento..." , MessageColor.WARNING);
                AppendExternalAction("{\"action\":\"reset_password\",\"player_id\":\"" + playerID + "\"}");
                return true;
            }

            string loadoutName = tokens[2];
            LoadoutPlayer loadout = GetLoadoutByName(playerID, loadoutName);
            if (!loadout)
            {
                SendPrivateMessage(playerID, "Nenhum loadout encontrado com esse nome" , MessageColor.WARNING);
                return false;
            }

            WriteToLog("PlayerID " + target.GetIdentity().GetName() + " (" + playerID + ")" + " solicitou ativacao do loadout " + loadoutName, LogFile.INIT, false, LogType.INFO);
            SendPrivateMessage(playerID, "Você solicitou a ativação de um lodout! Aguarde um momento..." , MessageColor.WARNING);
            ActiveLoadoutByName(playerID, loadoutName);
            AppendExternalAction("{\"action\":\"active_loadout\",\"player_id\":\"" + playerID + "\",\"loadout_name\":\"" + loadoutName + "\"}");

            break;
        case "settime":
            if (tokens.Count() < 4 || !IsInteger(tokens[2]) || !IsInteger(tokens[3]))
            {
                SendPrivateMessage(playerID, "Uso: !settime <hora> <minuto> (ex: !settime 6 30)", MessageColor.WARNING);
                return false;
            }

            int newHour = tokens[2].ToInt();
            int newMinute = tokens[3].ToInt();

            if (newHour < 0 || newHour > 23 || newMinute < 0 || newMinute > 59)
            {
                SendPrivateMessage(playerID, "Hora ou minuto inválido. Use valores entre 0-23 e 0-59.", MessageColor.WARNING);
                return false;
            }

            int year, month, day, hour, minute;
            GetGame().GetWorld().GetDate(year, month, day, hour, minute);
            GetGame().GetWorld().SetDate(year, month, day, newHour, newMinute);

            string hourStr = "";
            if (newHour < 10)
                hourStr = "0";
            string minuteStr = "";
            if (newMinute < 10)
                minuteStr = "0";
            string horaFormatada = hourStr + newHour.ToString() + ":" + minuteStr + newMinute.ToString();

            SendPrivateMessage(playerID, "Horário do mundo ajustado para " + horaFormatada, MessageColor.FRIENDLY);
            WriteToLog("Admin " + playerID + " definiu horário do mundo para " + horaFormatada, LogFile.INIT, false, LogType.INFO);
            break;
        case "setweather":
            if (!GetGame().IsServer()) {
                SendPrivateMessage(playerID, "Comando de clima só pode ser executado no servidor.", MessageColor.WARNING);
                return false;
            }

            if (tokens.Count() < 3) { // "!setweather rain" costuma ter 2 tokens
                SendPrivateMessage(playerID, "Uso: !setweather <clear | cloudy | rain | foggy | default>", MessageColor.WARNING);
                return false;
            }

            string clima = tokens[2];
            clima.ToLower();

            Weather weather = GetGame().GetWeather();

            // 1) Tomar controle do clima pela missão
            weather.MissionWeather(true);

            // 2) Destravar limites e tempos, e liberar threshold da chuva
            weather.GetOvercast().SetLimits(0.0, 1.0);
            weather.GetOvercast().SetForecastChangeLimits(0, 0);
            weather.GetOvercast().SetForecastTimeLimits(0, 0);

            weather.GetRain().SetLimits(0.0, 1.0);
            weather.GetRain().SetForecastChangeLimits(0, 0);
            weather.GetRain().SetForecastTimeLimits(0, 0);
            weather.SetRainThresholds(0.0, 1.0, 0);

            weather.GetFog().SetLimits(0.0, 1.0);
            weather.GetFog().SetForecastChangeLimits(0, 0);
            weather.GetFog().SetForecastTimeLimits(0, 0);

            // 3) Aplicar o preset
            if (clima == "clear")
            {
                weather.GetRain().Set(0.0, 1, 0);
                weather.GetOvercast().Set(0.01, 1, 0);
                weather.GetFog().Set(0.0, 1, 0);
                weather.SetWindSpeed(0.0);
                weather.SetWindMaximumSpeed(0.0);
                weather.SetWindFunctionParams(0, 0, 0); // sem variação
            }
            else if (clima == "cloudy")
            {
                weather.GetRain().Set(0.0, 1, 0);
                weather.GetOvercast().Set(0.5, 1, 0);
                weather.GetFog().Set(0.1, 1, 0);
                weather.SetWindSpeed(5.0);
                weather.SetWindMaximumSpeed(5.0);
            }
            else if (clima == "rain")
            {
                // garante overcast alto e chuva forte
                weather.GetOvercast().Set(1.0, 1, 0);
                weather.GetRain().Set(1.0, 1, 0);
                weather.GetFog().Set(0.3, 1, 0);
                weather.SetWindSpeed(12.0);
                weather.SetWindMaximumSpeed(20.0);
            }
            else if (clima == "foggy")
            {
                weather.GetRain().Set(0.0, 1, 0);
                weather.GetOvercast().Set(0.3, 1, 0);
                weather.GetFog().Set(0.7, 1, 0);
                weather.SetWindSpeed(3.0);
                weather.SetWindMaximumSpeed(5.0);
            }
            else if (clima == "default")
            {
                // devolve o controle para a state machine padrão/config XML
                weather.MissionWeather(false);
                SendPrivateMessage(playerID, "Clima voltou para o comportamento padrão/config.", MessageColor.FRIENDLY);
            }
            else
            {
                SendPrivateMessage(playerID, "Clima desconhecido. Use: clear, cloudy, rain, foggy, default", MessageColor.WARNING);
                return false;
            }

            // Feedback (leia atual E forecast)
            float rainA = weather.GetRain().GetActual();
            float rainF = weather.GetRain().GetForecast();
            float overA = weather.GetOvercast().GetActual();
            float overF = weather.GetOvercast().GetForecast();
            float fogA  = weather.GetFog().GetActual();
            float fogF  = weather.GetFog().GetForecast();
            float wind  = weather.GetWindSpeed();

            SendPrivateMessage(playerID, "Clima ajustado para: " + clima, MessageColor.FRIENDLY);
            SendPrivateMessage(playerID, "Rain A/F: " + rainA.ToString() + "/" + rainF.ToString() + " | Overcast A/F: " + overA.ToString() + "/" + overF.ToString() + " | Fog A/F: " + fogA.ToString() + "/" + fogF.ToString() + " | Wind: " + wind.ToString(), MessageColor.FRIENDLY);
            WriteToLog("Admin " + playerID + " ajustou o clima para " + clima, LogFile.INIT, false, LogType.INFO);
            break;
    
        case "scanobjects":
            InitWorldTracking();            
            return true;
        
        case "goup":            
            if (tokens.Count() > 2) {
                float goupHeight = tokens[2].ToFloat();
                
                // Validar altura (deve ser positiva e não muito grande)
                if (goupHeight <= 0)
                {
                    SendPrivateMessage(playerID, "A altura deve ser um valor positivo", MessageColor.WARNING);
                    return false;
                }
                
                if (goupHeight > 10000)
                {
                    SendPrivateMessage(playerID, "A altura máxima permitida é 10000 metros", MessageColor.WARNING);
                    return false;
                }
                
                vector goupCurrentPos = target.GetPosition();
                vector goupNewPos = goupCurrentPos + Vector(0, goupHeight, 0);
                target.SetPosition(goupNewPos);
                target.MessageStatus("Você foi elevado em " + goupHeight.ToString() + " metros");
                WriteToLog("Jogador " + playerID + " elevado em " + goupHeight.ToString() + " metros. Posição final: " + goupNewPos.ToString(), LogFile.INIT, false, LogType.INFO);
            } else {
                SendPrivateMessage(playerID, "Uso: !goup <altura>", MessageColor.WARNING);
                return false;
            }
            break;
        
        case "setheight":            
            if (tokens.Count() > 2) {
                float setheightHeight = tokens[2].ToFloat();
                
                // Validar altura (deve ser positiva e não muito grande)
                if (setheightHeight <= 0)
                {
                    SendPrivateMessage(playerID, "A altura deve ser um valor positivo", MessageColor.WARNING);
                    return false;
                }
                
                if (setheightHeight > 10000)
                {
                    SendPrivateMessage(playerID, "A altura máxima permitida é 10000 metros", MessageColor.WARNING);
                    return false;
                }
                
                vector setheightCurrentPos = target.GetPosition();
                vector setheightNewPos = Vector(setheightCurrentPos[0], setheightHeight, setheightCurrentPos[2]);
                target.SetPosition(setheightNewPos);
                target.MessageStatus("Altura definida para " + setheightHeight.ToString() + " metros");
                WriteToLog("Jogador " + playerID + " altura definida para " + setheightHeight.ToString() + " metros. Posição final: " + setheightNewPos.ToString(), LogFile.INIT, false, LogType.INFO);
            } else {
                SendPrivateMessage(playerID, "Uso: !setheight <altura>", MessageColor.WARNING);
                return false;
            }
            break;
        case "checkinventory":
            if (tokens.Count() < 4)
            {
                SendPrivateMessage(playerID, "Uso: !checkinventory <PlayerID_ou_Nome> <request_id>", MessageColor.WARNING);
                return false;
            }
            
            string targetPlayerIdOrName = tokens[2];
            string requestId = tokens[3];
            
            PlayerBase checkInventoryTarget = GetPlayerById(targetPlayerIdOrName);
            
            if (!checkInventoryTarget)
            {
                checkInventoryTarget = GetPlayerByName(targetPlayerIdOrName);
            }
            
            if (!checkInventoryTarget)
            {
                SendPrivateMessage(playerID, "Jogador não encontrado: " + targetPlayerIdOrName, MessageColor.WARNING);
                WriteToLog("ExecuteCommand(): checkinventory - Jogador não encontrado: " + targetPlayerIdOrName + " (request_id: " + requestId + ")", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            
            if (!checkInventoryTarget.IsAlive())
            {
                SendPrivateMessage(playerID, "Jogador está morto: " + checkInventoryTarget.GetIdentity().GetName(), MessageColor.WARNING);
                WriteToLog("ExecuteCommand(): checkinventory - Jogador está morto: " + checkInventoryTarget.GetIdentity().GetName() + " (request_id: " + requestId + ")", LogFile.INIT, false, LogType.WARNING);
                return false;
            }
            
            WriteToLog("ExecuteCommand(): checkinventory - Verificando inventário de " + checkInventoryTarget.GetIdentity().GetName() + " (request_id: " + requestId + ")", LogFile.INIT, false, LogType.INFO);
            
            ref array<EntityAI> inventoryItems = new array<EntityAI>();
            checkInventoryTarget.GetInventory().EnumerateInventory(InventoryTraversalType.PREORDER, inventoryItems);
            
            string inventoryItemsJson = "";
            int itemCount = 0;
            
            foreach (EntityAI inventoryItem : inventoryItems)
            {
                if (!inventoryItem)
                    continue;
                
                itemCount++;
                string itemType = inventoryItem.GetType();
                int itemQuantity = 1;
                
                if (inventoryItem.IsInherited(ItemBase))
                {
                    ItemBase itemBase = ItemBase.Cast(inventoryItem);
                    if (itemBase && itemBase.HasQuantity())
                    {
                        itemQuantity = itemBase.GetQuantity();
                    }
                }
                
                string sanitizedType = SanitizeForJson(itemType);
                
                if (inventoryItemsJson != "")
                    inventoryItemsJson = inventoryItemsJson + ",";
                
                inventoryItemsJson = inventoryItemsJson + "{\"type\":\"" + sanitizedType + "\",\"quantity\":" + itemQuantity.ToString() + "}";
            }
            
            string playerName = SanitizeForJson(checkInventoryTarget.GetIdentity().GetName());
            string sanitizedRequestId = SanitizeForJson(requestId);
            string playerIdStr = checkInventoryTarget.GetIdentity().GetId();
            
            string resultJson = "{\"request_id\":\"" + sanitizedRequestId + "\",\"command\":\"checkinventory\",\"player_id\":\"" + playerIdStr + "\",\"player_name\":\"" + playerName + "\",\"items\":[" + inventoryItemsJson + "]}";
            
            AppendCommandResult(resultJson, false);
            
            WriteToLog("ExecuteCommand(): checkinventory - Inventário verificado: " + itemCount.ToString() + " itens encontrados para " + checkInventoryTarget.GetIdentity().GetName() + " (request_id: " + requestId + ")", LogFile.INIT, false, LogType.INFO);
            
            break;
        }

    return true;
}

bool ExecuteCreateItem(TStringArray tokens)
{
    // Formato: SYSTEM createitem ItemType Quantity CoordX CoordY
    if (tokens.Count() < 6)
    {
        WriteToLog("ExecuteCreateItem(): Parâmetros insuficientes", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string itemType = tokens[2];
    int itemQuantity = tokens[3].ToInt();
    float itemCoordX = tokens[4].ToFloat();
    float itemCoordY = tokens[5].ToFloat();
    
    // Criar vetor de posição
    vector itemPos = Vector(itemCoordX, 0, itemCoordY);
    
    // Calcular altura do terreno
    itemPos[1] = GetGame().SurfaceY(itemPos[0], itemPos[2]);
    
    // Spawnar item
    EntityAI spawnedItem = EntityAI.Cast(GetGame().CreateObject(itemType, itemPos));
    
    if (spawnedItem)
    {
        // Se for item empilhável, definir quantidade
        if (spawnedItem.IsInherited(ItemBase))
        {
            ItemBase itemBase = ItemBase.Cast(spawnedItem);
            if (itemBase && itemBase.HasQuantity())
            {
                itemBase.SetQuantity(itemQuantity);
            }
        }
        
        WriteToLog("Item " + itemType + " criado em X=" + itemCoordX.ToString() + " Y=" + itemCoordY.ToString(), LogFile.INIT, false, LogType.INFO);
        return true;
    }
    else
    {
        WriteToLog("Falha ao criar item: " + itemType, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
}

bool ExecuteCreateVehicle(TStringArray tokens)
{
    // Formato: SYSTEM createvehicle VehicleType CoordX CoordY
    if (tokens.Count() < 5)
    {
        WriteToLog("ExecuteCreateVehicle(): Parâmetros insuficientes", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string vehicleType = tokens[2];
    float vehicleCoordX = tokens[3].ToFloat();
    float vehicleCoordY = tokens[4].ToFloat();
    
    // Criar vetor de posição
    vector vehiclePos = Vector(vehicleCoordX, 0, vehicleCoordY);
    
    // Calcular altura do terreno
    vehiclePos[1] = GetGame().SurfaceY(vehiclePos[0], vehiclePos[2]);
    
    // Spawnar veículo usando função existente
    bool vehicleSuccess = SpawnVehicleWithParts(vehiclePos, vehicleType);
    
    if (vehicleSuccess)
    {
        WriteToLog("Veículo " + vehicleType + " criado em X=" + vehicleCoordX.ToString() + " Y=" + vehicleCoordY.ToString(), LogFile.INIT, false, LogType.INFO);
        return true;
    }
    else
    {
        WriteToLog("Falha ao criar veículo: " + vehicleType, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
}

bool ExecuteCreateContainer(TStringArray tokens, PlayerBase player = null)
{
    // Formato SYSTEM: SYSTEM createcontainer ContainerType CoordX CoordY Item1 Item2 ... ItemN
    // Formato USER: playerID createcontainer ContainerType Item1 Item2 ... ItemN
    float coordX;
    float coordY;
    int itemStartIndex;
    
    if (player)
    {
        // Modo usuário: usa posição do jogador
        if (tokens.Count() < 3)
        {
            WriteToLog("ExecuteCreateContainer(): Parâmetros insuficientes (modo usuário)", LogFile.INIT, false, LogType.ERROR);
            return false;
        }
        
        vector playerPos = player.GetPosition();
        coordX = playerPos[0];
        coordY = playerPos[2];
        itemStartIndex = 2; // ContainerType está no token[2], items começam em token[3]
    }
    else
    {
        // Modo SYSTEM: precisa de coordenadas explícitas
        if (tokens.Count() < 6)
        {
            WriteToLog("ExecuteCreateContainer(): Parâmetros insuficientes (modo SYSTEM)", LogFile.INIT, false, LogType.ERROR);
            return false;
        }
        
        coordX = tokens[3].ToFloat();
        coordY = tokens[4].ToFloat();
        itemStartIndex = 4; // Items começam no token[5], mas loop usa itemStartIndex + 1
    }
    
    string containerType = tokens[2];
    
    // Validar tipo de container
	if (!IsContainerType(containerType) && containerType != "SeaChest")
    {
        WriteToLog("ExecuteCreateContainer(): Tipo de container inválido: " + containerType, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Criar vetor de posição
    vector containerPos = Vector(coordX, 0, coordY);
    
    // Calcular altura do terreno
    containerPos[1] = GetGame().SurfaceY(containerPos[0], containerPos[2]);
    
    // Spawnar container
    EntityAI container = EntityAI.Cast(GetGame().CreateObject(containerType, containerPos, false, true));
    
    if (!container)
    {
        WriteToLog("Falha ao criar container: " + containerType, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    WriteToLog("Container " + containerType + " criado em X=" + coordX.ToString() + " Y=" + coordY.ToString(), LogFile.INIT, false, LogType.INFO);
    
    RegisterContainer(container);
    
    // Log adicional sobre capacidade do container
    CargoBase containerCargo = container.GetInventory().GetCargo();
    if (containerCargo)
    {
        WriteToLog("ExecuteCreateContainer(): Container criado com capacidade para itens", LogFile.INIT, false, LogType.DEBUG);
    }
    else
    {
        WriteToLog("ExecuteCreateContainer(): AVISO - Container sem sistema de cargo detectado", LogFile.INIT, false, LogType.DEBUG);
    }
    
    // Processar itens
    int itemsProcessed = 0;
    int itemsInContainer = 0;
    int itemsOnGround = 0;
    
    // Prepara posição de fallback no chão
    vector groundPos = containerPos;
    float offsetX = Math.RandomFloatInclusive(-1.5, 1.5);
    float offsetZ = Math.RandomFloatInclusive(-1.5, 1.5);
    groundPos[0] = groundPos[0] + offsetX;
    groundPos[2] = groundPos[2] + offsetZ;
    groundPos[1] = GetGame().SurfaceY(groundPos[0], groundPos[2]);
    
    for (int i = itemStartIndex + 1; i < tokens.Count(); i++)
    {
        string token = tokens[i];
        
        // Log para depuração
        WriteToLog("ExecuteCreateContainer(): Processando token " + i.ToString() + ": " + token, LogFile.INIT, false, LogType.DEBUG);
        
        // Verifica se é JSON (começa com { ou contém estrutura JSON)
        bool isJsonToken = false;
        bool hasOpenBrace = false;
        bool hasCloseBrace = false;
        bool hasOpenBracket = false;
        bool hasCloseBracket = false;
        bool hasColon = false;
        bool hasQuote = false;
        
        if (token.Length() > 0)
        {
            if (token.Get(0) == "{")
            {
                isJsonToken = true;
                hasOpenBrace = true;
            }
            
            // Verifica se tem caracteres JSON
            for (int checkIdx = 0; checkIdx < token.Length(); checkIdx++)
            {
                string checkChr = token.Get(checkIdx);
                if (checkChr == "{")
                    hasOpenBrace = true;
                else if (checkChr == "}")
                    hasCloseBrace = true;
                else if (checkChr == "[")
                    hasOpenBracket = true;
                else if (checkChr == "]")
                    hasCloseBracket = true;
                else if (checkChr == ":")
                    hasColon = true;
                else if (checkChr == "\"")
                    hasQuote = true;
            }
            
            // Se tem estrutura JSON típica mas não começa com {, pode ser continuação
            // Detectar JSON mesmo sem aspas: tem : e ( {, }, [, ] )
            bool looksLikeJson = hasColon && (hasOpenBrace || hasCloseBrace || hasOpenBracket || hasCloseBracket);
            
            if (!isJsonToken && looksLikeJson)
            {
                // Procura para trás para ver se há JSON iniciado
                bool foundJsonStart = false;
                for (int backIdx = i - 1; backIdx >= itemStartIndex + 1; backIdx--)
                {
                    string prevToken = tokens[backIdx];
                    if (prevToken.Length() > 0)
                    {
                        // Verifica se token anterior começa com { ou tem estrutura JSON
                        bool prevHasOpenBrace = false;
                        bool prevHasColon = false;
                        bool prevHasQuote = false;
                        bool prevHasBracket = false;
                        
                        if (prevToken.Get(0) == "{")
                            prevHasOpenBrace = true;
                        
                        for (int prevIdx = 0; prevIdx < prevToken.Length(); prevIdx++)
                        {
                            string prevChr = prevToken.Get(prevIdx);
                            if (prevChr == "{")
                                prevHasOpenBrace = true;
                            else if (prevChr == "[")
                                prevHasBracket = true;
                            else if (prevChr == ":")
                                prevHasColon = true;
                            else if (prevChr == "\"")
                                prevHasQuote = true;
                        }
                        
                        // JSON anterior se tem { ou [ ou tem : e estrutura JSON
                        bool prevLooksLikeJson = prevHasOpenBrace || prevHasBracket || (prevHasColon && (prevHasQuote || prevHasOpenBrace || prevHasBracket));
                        if (prevLooksLikeJson)
                        {
                            foundJsonStart = true;
                            break;
                        }
                    }
                }
                
                if (foundJsonStart)
                {
                    // É continuação de JSON anterior, será processado junto
                    WriteToLog("Token JSON continuação detectado, ignorando (será processado com JSON anterior): " + token, LogFile.INIT, false, LogType.DEBUG);
                    continue;
                }
            }
        }
        
        itemsProcessed++;
        
        // Verifica se é JSON: começa com { ou tem : e estrutura JSON ({, }, [, ])
        // Caso especial: se é o primeiro token de items e tem : mas não tem estrutura,
        // pode ser início de JSON fragmentado - tratamos como JSON
        bool looksLikeJsonToken = hasColon && (hasOpenBrace || hasCloseBrace || hasOpenBracket || hasCloseBracket);
        bool isPotentialJsonStart = (i == itemStartIndex + 1 && hasColon && !hasOpenBrace && !hasCloseBrace && !hasOpenBracket && !hasCloseBracket);
        bool isJsonStart = isJsonToken || looksLikeJsonToken || isPotentialJsonStart;
        
        if (isJsonStart)
        {
            // Processa JSON - pode ser multi-token, então precisa reconstruir
            string jsonString = token;
            
            // Se o token tem estrutura JSON mas não começa com {, pode ser que { foi perdido
            // Nesse caso, tentamos adicionar no início se necessário
            if (!isJsonToken)
            {
                // Se é início potencial de JSON (token 5 sem estrutura), sempre adiciona {
                if (isPotentialJsonStart)
                {
                    jsonString = "{" + jsonString;
                    WriteToLog("ExecuteCreateContainer(): Adicionando { no início do JSON (início potencial detectado): " + jsonString, LogFile.INIT, false, LogType.DEBUG);
                }
                else
                {
                    // Verifica se precisa adicionar { no início
                    int braceCount = 0;
                    int bracketCount = 0;
                    for (int braceIdx = 0; braceIdx < jsonString.Length(); braceIdx++)
                    {
                        string braceChr = jsonString.Get(braceIdx);
                        if (braceChr == "{")
                            braceCount++;
                        else if (braceChr == "}")
                            braceCount--;
                        else if (braceChr == "[")
                            bracketCount++;
                        else if (braceChr == "]")
                            bracketCount--;
                    }
                    
                    // Se não tem chave de abertura mas tem estrutura JSON, adiciona {
                    if (!hasOpenBrace && (hasColon || hasOpenBracket || hasCloseBrace || hasCloseBracket))
                    {
                        jsonString = "{" + jsonString;
                        WriteToLog("ExecuteCreateContainer(): Adicionando { no início do JSON: " + jsonString, LogFile.INIT, false, LogType.DEBUG);
                    }
                }
            }
            
            // Calcula chaves e colchetes abertos/fechados
            int openBraces = 0;
            int openBrackets = 0;
            for (int braceIdx2 = 0; braceIdx2 < jsonString.Length(); braceIdx2++)
            {
                string braceChr2 = jsonString.Get(braceIdx2);
                if (braceChr2 == "{")
                    openBraces++;
                else if (braceChr2 == "}")
                    openBraces--;
                else if (braceChr2 == "[")
                    openBrackets++;
                else if (braceChr2 == "]")
                    openBrackets--;
            }
            
            // Se não está completo, junta tokens até completar
            int tokenIdx = i;
            while ((openBraces > 0 || openBrackets > 0) && tokenIdx < tokens.Count() - 1)
            {
                tokenIdx++;
                jsonString = jsonString + " " + tokens[tokenIdx];
                for (int idx2 = 0; idx2 < tokens[tokenIdx].Length(); idx2++)
                {
                    string chr2 = tokens[tokenIdx].Get(idx2);
                    if (chr2 == "{")
                        openBraces++;
                    else if (chr2 == "}")
                        openBraces--;
                    else if (chr2 == "[")
                        openBrackets++;
                    else if (chr2 == "]")
                        openBrackets--;
                }
            }
            
            // Se ainda não fechou todas as chaves/colchetes, adiciona os que faltam
            while (openBrackets > 0)
            {
                jsonString = jsonString + "]";
                openBrackets--;
                WriteToLog("ExecuteCreateContainer(): Adicionando ] no final do JSON", LogFile.INIT, false, LogType.DEBUG);
            }
            while (openBraces > 0)
            {
                jsonString = jsonString + "}";
                openBraces--;
                WriteToLog("ExecuteCreateContainer(): Adicionando } no final do JSON", LogFile.INIT, false, LogType.DEBUG);
            }
            
            // Pula tokens já processados
            i = tokenIdx;
            
            // Log do JSON antes da normalização
            WriteToLog("ExecuteCreateContainer(): JSON antes da normalização: " + jsonString, LogFile.INIT, false, LogType.DEBUG);
            
            // Normaliza JSON: adiciona aspas onde necessário
            jsonString = NormalizeJsonString(jsonString);
            
            // Parse JSON
            WriteToLog("ExecuteCreateContainer(): Parseando JSON reconstruído e normalizado: " + jsonString, LogFile.INIT, false, LogType.DEBUG);
            int jsonPos = 0;
            int nextJsonPos = 0;
            ref ItemAttachmentData itemData = ParseItemJson(jsonString, jsonPos, nextJsonPos);
            
            if (itemData && itemData.type != "")
            {
                WriteToLog("ExecuteCreateContainer(): JSON parseado com sucesso. Tipo: " + itemData.type, LogFile.INIT, false, LogType.DEBUG);
                EntityAI jsonItem = CreateItemWithAttachments(itemData, container, groundPos);
                
                if (jsonItem)
                {
                    itemsInContainer++;
                    WriteToLog("Item JSON " + itemData.type + " adicionado ao container", LogFile.INIT, false, LogType.DEBUG);
                }
                else
                {
                    itemsOnGround++;
                    WriteToLog("Item JSON " + itemData.type + " criado no chão", LogFile.INIT, false, LogType.DEBUG);
                }
            }
            else
            {
                WriteToLog("Falha ao parsear JSON de item. JSON recebido: " + jsonString + " | Token original: " + token, LogFile.INIT, false, LogType.ERROR);
            }
        }
        else
        {
            // Formato simples (item sem attachments) - mantém compatibilidade
            string itemType = token;
            
            // Tentar adicionar no container
            EntityAI simpleItem = container.GetInventory().CreateInInventory(itemType);
            
            if (simpleItem)
            {
                itemsInContainer++;
                WriteToLog("Item " + itemType + " adicionado ao container", LogFile.INIT, false, LogType.DEBUG);
            }
            else
            {
                // Criar no chão próximo ao container
                vector itemGroundPos = containerPos;
                
                // Adicionar offset aleatório pequeno
                float itemOffsetX = Math.RandomFloatInclusive(-1.5, 1.5);
                float itemOffsetZ = Math.RandomFloatInclusive(-1.5, 1.5);
                
                itemGroundPos[0] = itemGroundPos[0] + itemOffsetX;
                itemGroundPos[2] = itemGroundPos[2] + itemOffsetZ;
                itemGroundPos[1] = GetGame().SurfaceY(itemGroundPos[0], itemGroundPos[2]);
                
                EntityAI groundItem = EntityAI.Cast(GetGame().CreateObject(itemType, itemGroundPos, false, true));
                
                if (groundItem)
                {
                    itemsOnGround++;
                    WriteToLog("Item " + itemType + " criado no chão (sem espaço no container)", LogFile.INIT, false, LogType.DEBUG);
                }
                else
                {
                    WriteToLog("Falha ao criar item: " + itemType, LogFile.INIT, false, LogType.ERROR);
                }
            }
        }
    }
    
    WriteToLog("Container criado - Itens processados: " + itemsProcessed.ToString() + ", Dentro: " + itemsInContainer.ToString() + ", No chão: " + itemsOnGround.ToString(), LogFile.INIT, false, LogType.INFO);
    
    // Log adicional se muitos itens ficaram no chão
    if (itemsOnGround > 0 && itemsProcessed > 0)
    {
        float percentOnGround = (itemsOnGround * 100.0) / itemsProcessed;
        WriteToLog("ExecuteCreateContainer(): " + percentOnGround.ToString() + "% dos itens ficaram no chão", LogFile.INIT, false, LogType.DEBUG);
    }
    
    return true;
}

bool ExecuteCreateWeapon(TStringArray tokens, PlayerBase player = null)
{
    // Formato SYSTEM: SYSTEM createweapon CoordX CoordY {"type":"AKM","attachments":[...]}
    // Formato USER: playerID createweapon {"type":"AKM","attachments":[...]}
    float coordX;
    float coordY;
    int jsonStartIndex;
    
    if (player)
    {
        // Modo usuário: usa posição do jogador
        if (tokens.Count() < 3)
        {
            WriteToLog("ExecuteCreateWeapon(): Parâmetros insuficientes (modo usuário)", LogFile.INIT, false, LogType.ERROR);
            return false;
        }
        
        vector playerPos = player.GetPosition();
        coordX = playerPos[0];
        coordY = playerPos[2];
        jsonStartIndex = 2; // JSON começa no token[2]
    }
    else
    {
        // Modo SYSTEM: precisa de coordenadas explícitas
        if (tokens.Count() < 5)
        {
            WriteToLog("ExecuteCreateWeapon(): Parâmetros insuficientes (modo SYSTEM)", LogFile.INIT, false, LogType.ERROR);
            return false;
        }
        
        coordX = tokens[2].ToFloat();
        coordY = tokens[3].ToFloat();
        jsonStartIndex = 4; // JSON começa no token[4]
    }
    
    // Criar vetor de posição
    vector weaponPos = Vector(coordX, 0, coordY);
    
    // Calcular altura do terreno
    weaponPos[1] = GetGame().SurfaceY(weaponPos[0], weaponPos[2]);
    
    // Reconstruir JSON (pode estar fragmentado em múltiplos tokens)
    string jsonString = "";
    for (int i = jsonStartIndex; i < tokens.Count(); i++)
    {
        if (i > jsonStartIndex)
            jsonString += " ";
        jsonString += tokens[i];
    }
    
    WriteToLog("ExecuteCreateWeapon(): JSON recebido: " + jsonString, LogFile.INIT, false, LogType.DEBUG);
    
    // Normalizar JSON
    jsonString = NormalizeJsonString(jsonString);
    
    WriteToLog("ExecuteCreateWeapon(): JSON normalizado: " + jsonString, LogFile.INIT, false, LogType.DEBUG);
    
    // Parse JSON usando função existente
    int jsonPos = 0;
    int nextJsonPos = 0;
    ref ItemAttachmentData weaponData = ParseItemJson(jsonString, jsonPos, nextJsonPos);
    
    if (!weaponData || weaponData.type == "")
    {
        WriteToLog("ExecuteCreateWeapon(): Falha ao parsear JSON do weapon kit", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Criar arma no chão (sem container, passa null)
    EntityAI weapon = CreateItemWithAttachments(weaponData, null, weaponPos);
    
    if (weapon)
    {
        WriteToLog("Weapon kit " + weaponData.type + " criado em X=" + coordX.ToString() + " Y=" + coordY.ToString(), LogFile.INIT, false, LogType.INFO);
        return true;
    }
    else
    {
        WriteToLog("Falha ao criar weapon kit: " + weaponData.type, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
}

bool IsInteger(string s)
{
    if (s.Length() == 0)
        return false;

    for (int i = 0; i < s.Length(); i++)
    {
        string ch = s.Get(i);
        if (ch < "0" || ch > "9")
            return false;
    }

    return true;
}

// ============================================================================
// SISTEMA DE ATTACHMENTS JSON RECURSIVOS
// ============================================================================

// Classe para representar item com attachments
class ItemAttachmentData
{
    string type;
    ref array<ref ItemAttachmentData> attachments;
    
    void ItemAttachmentData()
    {
        attachments = new array<ref ItemAttachmentData>;
    }
}

// Parser JSON simplificado - extrai string entre aspas
// Normaliza JSON: adiciona aspas, vírgulas e chaves onde necessário para tokens sem aspas
// Converte patterns como "type:AKM" para ""type":"AKM"" e adiciona vírgulas entre propriedades
// Adiciona { } onde propriedades aparecem diretamente em arrays
string NormalizeJsonString(string json)
{
    string result = "";
    int i = 0;
    bool inQuotes = false;
    string lastChar = "";
    int arrayDepth = 0;
    int objectDepth = 0;
    
    while (i < json.Length())
    {
        string ch = json.Get(i);
        
        // Detecta aspas existentes
        if (ch == "\"")
        {
            inQuotes = !inQuotes;
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        
        // Dentro de aspas, copia diretamente
        if (inQuotes)
        {
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        
        // Rastreia profundidade de arrays e objetos
        if (ch == "[")
        {
            arrayDepth++;
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        if (ch == "]")
        {
            arrayDepth--;
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        if (ch == "{")
        {
            objectDepth++;
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        if (ch == "}")
        {
            objectDepth--;
            result += ch;
            lastChar = ch;
            i++;
            continue;
        }
        
        // Pula espaços e tabs - serão tratados na adição de vírgulas
        if (ch == " " || ch == "\t" || ch == "\n" || ch == "\r")
        {
            // Verifica se precisa adicionar vírgula antes do espaço
            // Se último caractere era } ou " e próximo não é estrutura JSON, adiciona vírgula
            if (lastChar == "}" || lastChar == "\"")
            {
                // Verifica próximo caractere não-espaço
                int nextIdx = i + 1;
                while (nextIdx < json.Length() && (json.Get(nextIdx) == " " || json.Get(nextIdx) == "\t" || json.Get(nextIdx) == "\n" || json.Get(nextIdx) == "\r"))
                    nextIdx++;
                
                if (nextIdx < json.Length())
                {
                    string nextCh = json.Get(nextIdx);
                    // Se próximo é { ou " (início de propriedade/objeto), adiciona vírgula
                    if (nextCh == "{" || nextCh == "\"" || (nextCh != "}" && nextCh != "]" && nextCh != "," && nextCh != ":"))
                    {
                        result += ",";
                    }
                }
            }
            i++;
            continue;
        }
        
        // Detecta padrão chave:valor sem aspas (ex: type:AKM)
        if (ch != "," && ch != ":")
        {
            // Início de uma palavra (chave ou valor sem aspas)
            string word = "";
            
            // Coleta a palavra até encontrar : ou , ou } ou ] ou espaço
            while (i < json.Length())
            {
                ch = json.Get(i);
                if (ch == ":" || ch == "," || ch == "}" || ch == "]" || ch == "{" || ch == "[" || ch == " " || ch == "\t" || ch == "\n" || ch == "\r")
                    break;
                word += ch;
                i++;
            }
            
            // Verifica se é chave ou valor
            if (i < json.Length() && json.Get(i) == ":")
            {
                // Verifica contexto: se estamos dentro de um array e último caractere foi [, , ou }, precisa adicionar {
                // Isso cobre casos como: [{...}, type:...] ou [{...} type:...]
                bool needsObjectOpen = false;
                if (arrayDepth > 0)
                {
                    if (lastChar == "[" || lastChar == ",")
                    {
                        needsObjectOpen = true;
                    }
                    else if (lastChar == "}")
                    {
                        // Após } dentro de array, se encontramos chave, é novo objeto no array
                        // Mas verifica se não já tem vírgula (seria detectado antes)
                        needsObjectOpen = true;
                    }
                }
                
                if (needsObjectOpen)
                {
                    result += "{";
                    objectDepth++;
                }
                
                // É uma chave: adiciona aspas
                result += "\"" + word + "\"";
                lastChar = "\"";
            }
            else
            {
                // É um valor: verifica contexto
                // Se o último caractere antes era :, então é valor
                bool isValue = false;
                int backPos = result.Length() - 1;
                while (backPos >= 0)
                {
                    string backCh = result.Get(backPos);
                    if (backCh == ":")
                    {
                        isValue = true;
                        break;
                    }
                    if (backCh != " " && backCh != "\t" && backCh != "\n" && backCh != "\r" && backCh != "," && backCh != "{")
                        break;
                    backPos--;
                }
                
                // É valor: adiciona aspas
                result += "\"" + word + "\"";
                lastChar = "\"";
            }
            
            // Continua processando a partir do caractere atual (que não foi incluído na palavra)
            continue;
        }
        
        // Caracteres de estrutura JSON
        // Se é } ou ] e próximo não é vírgula nem } nem ], pode precisar de vírgula
        if ((ch == "}" || ch == "]") && lastChar != "," && lastChar != "{" && lastChar != "[")
        {
            // Verifica próximo caractere não-espaço
            int nextIdx2 = i + 1;
            while (nextIdx2 < json.Length() && (json.Get(nextIdx2) == " " || json.Get(nextIdx2) == "\t" || json.Get(nextIdx2) == "\n" || json.Get(nextIdx2) == "\r"))
                nextIdx2++;
            
            if (nextIdx2 < json.Length())
            {
                string nextCh2 = json.Get(nextIdx2);
                // Se próximo é { ou " ou palavra (início de propriedade/objeto), adiciona vírgula
                // Para arrays, após } deve ter vírgula antes do próximo objeto
                bool needsComma = false;
                if (nextCh2 == "{")
                {
                    needsComma = true;
                }
                else if (nextCh2 == "\"" && ch == "}")
                {
                    // Após } dentro de array, se próximo é ", é novo objeto
                    needsComma = true;
                }
                else if (arrayDepth > 0 && ch == "}" && nextCh2 != "}" && nextCh2 != "]" && nextCh2 != ",")
                {
                    // Dentro de array, após } se próximo não é estrutura, provavelmente é novo objeto
                    needsComma = true;
                }
                
                if (needsComma)
                {
                    result += ch + ",";
                    lastChar = ",";
                    i++;
                    continue;
                }
            }
        }
        
        // Se é } dentro de array, pode precisar fechar objeto
        if (ch == "}" && arrayDepth > 0 && objectDepth > 0)
        {
            objectDepth--;
        }
        
        result += ch;
        lastChar = ch;
        i++;
    }
    
    // Fecha objetos abertos dentro de arrays
    while (objectDepth > 0 && arrayDepth >= 0)
    {
        result += "}";
        objectDepth--;
    }
    
    return result;
}

string ExtractJsonString(string json, int pos, out int newPos)
{
    string result = "";
    int currentPos = pos;
    
    if (currentPos >= json.Length())
    {
        newPos = currentPos;
        return result;
    }
    
    // Pula até encontrar aspas de abertura
    while (currentPos < json.Length() && json.Get(currentPos) != "\"")
        currentPos++;
    
    if (currentPos >= json.Length())
    {
        newPos = currentPos;
        return result;
    }
    
    currentPos++; // Pula a aspas de abertura
    
    // Extrai até encontrar aspas de fechamento
    while (currentPos < json.Length())
    {
        string ch = json.Get(currentPos);
        if (ch == "\"")
            break;
        result += ch;
        currentPos++;
    }
    
    currentPos++; // Pula aspas de fechamento
    newPos = currentPos;
    return result;
}

// Pula espaços e vírgulas - retorna nova posição
int SkipWhitespaceAndCommas(string json, int pos)
{
    int currentPos = pos;
    while (currentPos < json.Length())
    {
        string ch = json.Get(currentPos);
        if (ch == " " || ch == "\t" || ch == "\n" || ch == "\r" || ch == ",")
            currentPos++;
        else
            break;
    }
    return currentPos;
}

// Parse JSON array de attachments - retorna nova posição
int ParseAttachmentsArray(string json, int pos, array<ref ItemAttachmentData> attachments)
{
    int currentPos = pos;
    
    if (currentPos >= json.Length())
        return currentPos;
    
    // Pula até encontrar [
    while (currentPos < json.Length() && json.Get(currentPos) != "[")
        currentPos++;
    
    if (currentPos >= json.Length())
        return currentPos;
    
    currentPos++; // Pula [
    currentPos = SkipWhitespaceAndCommas(json, currentPos);
    
    // Processa cada item do array
    while (currentPos < json.Length() && json.Get(currentPos) != "]")
    {
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
        
        if (currentPos >= json.Length() || json.Get(currentPos) == "]")
            break;
        
        // Parse objeto de attachment
        if (json.Get(currentPos) == "{")
        {
            int nextPos = 0;
            ref ItemAttachmentData attachment = ParseItemJson(json, currentPos, nextPos);
            if (attachment)
            {
                attachments.Insert(attachment);
                currentPos = nextPos;
            }
            else
            {
                break;
            }
        }
        
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
    }
    
    if (currentPos < json.Length() && json.Get(currentPos) == "]")
        currentPos++; // Pula ]
    
    return currentPos;
}

// Parse objeto JSON de item - retorna nova posição via out
ref ItemAttachmentData ParseItemJson(string json, int pos, out int newPos)
{
    ref ItemAttachmentData item = new ItemAttachmentData;
    int currentPos = pos;
    
    if (currentPos >= json.Length())
    {
        newPos = currentPos;
        return null;
    }
    
    // Pula até encontrar {
    while (currentPos < json.Length() && json.Get(currentPos) != "{")
        currentPos++;
    
    if (currentPos >= json.Length())
    {
        newPos = currentPos;
        return null;
    }
    
    currentPos++; // Pula {
    currentPos = SkipWhitespaceAndCommas(json, currentPos);
    
    // Processa propriedades do objeto
    while (currentPos < json.Length() && json.Get(currentPos) != "}")
    {
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
        
        if (currentPos >= json.Length() || json.Get(currentPos) == "}")
            break;
        
        // Extrai nome da propriedade
        int nextPos = 0;
        string propName = ExtractJsonString(json, currentPos, nextPos);
        currentPos = nextPos;
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
        
        // Pula :
        if (currentPos < json.Length() && json.Get(currentPos) == ":")
            currentPos++;
        
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
        
        // Processa valor da propriedade
        if (propName == "type")
        {
            item.type = ExtractJsonString(json, currentPos, nextPos);
            currentPos = nextPos;
        }
        else if (propName == "attachments")
        {
            currentPos = ParseAttachmentsArray(json, currentPos, item.attachments);
        }
        
        currentPos = SkipWhitespaceAndCommas(json, currentPos);
    }
    
    if (currentPos < json.Length() && json.Get(currentPos) == "}")
        currentPos++; // Pula }
    
    newPos = currentPos;
    return item;
}

// Função recursiva para criar item com attachments
EntityAI CreateItemWithAttachments(ItemAttachmentData itemData, EntityAI container, vector fallbackPos)
{
    if (!itemData || !itemData.type || itemData.type == "")
        return null;
    
    EntityAI item = null;
    
    // Tenta criar no container
    if (container)
    {
        WriteToLog("CreateItemWithAttachments(): Tentando inserir " + itemData.type + " no container " + container.GetType(), LogFile.INIT, false, LogType.DEBUG);
        
        // Log do estado atual do container
        CargoBase cargo = container.GetInventory().GetCargo();
        if (cargo)
        {
            int usedSlots = cargo.GetItemCount();
            WriteToLog("CreateItemWithAttachments(): Container tem " + usedSlots.ToString() + " itens atualmente", LogFile.INIT, false, LogType.DEBUG);
        }
        
        // Primeira tentativa: orientação normal
        item = container.GetInventory().CreateInInventory(itemData.type);
        
        if (item)
        {
            WriteToLog("CreateItemWithAttachments(): Item " + itemData.type + " inserido com SUCESSO no container", LogFile.INIT, false, LogType.DEBUG);
        }
        else
        {
            WriteToLog("CreateItemWithAttachments(): FALHA ao inserir " + itemData.type + " no container - será criado no chão", LogFile.INIT, false, LogType.DEBUG);
            // Nota: Rotação automática não é suportada pela API do DayZ
        }
    }
    
    // Se não conseguir, cria no chão
    if (!item)
    {
        WriteToLog("CreateItemWithAttachments(): Criando " + itemData.type + " no chão em " + fallbackPos.ToString(), LogFile.INIT, false, LogType.DEBUG);
        item = EntityAI.Cast(GetGame().CreateObject(itemData.type, fallbackPos, false, true));
    }
    
    if (!item)
    {
        WriteToLog("CreateItemWithAttachments(): Falha ao criar item: " + itemData.type, LogFile.INIT, false, LogType.ERROR);
        return null;
    }
    
    WriteToLog("CreateItemWithAttachments(): Item criado: " + itemData.type, LogFile.INIT, false, LogType.DEBUG);
    
    // Processa attachments recursivamente usando função auxiliar
    if (itemData.attachments && itemData.attachments.Count() > 0)
        ProcessAttachmentsRecursive(item, itemData.attachments);
    
    return item;
}

// Função auxiliar para processar recursivamente attachments profundos
void ProcessAttachmentsRecursive(EntityAI parentItem, array<ref ItemAttachmentData> attachments)
{
    if (!parentItem || !attachments)
        return;
    
    foreach (ref ItemAttachmentData attachment : attachments)
    {
        if (!attachment)
            continue;
        
        EntityAI attachmentEntity = parentItem.GetInventory().CreateAttachment(attachment.type);
        
        if (attachmentEntity)
        {
            WriteToLog("ProcessAttachmentsRecursive(): Attachment criado: " + attachment.type, LogFile.INIT, false, LogType.DEBUG);
            
            // Processa sub-attachments recursivamente
            if (attachment.attachments && attachment.attachments.Count() > 0)
                ProcessAttachmentsRecursive(attachmentEntity, attachment.attachments);
        }
        else
        {
            WriteToLog("ProcessAttachmentsRecursive(): Falha ao criar attachment: " + attachment.type, LogFile.INIT, false, LogType.ERROR);
        }
    }
}

bool ExecuteTeleportVehicle(TStringArray tokens)
{
    // Formato: SYSTEM teleportvehicle VehicleId CoordX Altura CoordY
    // Seguindo o mesmo padrão do comando teleport de jogadores
    if (tokens.Count() < 6)
    {
        WriteToLog("ExecuteTeleportVehicle(): Parâmetros insuficientes. Formato: SYSTEM teleportvehicle VehicleId CoordX Altura CoordY", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string vehicleId = tokens[2];
    float coordX = tokens[3].ToFloat();
    float altura = tokens[4].ToFloat();
    float coordY = tokens[5].ToFloat();
    
    // Buscar veículo no array m_TrackedVehicles
    CarScript targetVehicle = null;
    
    if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
    {
        WriteToLog("ExecuteTeleportVehicle(): Nenhum veículo rastreado encontrado", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        if (!vehicle)
            continue;
        
        // Gerar identificador do veículo (mesma lógica do VehicleTracking.c)
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
        
        // Comparar com o ID fornecido
        if (vehicleIdentifier == vehicleId)
        {
            targetVehicle = vehicle;
            break;
        }
    }
    
    if (!targetVehicle)
    {
        WriteToLog("ExecuteTeleportVehicle(): Veículo não encontrado: " + vehicleId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Verificar se veículo não está destruído
    if (targetVehicle.GetHealth("", "") <= 0)
    {
        WriteToLog("ExecuteTeleportVehicle(): Veículo está destruído: " + vehicleId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Criar vetor de posição
    vector newPos = Vector(coordX, 0, coordY);
    
    // Se altura foi fornecida, usar. Caso contrário, calcular automaticamente
    if (altura != 0)
    {
        newPos[1] = altura;
        WriteToLog("ExecuteTeleportVehicle(): Usando altura fornecida: " + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    }
    else
    {
        // Calcular altura do terreno automaticamente
        newPos[1] = GetGame().SurfaceY(newPos[0], newPos[2]);
        WriteToLog("ExecuteTeleportVehicle(): Ajustando altura automaticamente para: " + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    }
    
    // Teleportar veículo
    targetVehicle.SetPosition(newPos);
    targetVehicle.SetSynchDirty();
    
    string vehicleName = targetVehicle.GetDisplayName();
    WriteToLog("ExecuteTeleportVehicle(): Veículo " + vehicleName + " (" + vehicleId + ") teleportado para X=" + newPos[0].ToString() + " Y=" + newPos[2].ToString() + " Z=" + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    
    return true;
}

bool ExecuteFlipVehicle(TStringArray tokens)
{
    // Formato: SYSTEM flipvehicle VehicleId
    if (tokens.Count() < 3)
    {
        WriteToLog("ExecuteFlipVehicle(): Parâmetros insuficientes. Formato: SYSTEM flipvehicle VehicleId", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string vehicleId = tokens[2];
    
    // Buscar veículo no array m_TrackedVehicles
    CarScript targetVehicle = null;
    
    if (!m_TrackedVehicles || m_TrackedVehicles.Count() == 0)
    {
        WriteToLog("ExecuteFlipVehicle(): Nenhum veículo rastreado encontrado", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    foreach (CarScript vehicle : m_TrackedVehicles)
    {
        if (!vehicle)
            continue;
        
        // Gerar identificador do veículo (mesma lógica do ExecuteTeleportVehicle)
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
        
        // Comparar com o ID fornecido
        if (vehicleIdentifier == vehicleId)
        {
            targetVehicle = vehicle;
            break;
        }
    }
    
    if (!targetVehicle)
    {
        WriteToLog("ExecuteFlipVehicle(): Veículo não encontrado: " + vehicleId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Verificar se veículo não está destruído
    if (targetVehicle.GetHealth("", "") <= 0)
    {
        WriteToLog("ExecuteFlipVehicle(): Veículo está destruído: " + vehicleId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Obter orientação atual
    vector currentOrientation = targetVehicle.GetOrientation();
    float currentYaw = currentOrientation[0];
    float currentPitch = currentOrientation[1];
    float currentRoll = currentOrientation[2];
    
    // Criar nova orientação: manter yaw (direção), resetar pitch e roll
    vector newOrientation = Vector(currentYaw, 0, 0);
    
    // Aplicar nova orientação
    targetVehicle.SetOrientation(newOrientation);
    
    // Garantir que o veículo está na altura correta do terreno
    vector currentPos = targetVehicle.GetPosition();
    float groundY = GetGame().SurfaceY(currentPos[0], currentPos[2]);
    currentPos[1] = groundY;
    targetVehicle.SetPosition(currentPos);
    targetVehicle.SetSynchDirty();
    
    string vehicleName = targetVehicle.GetDisplayName();
    WriteToLog("ExecuteFlipVehicle(): Veículo " + vehicleName + " (" + vehicleId + ") virado. Orientação anterior: Yaw=" + currentYaw.ToString() + " Pitch=" + currentPitch.ToString() + " Roll=" + currentRoll.ToString(), LogFile.INIT, false, LogType.INFO);
    
    return true;
}

bool ExecuteTeleportContainer(TStringArray tokens)
{
    // Formato: SYSTEM teleportcontainer ContainerId CoordX Altura CoordY
    // Seguindo o mesmo padrão do comando teleportvehicle
    if (tokens.Count() < 6)
    {
        WriteToLog("ExecuteTeleportContainer(): Parâmetros insuficientes. Formato: SYSTEM teleportcontainer ContainerId CoordX Altura CoordY", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string containerIdStr = tokens[2];
    float coordX = tokens[3].ToFloat();
    float altura = tokens[4].ToFloat();
    float coordY = tokens[5].ToFloat();
    
    // Buscar container no array m_TrackedContainers
    EntityAI targetContainer = null;
    
    if (!m_TrackedContainers || m_TrackedContainers.Count() == 0)
    {
        WriteToLog("ExecuteTeleportContainer(): Nenhum container rastreado encontrado", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    foreach (EntityAI container : m_TrackedContainers)
    {
        if (!container)
            continue;
        
        // Gerar identificador do container (mesma lógica do LootTracking.c)
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
        
        // Comparar com o ID fornecido
        if (containerIdentifier == containerIdStr)
        {
            targetContainer = container;
            break;
        }
    }
    
    if (!targetContainer)
    {
        WriteToLog("ExecuteTeleportContainer(): Container não encontrado: " + containerIdStr, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Verificar se container não está destruído
    if (targetContainer.GetHealth("", "") <= 0)
    {
        WriteToLog("ExecuteTeleportContainer(): Container está destruído: " + containerIdStr, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Criar vetor de posição
    vector newPos = Vector(coordX, 0, coordY);
    
    // Se altura foi fornecida, usar. Caso contrário, calcular automaticamente
    if (altura != 0)
    {
        newPos[1] = altura;
        WriteToLog("ExecuteTeleportContainer(): Usando altura fornecida: " + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    }
    else
    {
        // Calcular altura do terreno automaticamente
        newPos[1] = GetGame().SurfaceY(newPos[0], newPos[2]);
        WriteToLog("ExecuteTeleportContainer(): Ajustando altura automaticamente para: " + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    }
    
    // Teleportar container
    targetContainer.SetPosition(newPos);
    
    string containerType = targetContainer.GetType();
    WriteToLog("ExecuteTeleportContainer(): Container " + containerType + " (" + containerIdStr + ") teleportado para X=" + newPos[0].ToString() + " Y=" + newPos[2].ToString() + " Z=" + newPos[1].ToString(), LogFile.INIT, false, LogType.INFO);
    
    return true;
}

bool ExecuteDeleteEntity(TStringArray tokens)
{
    // Formato: SYSTEM deleteentity EntityId
    if (tokens.Count() < 3)
    {
        WriteToLog("ExecuteDeleteEntity(): Parâmetros insuficientes. Formato: SYSTEM deleteentity EntityId", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string entityId = tokens[2];
    Object targetEntity = null;
    string entityType = "";
    string entityCategory = "";
    
    // Variáveis compartilhadas para todos os blocos de busca
    int pidLow1 = 0;
    int pidLow2 = 0;
    int pidHigh1 = 0;
    int pidHigh2 = 0;
    bool hasPersistent = false;
    string persistentKey = "";
    
    // Buscar em containers primeiro
    if (m_TrackedContainers && m_TrackedContainers.Count() > 0)
    {
        foreach (EntityAI container : m_TrackedContainers)
        {
            if (!container)
                continue;
            
            pidLow1 = 0;
            pidLow2 = 0;
            pidHigh1 = 0;
            pidHigh2 = 0;
            container.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
            
            hasPersistent = false;
            if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
            {
                hasPersistent = true;
            }
            
            persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
            string containerIdentifier = persistentKey;
            if (!hasPersistent)
            {
                containerIdentifier = "pending-" + container.GetID().ToString();
            }
            
            if (containerIdentifier == entityId)
            {
                targetEntity = container;
                entityType = container.GetType();
                entityCategory = "container";
                break;
            }
        }
    }
    
    // Buscar em veículos
    if (!targetEntity && m_TrackedVehicles && m_TrackedVehicles.Count() > 0)
    {
        foreach (CarScript vehicle : m_TrackedVehicles)
        {
            if (!vehicle)
                continue;
            
            pidLow1 = 0;
            pidLow2 = 0;
            pidHigh1 = 0;
            pidHigh2 = 0;
            vehicle.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
            
            hasPersistent = false;
            if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
            {
                hasPersistent = true;
            }
            
            persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
            string vehicleIdentifier = persistentKey;
            if (!hasPersistent)
            {
                vehicleIdentifier = "pending-" + vehicle.GetID().ToString();
            }
            
            if (vehicleIdentifier == entityId)
            {
                targetEntity = vehicle;
                entityType = vehicle.GetType();
                entityCategory = "vehicle";
                break;
            }
        }
    }
    
    // Buscar em fences
    if (!targetEntity && m_TrackedFences && m_TrackedFences.Count() > 0)
    {
        foreach (Fence fence : m_TrackedFences)
        {
            if (!fence)
                continue;
            
            pidLow1 = 0;
            pidLow2 = 0;
            pidHigh1 = 0;
            pidHigh2 = 0;
            fence.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
            
            hasPersistent = false;
            if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
            {
                hasPersistent = true;
            }
            
            persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
            string fenceIdentifier = persistentKey;
            if (!hasPersistent)
            {
                fenceIdentifier = "pending-" + fence.GetID().ToString();
            }
            
            if (fenceIdentifier == entityId)
            {
                targetEntity = fence;
                entityType = fence.GetType();
                entityCategory = "fence";
                break;
            }
        }
    }
    
    // Buscar em watchtowers
    if (!targetEntity && m_TrackedWatchtowers && m_TrackedWatchtowers.Count() > 0)
    {
        foreach (Watchtower watchtower : m_TrackedWatchtowers)
        {
            if (!watchtower)
                continue;
            
            pidLow1 = 0;
            pidLow2 = 0;
            pidHigh1 = 0;
            pidHigh2 = 0;
            watchtower.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
            
            hasPersistent = false;
            if (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0)
            {
                hasPersistent = true;
            }
            
            persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
            string watchtowerIdentifier = persistentKey;
            if (!hasPersistent)
            {
                watchtowerIdentifier = "pending-" + watchtower.GetID().ToString();
            }
            
            if (watchtowerIdentifier == entityId)
            {
                targetEntity = watchtower;
                entityType = watchtower.GetType();
                entityCategory = "watchtower";
                break;
            }
        }
    }
    
    // Buscar em flags
    if (!targetEntity && m_TrackedFlags && m_TrackedFlags.Count() > 0)
    {
        foreach (Object flag : m_TrackedFlags)
        {
            if (!flag)
                continue;
            
            EntityAI flagEntity = EntityAI.Cast(flag);
            pidLow1 = 0;
            pidLow2 = 0;
            pidHigh1 = 0;
            pidHigh2 = 0;
            hasPersistent = false;
            
            if (flagEntity)
            {
                flagEntity.GetPersistentID(pidLow1, pidLow2, pidHigh1, pidHigh2);
                hasPersistent = (pidLow1 != 0 || pidLow2 != 0 || pidHigh1 != 0 || pidHigh2 != 0);
            }
            
            persistentKey = pidLow1.ToString() + "-" + pidLow2.ToString() + "-" + pidHigh1.ToString() + "-" + pidHigh2.ToString();
            string flagIdentifier = persistentKey;
            if (!hasPersistent)
            {
                flagIdentifier = "pending-" + flag.GetID().ToString();
            }
            
            if (flagIdentifier == entityId)
            {
                targetEntity = flag;
                entityType = flag.GetType();
                entityCategory = "flag";
                break;
            }
        }
    }
    
    if (!targetEntity)
    {
        WriteToLog("ExecuteDeleteEntity(): Entity não encontrado: " + entityId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    // Obter posição antes de deletar para log
    vector entityPosition = targetEntity.GetPosition();
    
    // Deletar objeto
    GetGame().ObjectDelete(targetEntity);
    
    // Remover do array rastreado correspondente
    if (entityCategory == "container" && m_TrackedContainers)
    {
        int containerIndex = m_TrackedContainers.Find(EntityAI.Cast(targetEntity));
        if (containerIndex >= 0)
        {
            m_TrackedContainers.Remove(containerIndex);
        }
    }
    else if (entityCategory == "vehicle" && m_TrackedVehicles)
    {
        int vehicleIndex = m_TrackedVehicles.Find(CarScript.Cast(targetEntity));
        if (vehicleIndex >= 0)
        {
            m_TrackedVehicles.Remove(vehicleIndex);
        }
    }
    else if (entityCategory == "fence" && m_TrackedFences)
    {
        int fenceIndex = m_TrackedFences.Find(Fence.Cast(targetEntity));
        if (fenceIndex >= 0)
        {
            m_TrackedFences.Remove(fenceIndex);
        }
    }
    else if (entityCategory == "watchtower" && m_TrackedWatchtowers)
    {
        int watchtowerIndex = m_TrackedWatchtowers.Find(Watchtower.Cast(targetEntity));
        if (watchtowerIndex >= 0)
        {
            m_TrackedWatchtowers.Remove(watchtowerIndex);
        }
    }
    else if (entityCategory == "flag" && m_TrackedFlags)
    {
        int flagIndex = m_TrackedFlags.Find(targetEntity);
        if (flagIndex >= 0)
        {
            m_TrackedFlags.Remove(flagIndex);
        }
    }
    
    WriteToLog("ExecuteDeleteEntity(): Entity " + entityType + " (" + entityCategory + ", " + entityId + ") deletado em X=" + entityPosition[0].ToString() + " Y=" + entityPosition[2].ToString() + " Z=" + entityPosition[1].ToString(), LogFile.INIT, false, LogType.INFO);
    
    return true;
}

