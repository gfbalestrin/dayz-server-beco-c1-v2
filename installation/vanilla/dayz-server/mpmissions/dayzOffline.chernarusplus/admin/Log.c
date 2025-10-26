void WriteToLog(string content, LogFile file = LogFile.INIT, bool internalCall = false, LogType type = LogType.DEBUG)
{
	string logfile = "init.log";
	switch (file)
	{
		case LogFile.INIT:
			logfile = "init.log";
			break;
		case LogFile.POSITION:
			logfile = "position.log";
			break;
		default:
			logfile = "init.log";
			break;
	}
	string fileName = "$profile:" + logfile;
	FileHandle fileHandle = OpenFile(fileName, FileMode.APPEND);

	if (fileHandle != 0)
	{
		int year, month, day, hour, minute;
		GetGame().GetWorld().GetDate(year, month, day, hour, minute);
		//string time = hour.ToString() + ":" + minute.ToString();
		string prefix = "";
		if (file == LogFile.INIT)
		{
			switch (type)
			{
				case LogType.ERROR:
					prefix = "[ERROR] ";
					break;
				case LogType.INFO:
					prefix = "[INFO] ";
					break;
				case LogType.DEBUG:
					prefix = "[DEBUG] ";
					break;
				default:
					prefix = "";
					break;
			}
		}
		
		string finalMessage = prefix + content;
		FPrintln(fileHandle, finalMessage);
		CloseFile(fileHandle);
	}
	else
	{
		if (!internalCall)
		{
			Print("WriteToLog ERROR: Não foi possível abrir o arquivo de log: " + fileName);
		}
	}
}
void ResetLog(string logfile = "init.log")
{
	string fileName = "$profile:" + logfile;	
	FileHandle clearFile = OpenFile(fileName, FileMode.WRITE);
    
    if (clearFile != -1)  // -1 é o valor de erro
    {
        CloseFile(clearFile);
        WriteToLog("Arquivo de log resetado... " + fileName);
    }
    else
    {
        WriteToLog("⚠️ Falha ao resetar o arquivo de log: " + fileName);
    }
}

string GetCurrentTimestamp()
{
	int year, month, day, hour, minute;
	GetGame().GetWorld().GetDate(year, month, day, hour, minute);
	
	string yearStr = year.ToString();
	
	string monthStr;
	if (month < 10)
		monthStr = "0" + month.ToString();
	else
		monthStr = month.ToString();
	
	string dayStr;
	if (day < 10)
		dayStr = "0" + day.ToString();
	else
		dayStr = day.ToString();
	
	string hourStr;
	if (hour < 10)
		hourStr = "0" + hour.ToString();
	else
		hourStr = hour.ToString();
	
	string minuteStr;
	if (minute < 10)
		minuteStr = "0" + minute.ToString();
	else
		minuteStr = minute.ToString();
	
	return yearStr + "-" + monthStr + "-" + dayStr + " " + hourStr + ":" + minuteStr + ":00";
}

void EnsurePositionsFolderExists()
{
	WriteToLog("EnsurePositionsFolderExists: Verificando pasta: " + PlayerPositionsFolder, LogFile.INIT, false, LogType.DEBUG);
	
	// Cria um arquivo temporário para verificar se a pasta existe
	string testFile = PlayerPositionsFolder + "test.txt";
	FileHandle handle = OpenFile(testFile, FileMode.READ);
	
	if (!handle)
	{
		WriteToLog("EnsurePositionsFolderExists: Pasta não existe, tentando criar...", LogFile.INIT, false, LogType.DEBUG);
		// Pasta não existe, tenta criar o arquivo de teste
		handle = OpenFile(testFile, FileMode.WRITE);
		if (handle)
		{
			CloseFile(handle);
			// Remove o arquivo de teste
			DeleteFile(testFile);
			WriteToLog("Pasta de posições criada: " + PlayerPositionsFolder, LogFile.INIT, false, LogType.INFO);
		}
		else
		{
			WriteToLog("Erro ao criar pasta de posições: " + PlayerPositionsFolder, LogFile.INIT, false, LogType.ERROR);
		}
	}
	else
	{
		WriteToLog("EnsurePositionsFolderExists: Pasta já existe", LogFile.INIT, false, LogType.DEBUG);
		CloseFile(handle);
		DeleteFile(testFile);
	}
}

void SavePlayerPosition(string playerId, string playerName, vector position)
{
	if (playerId == "" || playerName == "")
	{
		WriteToLog("SavePlayerPosition: PlayerId ou PlayerName vazios!", LogFile.INIT, false, LogType.ERROR);
		return;
	}
	
	string fileName = PlayerPositionsFolder + playerId + ".json";
	WriteToLog("SavePlayerPosition: Tentando salvar arquivo: " + fileName, LogFile.INIT, false, LogType.DEBUG);
	
	string jsonContent = "";
	
	// Tenta ler o arquivo existente
	FileHandle readHandle = OpenFile(fileName, FileMode.READ);
	if (readHandle)
	{
		string line;
		while (FGets(readHandle, line) > 0)
		{
			jsonContent += line;
		}
		CloseFile(readHandle);
		WriteToLog("SavePlayerPosition: Arquivo lido com sucesso, tamanho: " + jsonContent.Length(), LogFile.INIT, false, LogType.DEBUG);
	}
	else
	{
		WriteToLog("SavePlayerPosition: Arquivo não existe, criando novo", LogFile.INIT, false, LogType.DEBUG);
	}
	
	// Se o arquivo não existe ou está vazio, cria estrutura inicial
	if (jsonContent == "")
	{
		jsonContent = "{\"playerId\":\"" + playerId + "\",\"playerName\":\"" + playerName + "\",\"positions\":[]}";
		WriteToLog("SavePlayerPosition: Estrutura inicial criada", LogFile.INIT, false, LogType.DEBUG);
	}
	
	// Adiciona a nova posição
	string timestamp = GetCurrentTimestamp();
	string newPosition = "{\"x\":" + position[0].ToString() + ",\"y\":" + position[1].ToString() + ",\"z\":" + position[2].ToString() + ",\"timestamp\":\"" + timestamp + "\"}";
	WriteToLog("SavePlayerPosition: Nova posição criada: " + newPosition, LogFile.INIT, false, LogType.DEBUG);
	
	// Substitui o array de posições
	int positionsStart = jsonContent.IndexOf("\"positions\":[");
	int positionsEnd = jsonContent.IndexOf("]}");
	
	WriteToLog("SavePlayerPosition: positionsStart=" + positionsStart + ", positionsEnd=" + positionsEnd, LogFile.INIT, false, LogType.DEBUG);
	
	if (positionsStart != -1 && positionsEnd != -1)
	{
		int startIndex = positionsStart + 13; // Length of "\"positions\":["
		string before = jsonContent.Substring(0, startIndex);
		string after = jsonContent.Substring(positionsEnd, jsonContent.Length() - positionsEnd);
		
		// Adiciona vírgula se já existem posições
		if (startIndex < positionsEnd)
		{
			string existing = jsonContent.Substring(startIndex, positionsEnd - startIndex).Trim();
			if (existing != "")
			{
				jsonContent = before + existing + "," + newPosition + after;
			}
			else
			{
				jsonContent = before + newPosition + after;
			}
		}
		else
		{
			jsonContent = before + newPosition + after;
		}
	}
	else
	{
		// Formato inesperado, reescreve o arquivo
		WriteToLog("SavePlayerPosition: Formato inesperado, reescrevendo arquivo", LogFile.INIT, false, LogType.DEBUG);
		jsonContent = "{\"playerId\":\"" + playerId + "\",\"playerName\":\"" + playerName + "\",\"positions\":[" + newPosition + "]}";
	}
	
	// Salva o arquivo
	WriteToLog("SavePlayerPosition: Tentando abrir arquivo para escrita: " + fileName, LogFile.INIT, false, LogType.DEBUG);
	FileHandle writeHandle = OpenFile(fileName, FileMode.WRITE);
	if (writeHandle)
	{
		WriteToLog("SavePlayerPosition: Arquivo aberto para escrita com sucesso", LogFile.INIT, false, LogType.DEBUG);
		FPrintln(writeHandle, jsonContent);
		CloseFile(writeHandle);
		WriteToLog("Posição salva para jogador: " + playerName + " (" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
	}
	else
	{
		WriteToLog("Erro ao salvar posição do jogador: " + playerName + " - falha ao abrir arquivo para escrita", LogFile.INIT, false, LogType.ERROR);
	}
}

