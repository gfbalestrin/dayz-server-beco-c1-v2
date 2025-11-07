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
    WARNING,
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
    DEFAULT_GRENADE_TYPES.Insert("FlashGrenade");
    DEFAULT_GRENADE_TYPES.Insert("M18SmokeGrenade_Green");
    DEFAULT_GRENADE_TYPES.Insert("M18SmokeGrenade_Purple");
    DEFAULT_GRENADE_TYPES.Insert("M18SmokeGrenade_Red");
    DEFAULT_GRENADE_TYPES.Insert("M18SmokeGrenade_White");
    DEFAULT_GRENADE_TYPES.Insert("M18SmokeGrenade_Yellow");
    DEFAULT_GRENADE_TYPES.Insert("M67Grenade");
    DEFAULT_GRENADE_TYPES.Insert("RDG2SmokeGrenade_Black");
    DEFAULT_GRENADE_TYPES.Insert("RDG2SmokeGrenade_White");
    DEFAULT_GRENADE_TYPES.Insert("RGD5Grenade");

    // Coldres permitidos para anexar pistolas
    ALLOWED_HOLSTERS.Insert("PlateCarrierHolster");
    ALLOWED_HOLSTERS.Insert("PlateCarrierVest_Black");
    ALLOWED_HOLSTERS.Insert("PlateCarrierVest_Green");
    ALLOWED_HOLSTERS.Insert("PlateCarrierVest_Camo");
    ALLOWED_HOLSTERS.Insert("HighCapacityVest_Black");
    ALLOWED_HOLSTERS.Insert("HighCapacityVest_Olive");
    ALLOWED_HOLSTERS.Insert("SmershVest");
    ALLOWED_HOLSTERS.Insert("UKAssVest_Black");
    ALLOWED_HOLSTERS.Insert("UKAssVest_Camo");
    ALLOWED_HOLSTERS.Insert("UKAssVest_Khaki");
    ALLOWED_HOLSTERS.Insert("UKAssVest_Olive");
    ALLOWED_HOLSTERS.Insert("UKAssVest_Winter");
    ALLOWED_HOLSTERS.Insert("PressVest_Blue");
    ALLOWED_HOLSTERS.Insert("PressVest_LightBlue");
    ALLOWED_HOLSTERS.Insert("PoliceVest");

    // Pistolas permitidas para anexar em coldres
    ALLOWED_PISTOLS.Insert("Glock19");
    ALLOWED_PISTOLS.Insert("MKII");
    ALLOWED_PISTOLS.Insert("Flaregun");
    ALLOWED_PISTOLS.Insert("Magnum");
    ALLOWED_PISTOLS.Insert("SawedoffMagnum");
    ALLOWED_PISTOLS.Insert("P1");
    ALLOWED_PISTOLS.Insert("Longhorn");
    ALLOWED_PISTOLS.Insert("Engraved1911");
    ALLOWED_PISTOLS.Insert("Colt1911");
    ALLOWED_PISTOLS.Insert("MakarovIJ70");
    ALLOWED_PISTOLS.Insert("FNX45");
    ALLOWED_PISTOLS.Insert("Derringer_Black");
    ALLOWED_PISTOLS.Insert("Derringer_Pink");
    ALLOWED_PISTOLS.Insert("Derringer_Grey");
    ALLOWED_PISTOLS.Insert("Deagle");
    ALLOWED_PISTOLS.Insert("Deagle_Gold");
    ALLOWED_PISTOLS.Insert("CZ75");

    WriteToLog("InitializeVestGrenadeSlots(): Granadas, coldres e pistolas inicializados", LogFile.INIT, false, LogType.INFO);
}