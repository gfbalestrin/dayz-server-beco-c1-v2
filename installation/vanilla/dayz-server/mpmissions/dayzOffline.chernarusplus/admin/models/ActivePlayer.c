// Classe que representa um jogador ativo/conectado no servidor
class ActivePlayer
{
    PlayerIdentity Identity;  // PlayerIdentity do jogador (contém todas as informações)
    Man Player;              // Objeto Man/PlayerBase do jogador
    float ConnectedTime;     // Timestamp de quando conectou
    
    void ActivePlayer(PlayerIdentity identity, Man player = null)
    {
        Identity = identity;
        Player = player;
        ConnectedTime = GetGame().GetTime();
    }
    
    // Retorna a PlayerIdentity
    PlayerIdentity GetIdentity()
    {
        return Identity;
    }
    
    // Retorna o objeto Man/PlayerBase
    Man GetPlayer()
    {
        return Player;
    }
    
    // Atualiza o objeto Man/PlayerBase
    void SetPlayer(Man player)
    {
        Player = player;
    }
    
    // Retorna o nome do jogador
    string GetPlayerName()
    {
        if (Identity)
            return Identity.GetName();
        return "";
    }
    
    // Retorna o Steam ID
    string GetSteamId()
    {
        if (Identity)
            return Identity.GetPlainId();
        return "";
    }
    
    // Retorna o Player ID (UID)
    string GetPlayerId()
    {
        if (Identity)
            return Identity.GetId();
        return "";
    }
    
    // Retorna o tempo que está conectado em segundos
    float GetConnectedDuration()
    {
        return (GetGame().GetTime() - ConnectedTime) / 1000.0;
    }
    
    // Verifica se este jogador é o mesmo baseado no Steam ID
    bool IsSamePlayer(string steamId)
    {
        if (Identity)
            return Identity.GetPlainId() == steamId;
        return false;
    }
    
    // Verifica se este jogador é o mesmo baseado no Player ID
    bool IsSamePlayerById(string playerId)
    {
        if (Identity)
            return Identity.GetId() == playerId;
        return false;
    }
    
    // Verifica se tem PlayerIdentity válida
    bool HasIdentity()
    {
        return Identity != null;
    }
    
    // Verifica se tem objeto Man/PlayerBase válido
    bool HasPlayer()
    {
        return Player != null;
    }
}

