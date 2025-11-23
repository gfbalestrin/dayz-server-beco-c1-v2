void AppendExternalAction(string message, bool printMsg = true)
{
    string path = ExternalActionsFile;

    if (message == "") {
        WriteToLog("AppendExternalAction() Mensagem vazia não foi adicionada.", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    FileHandle file = OpenFile(path, FileMode.APPEND);

    if (file != 0) {
        FPrintln(file, message);
        CloseFile(file);
        if (printMsg) {
            WriteToLog("AppendExternalAction() Mensagem adicionada: " + message, LogFile.INIT, false, LogType.DEBUG);
        }        
    } else {
        WriteToLog("AppendExternalAction() Erro ao abrir o arquivo para append: " + path, LogFile.INIT, false, LogType.ERROR);
    }
}

void AppendCommandResult(string message, bool printMsg = true)
{
    string path = CommandsResultsFile;

    if (message == "") {
        WriteToLog("AppendCommandResult() Mensagem vazia não foi adicionada.", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    FileHandle file = OpenFile(path, FileMode.APPEND);

    if (file != 0) {
        FPrintln(file, message);
        CloseFile(file);
        if (printMsg) {
            WriteToLog("AppendCommandResult() Resultado adicionado: " + message, LogFile.INIT, false, LogType.DEBUG);
        }        
    } else {
        WriteToLog("AppendCommandResult() Erro ao abrir o arquivo para append: " + path, LogFile.INIT, false, LogType.ERROR);
    }
}