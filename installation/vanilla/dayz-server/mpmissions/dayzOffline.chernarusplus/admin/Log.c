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

string GetCurrentDate()
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
	
	return yearStr + "-" + monthStr + "-" + dayStr;
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

