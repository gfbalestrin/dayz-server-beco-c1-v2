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
    
    WriteToLog("CheckCommands(): Processamento concluído", LogFile.INIT, false, LogType.DEBUG);
}

bool ExecuteCommand(TStringArray tokens)
{
    
    string playerID = tokens[0];
    string command = tokens[1];    

    WriteToLog("ExecuteCommand(): Executando comando: " + command + " para o jogador: " + playerID, LogFile.INIT, false, LogType.DEBUG);
    
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
    bool isAdmin = CheckIfIsAdmin(playerID);

    switch (command)
    {
        case "help":
            SendPrivateMessage(playerID, "!kill -> Cometer suicídio", MessageColor.FRIENDLY);
            break;
        case "teleport":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            if (tokens.Count() == 5)
            {
                vector posT = Vector(tokens[2].ToFloat(), tokens[3].ToFloat(), tokens[4].ToFloat());
                target.SetPosition(posT);
                target.MessageStatus("Você foi teleportado");
            }
            break;

        case "heal":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            target.SetHealth("", "", 100);
            target.SetHealth("GlobalHealth", "Blood", 5000);
            target.SetHealth("GlobalHealth", "Shock", 0);
            target.GetStatEnergy().Set(4000);
            target.GetStatWater().Set(4000);
            target.MessageStatus("Você foi curado");
            break;

        case "kill":
            target.SetHealth("", "", 0);
            target.MessageStatus("Você foi eliminado");
            break;

        case "godmode":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            target.SetAllowDamage(false);
            target.MessageStatus("God Mode ativado");
            break;

        case "ungodmode":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            target.SetAllowDamage(true);
            target.MessageStatus("God Mode desativado");
            break;

        case "giveitem":  
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }          
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
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            if (tokens.Count() == 3)
            {
                string vehicleType = tokens[2];
                SpawnVehicleWithPartsToPlayer(target, vehicleType);
            }
            break;

        case "ghostmode":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            target.SetInvisible(true);
            target.SetScale(0.0001);
            target.MessageStatus("Você está invisível");
            break;

        case "unghostmode":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            target.SetInvisible(false);
            target.MessageStatus("Você está visível");
            break;

        case "kick":            
            PlayerIdentity identity = target.GetIdentity();
            target.MessageStatus("Seu jogador está bugado. Realizando ajuste...");
            GetGame().DisconnectPlayer(identity);
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
    }

    return true;
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
