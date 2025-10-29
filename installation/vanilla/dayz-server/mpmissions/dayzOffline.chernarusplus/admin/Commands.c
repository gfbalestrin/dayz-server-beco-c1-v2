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
    bool isAdmin = true;//CheckIfIsAdmin(playerID);

    switch (command)
    {
        case "help":
            if (!isAdmin)
            {
                //SendPrivateMessage(playerID, "!loadouts -> Lista loadouts configurados", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!loadout meuloadout1' -> Ativa meuloadout1", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!loadout reset -> Gera nova senha aleatória para acessar o sistema de loadout: " + UrlAppPython, MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!maps -> Lista mapas disponíveis", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!votemap 1 -> Vota no mapa 1", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!players -> Lista jogadores online", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!votekick 12345679 -> Vota para kickar o jogador de ID 12345679", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!kill -> Cometer suicídio", MessageColor.FRIENDLY);
            } else 
            {
                //SendPrivateMessage(playerID, "!loadouts -> Lista loadouts configurados", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!loadout meuloadout1' -> Ativa meuloadout1", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!loadout reset -> Gera nova senha aleatória para acessar o sistema de loadout: " + UrlAppPython, MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!maps -> Lista mapas disponíveis", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!votemap 1 -> Vota no mapa 1", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!players -> Lista jogadores online", MessageColor.FRIENDLY);
                //SendPrivateMessage(playerID, "!votekick 12345679 -> Vota para kickar o jogador de ID 12345679", MessageColor.FRIENDLY);
                SendPrivateMessage(playerID, "!kill -> Cometer suicídio", MessageColor.FRIENDLY);
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
                SendPrivateMessage(playerID, "!stamina on/off -> Ativa/Desativa stamina infinita", MessageColor.FRIENDLY);
                
            }
            break;
        case "teleport":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
            
            // Formato: PlayerID teleport CoordX CoordZ CoordY [AlturaOpcional]
            if (tokens.Count() >= 5)
            {
                vector posT = Vector(tokens[2].ToFloat(), 0, tokens[4].ToFloat()); // X e Y (CoordZ é Y)
                
                // Se altura foi fornecida, usar. Caso contrário, calcular automaticamente
                if (tokens.Count() >= 6)
                {
                    posT[1] = tokens[3].ToFloat(); // Usar altura fornecida
                }
                else
                {
                    // Calcular altura do terreno automaticamente
                    posT[1] = GetGame().SurfaceY(posT[0], posT[2]);
                }
                
                target.SetPosition(posT);
                target.MessageStatus("Você foi teleportado");
                WriteToLog("Jogador " + playerID + " teleportado para X=" + posT[0].ToString() + " Y=" + posT[2].ToString() + " Z=" + posT[1].ToString(), LogFile.INIT, false, LogType.INFO);
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
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando foi bloqueado para o jogador!", LogFile.INIT, false, LogType.ERROR);
                return false;
            }
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
            ShowLoadoutsToPlayer(playerID);
            break;
        case "loadout":
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
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                WriteToLog("Comando bloqueado para não-admin: settime", LogFile.INIT, false, LogType.ERROR);
                return false;
            }

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
            if (!isAdmin) {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                return false;
            }
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
    
        case "stamina":
            if (!isAdmin)
            {
                SendPrivateMessage(playerID, "Você não possui permissão para executar esse comando", MessageColor.IMPORTANT);
                return false;
            }

            if (tokens.Count() >= 3)
            {
                string mode = tokens[2];
                mode.ToLower();
                
                WriteToLog("ExecuteCommand(): comando stamina com mode='" + mode + "' para playerID=" + playerID, LogFile.INIT, false, LogType.DEBUG);

                if (mode == "on")
                {
                    if (!g_PlayersWithInfiniteStamina)
                    {
                        g_PlayersWithInfiniteStamina = new array<ref ActivePlayer>();
                        WriteToLog("ExecuteCommand(): inicializando array g_PlayersWithInfiniteStamina", LogFile.INIT, false, LogType.DEBUG);
                    }
                    
                    if (!target.GetIdentity())
                    {
                        WriteToLog("ExecuteCommand(): ERRO - target sem Identity para playerID=" + playerID, LogFile.INIT, false, LogType.ERROR);
                        target.MessageStatus("Erro: não foi possível obter Identity do jogador");
                        break;
                    }
                    
                    ref ActivePlayer newPlayer = new ActivePlayer(target.GetIdentity(), target);
                    g_PlayersWithInfiniteStamina.Insert(newPlayer);
                    
                    WriteToLog("ExecuteCommand(): ActivePlayer criado - array size=" + g_PlayersWithInfiniteStamina.Count().ToString() + " para playerID=" + playerID, LogFile.INIT, false, LogType.DEBUG);
                    
                    SendPrivateMessage(playerID, "Stamina infinita ativada!", MessageColor.FRIENDLY);
                    WriteToLog("Stamina infinita ativada para " + playerID, LogFile.INIT, false, LogType.INFO);
                }
                else if (mode == "off")
                {
                    if (!g_PlayersWithInfiniteStamina)
                    {
                        WriteToLog("ExecuteCommand(): array g_PlayersWithInfiniteStamina é nulo", LogFile.INIT, false, LogType.DEBUG);
                        target.MessageStatus("Stamina infinita já estava desativada");
                        break;
                    }
                    
                    WriteToLog("ExecuteCommand(): procurando para remover playerID=" + playerID + " em array com " + g_PlayersWithInfiniteStamina.Count().ToString() + " items", LogFile.INIT, false, LogType.DEBUG);
                    
                    for (int i = 0; i < g_PlayersWithInfiniteStamina.Count(); i++)
                    {
                        if (!g_PlayersWithInfiniteStamina[i])
                        {
                            WriteToLog("ExecuteCommand(): item null no índice " + i.ToString(), LogFile.INIT, false, LogType.DEBUG);
                            continue;
                        }
                        
                        PlayerIdentity apiIdentity = g_PlayersWithInfiniteStamina[i].GetIdentity();
                        if (!apiIdentity)
                        {
                            WriteToLog("ExecuteCommand(): item no índice " + i.ToString() + " sem Identity", LogFile.INIT, false, LogType.DEBUG);
                            continue;
                        }
                        
                        string listPid = apiIdentity.GetId();
                        WriteToLog("ExecuteCommand(): verificando índice " + i.ToString() + " com PlayerID=" + listPid, LogFile.INIT, false, LogType.DEBUG);
                        
                        if (listPid == playerID)
                        {
                            g_PlayersWithInfiniteStamina.Remove(i);
                            WriteToLog("ExecuteCommand(): removido índice " + i.ToString() + " (PlayerID=" + playerID + ")", LogFile.INIT, false, LogType.DEBUG);
                            break;
                        }
                    }
                    target.MessageStatus("Stamina infinita desativada!");
                    WriteToLog("Stamina infinita desativada para " + playerID, LogFile.INIT, false, LogType.INFO);
                }
                else
                {
                    target.MessageStatus("Uso: !stamina on | off");
                }
            }
            else
            {
                target.MessageStatus("Uso: !stamina on | off");
            }
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

bool ExecuteCreateContainer(TStringArray tokens)
{
    // Formato: SYSTEM createcontainer ContainerType CoordX CoordY Item1 Item2 ... ItemN
    if (tokens.Count() < 6)
    {
        WriteToLog("ExecuteCreateContainer(): Parâmetros insuficientes", LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    
    string containerType = tokens[2];
    float coordX = tokens[3].ToFloat();
    float coordY = tokens[4].ToFloat();
    
    // Validar tipo de container
    if (containerType != "WoodenCrate" && containerType != "Barrel_Yellow" && containerType != "Barrel_Red" && containerType != "Barrel_Green" && containerType != "Barrel_Blue")
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
    
    // Processar itens
    int itemsProcessed = 0;
    int itemsInContainer = 0;
    int itemsOnGround = 0;
    
    for (int i = 5; i < tokens.Count(); i++)
    {
        string itemType = tokens[i];
        itemsProcessed++;
        
        // Tentar adicionar no container
        EntityAI item = container.GetInventory().CreateInInventory(itemType);
        
        if (item)
        {
            itemsInContainer++;
            WriteToLog("Item " + itemType + " adicionado ao container", LogFile.INIT, false, LogType.DEBUG);
        }
        else
        {
            // Criar no chão próximo ao container
            vector groundPos = containerPos;
            
            // Adicionar offset aleatório pequeno (0.5 a 1.5 metros)
            float offsetX = Math.RandomFloatInclusive(-1.5, 1.5);
            float offsetZ = Math.RandomFloatInclusive(-1.5, 1.5);
            
            groundPos[0] = groundPos[0] + offsetX;
            groundPos[2] = groundPos[2] + offsetZ;
            groundPos[1] = GetGame().SurfaceY(groundPos[0], groundPos[2]);
            
            EntityAI groundItem = EntityAI.Cast(GetGame().CreateObject(itemType, groundPos, false, true));
            
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
    
    WriteToLog("Container criado - Itens processados: " + itemsProcessed.ToString() + ", Dentro: " + itemsInContainer.ToString() + ", No chão: " + itemsOnGround.ToString(), LogFile.INIT, false, LogType.INFO);
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
