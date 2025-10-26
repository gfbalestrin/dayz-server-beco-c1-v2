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
	string monthStr = month < 10 ? ("0" + month.ToString()) : month.ToString();
	string dayStr = day < 10 ? ("0" + day.ToString()) : day.ToString();
	string hourStr = hour < 10 ? ("0" + hour.ToString()) : hour.ToString();
	string minuteStr = minute < 10 ? ("0" + minute.ToString()) : minute.ToString();
	
	return yearStr + "-" + monthStr + "-" + dayStr + " " + hourStr + ":" + minuteStr + ":00";
}

void EnsurePositionsFolderExists()
{
	// Cria um arquivo temporário para verificar se a pasta existe
	string testFile = PlayerPositionsFolder + "test.txt";
	FileHandle handle = OpenFile(testFile, FileMode.READ);
	
	if (!handle)
	{
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
		CloseFile(handle);
		DeleteFile(testFile);
	}
}

void SavePlayerPosition(string playerId, string playerName, vector position)
{
	if (playerId == "" || playerName == "")
		return;
	
	string fileName = PlayerPositionsFolder + playerId + ".json";
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
	}
	
	// Se o arquivo não existe ou está vazio, cria estrutura inicial
	if (jsonContent == "")
	{
		jsonContent = "{\"playerId\":\"" + playerId + "\",\"playerName\":\"" + playerName + "\",\"positions\":[]}";
	}
	
	// Adiciona a nova posição
	string timestamp = GetCurrentTimestamp();
	string newPosition = "{\"x\":" + position[0].ToString() + ",\"y\":" + position[1].ToString() + ",\"z\":" + position[2].ToString() + ",\"timestamp\":\"" + timestamp + "\"}";
	
	// Substitui o array de posições
	int positionsStart = jsonContent.IndexOf("\"positions\":[");
	int positionsEnd = jsonContent.IndexOf("]}");
	
	if (positionsStart != -1 && positionsEnd != -1)
	{
		int startIndex = positionsStart + 13; // Length of "\"positions\":["
		string before = jsonContent.Substring(0, startIndex);
		string after = jsonContent.Substring(positionsEnd);
		
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
		jsonContent = "{\"playerId\":\"" + playerId + "\",\"playerName\":\"" + playerName + "\",\"positions\":[" + newPosition + "]}";
	}
	
	// Salva o arquivo
	FileHandle writeHandle = OpenFile(fileName, FileMode.WRITE);
	if (writeHandle)
	{
		FPrintln(writeHandle, jsonContent);
		CloseFile(writeHandle);
		WriteToLog("Posição salva para jogador: " + playerName + " (" + playerId + ")", LogFile.INIT, false, LogType.DEBUG);
	}
	else
	{
		WriteToLog("Erro ao salvar posição do jogador: " + playerName, LogFile.INIT, false, LogType.ERROR);
	}
}

