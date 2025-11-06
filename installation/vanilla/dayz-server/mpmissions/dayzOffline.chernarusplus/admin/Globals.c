string DeathMatchConfigJsonFile = "$mission:admin/files/deathmatch_config.json";
string LoadoutCustomJsonFile = "$mission:admin/loadouts/custom.json";
string LoadoutPlayersIdsJsonFile = "$mission:admin/loadouts/players_ids.json";
string LoadoutPlayersFolder = "$mission:admin/loadouts/players/";
string ExternalCommandsFile = "$mission:admin/files/commands_to_execute.txt";
string ExternalActionsFile = "$mission:admin/files/external_actions.txt";
string MessagesToSendoFile = "$mission:admin/files/messages_to_send.txt";
string MessagesPrivateToSendoFile = "$mission:admin/files/messages_private_to_send.txt";
string AdminIdsFile = "$mission:admin/files/admin_ids.txt";
string UrlAppPython = "http://beco.servegame.com:54321/";
bool IsDeathmatchEnabled = false;

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
ref array<ref SafeZoneData> maps;
ref SafeZoneData currentMap;
ref SafeZoneData nextMap;

// Votação de mapa
ref VoteMapManager g_VoteMapManager;

// Votação de kick
ref VoteKickManager g_VoteKickManager;

bool serverWillRestartSoon = false;
bool m_IsProcessingCommands = false;
const float PLAYER_TIMEOUT = 15.0; // tempo em segundos para considerar desconexão
ref array<CarScript> m_TrackedVehicles;
// Controle de admins
ref array<ref ActivePlayer> g_PlayersWithInfiniteStamina;

// Lista de tipos de granadas a serem inseridas automaticamente (modo sem slots)
ref array<string> DEFAULT_GRENADE_TYPES;
// Lista de coldres permitidos para anexar pistolas
ref array<string> ALLOWED_HOLSTERS;
// Lista de pistolas permitidas para anexar em coldres
ref array<string> ALLOWED_PISTOLS;

void InitializeVestGrenadeSlots()
{
    DEFAULT_GRENADE_TYPES = new array<string>();
    ALLOWED_HOLSTERS = new array<string>();
    ALLOWED_PISTOLS = new array<string>();

    // Granadas padrão a tentar inserir (sem nomes de slots)
    DEFAULT_GRENADE_TYPES.Insert("M67Grenade");

    // TODO: Adicionar os name_type dos coldres permitidos aqui
    ALLOWED_HOLSTERS.Insert("PlateCarrierHolster");

    // TODO: Adicionar os name_type das pistolas permitidas aqui
    ALLOWED_PISTOLS.Insert("Glock19");

    WriteToLog("InitializeVestGrenadeSlots(): Granadas, coldres e pistolas inicializados", LogFile.INIT, false, LogType.INFO);
}