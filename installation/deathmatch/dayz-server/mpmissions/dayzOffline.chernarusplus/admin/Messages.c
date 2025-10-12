array<string> CheckMessages()
{
    array<string> msgs = new array<string>();
    string path = MessagesToSendoFile;

    //WriteToLog("Verificando mensagens em: " + path, LogFile.INIT, false, LogType.DEBUG);

    FileHandle file = OpenFile(path, FileMode.READ);
    if (file == 0) {
        WriteToLog("Arquivo de mensagens não encontrado ou falha ao abrir: " + path, LogFile.INIT, false, LogType.ERROR);
        return msgs;
    }

    string line;
    int count = 0;

    while (FGets(file, line) > 0) {
        line = line.Trim();
        if (line != "") {
            msgs.Insert(line);
            count++;
        }
    }

    CloseFile(file);
    // if (count > 0)
    //     WriteToLog("Mensagens lidas: " + count.ToString(), LogFile.INIT, false, LogType.DEBUG);

    // Limpa o conteúdo do arquivo após leitura
    FileHandle clearFile = OpenFile(path, FileMode.WRITE);
    if (clearFile != 0) {
        CloseFile(clearFile); // Modo WRITE limpa o arquivo
        //WriteToLog("Arquivo de mensagens limpo após leitura.", LogFile.INIT, false, LogType.DEBUG);
    } else {
        WriteToLog("Falha ao limpar o arquivo de mensagens: " + path, LogFile.INIT, false, LogType.ERROR);
    }

    return msgs;
}

void AppendMessage(string message)
{
    string path = MessagesToSendoFile;

    if (message == "") {
        WriteToLog("Mensagem vazia não foi adicionada.", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    FileHandle file = OpenFile(path, FileMode.APPEND);

    if (file != 0) {
        FPrintln(file, message);
        CloseFile(file);
        //WriteToLog("Mensagem adicionada: " + message, LogFile.INIT, false, LogType.DEBUG);
    } else {
        WriteToLog("Erro ao abrir o arquivo para append: " + path, LogFile.INIT, false, LogType.ERROR);
    }
}

array<string> CheckPrivateMessages()
{
    array<string> msgs = new array<string>();
    string path = MessagesPrivateToSendoFile;

    //WriteToLog("Verificando mensagens em: " + path, LogFile.INIT, false, LogType.DEBUG);

    FileHandle file = OpenFile(path, FileMode.READ);
    if (file == 0) {
        WriteToLog("Arquivo de mensagens não encontrado ou falha ao abrir: " + path, LogFile.INIT, false, LogType.ERROR);
        return msgs;
    }

    string line;
    int count = 0;

    while (FGets(file, line) > 0) {
        line = line.Trim();
        if (line != "") {
            msgs.Insert(line);
            count++;
        }
    }

    CloseFile(file);
    if (count > 0)
        WriteToLog("Mensagens privadas lidas: " + count.ToString(), LogFile.INIT, false, LogType.DEBUG);

    // Limpa o conteúdo do arquivo após leitura
    FileHandle clearFile = OpenFile(path, FileMode.WRITE);
    if (clearFile != 0) {
        CloseFile(clearFile); // Modo WRITE limpa o arquivo
        //WriteToLog("Arquivo de mensagens limpo após leitura.", LogFile.INIT, false, LogType.DEBUG);
    } else {
        WriteToLog("Falha ao limpar o arquivo de mensagens: " + path, LogFile.INIT, false, LogType.ERROR);
    }

    return msgs;
}

void AppendPrivateMessage(string message)
{
    string path = MessagesPrivateToSendoFile;

    if (message == "") {
        WriteToLog("Mensagem vazia não foi adicionada.", LogFile.INIT, false, LogType.DEBUG);
        return;
    }

    FileHandle file = OpenFile(path, FileMode.APPEND);

    if (file != 0) {
        FPrintln(file, message);
        CloseFile(file);
        WriteToLog("Mensagem privada adicionada: " + message, LogFile.INIT, false, LogType.DEBUG);
    } else {
        WriteToLog("Erro ao abrir o arquivo para append: " + path, LogFile.INIT, false, LogType.ERROR);
    }
}