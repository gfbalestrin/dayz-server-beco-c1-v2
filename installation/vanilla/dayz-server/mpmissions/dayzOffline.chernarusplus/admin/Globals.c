string LoadoutAdminJsonFile = "$mission:admin/loadouts/admin.json";
string ExternalCommandsFile = "$mission:admin/files/commands_to_execute.txt";
string ExternalActionsFile = "$mission:admin/files/external_actions.txt";
string MessagesToSendoFile = "$mission:admin/files/messages_to_send.txt";
string MessagesPrivateToSendoFile = "$mission:admin/files/messages_private_to_send.txt";
string AdminIdsFile = "$mission:admin/files/admin_ids.txt";

enum MessageColor
{
    STATUS,     // azul
    IMPORTANT,  // vermelho
    FRIENDLY,   // verde
    WARNING      // amarelo (via RPC)
}
enum LogType
{
    DEBUG,
    ERROR,
    INFO
}
enum LogFile
{
    INIT,
    POSITION
}
bool m_IsProcessingCommands = false;
const float PLAYER_TIMEOUT = 15.0; // tempo em segundos para considerar desconexão