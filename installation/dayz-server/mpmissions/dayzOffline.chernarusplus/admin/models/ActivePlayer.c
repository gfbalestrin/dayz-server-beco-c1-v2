// Classe que representa um jogador ativo/conectado no servidor
class ActivePlayer
{
    PlayerIdentity Identity;  // PlayerIdentity do jogador (contém todas as informações)
    Man Player;              // Objeto Man/PlayerBase do jogador
    float ConnectedTime;     // Timestamp de quando conectou
    float DeathTime;         // Timestamp de quando morreu (0 se não morreu)
    bool HasSentConnectedEvent; // Flag para evitar enviar player_connected duplicado
    string SteamId;          // SteamID persistente
    string PlayerId;         // PlayerID persistente
    
    void ActivePlayer(PlayerIdentity identity, Man player = null)
    {
        Identity = identity;
        Player = player;
        ConnectedTime = GetGame().GetTime();
        DeathTime = 0;
        HasSentConnectedEvent = false;
        SyncIdentifiers();
    }
    
    // Retorna a PlayerIdentity
    PlayerIdentity GetIdentity()
    {
        return Identity;
    }
    
    // Atualiza a referência de identidade manualmente
    void SetIdentity(PlayerIdentity identity)
    {
        Identity = identity;
        SyncIdentifiers();
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
        PlayerBase playerBase = PlayerBase.Cast(player);
        if (playerBase && playerBase.GetIdentity())
        {
            SetIdentity(playerBase.GetIdentity());
        }
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
        return SteamId;
    }
    
    // Retorna o Player ID (UID)
    string GetPlayerId()
    {
        if (Identity)
            return Identity.GetId();
        return PlayerId;
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
        return SteamId == steamId;
    }
    
    // Verifica se este jogador é o mesmo baseado no Player ID
    bool IsSamePlayerById(string playerId)
    {
        if (Identity)
            return Identity.GetId() == playerId;
        return PlayerId == playerId;
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
    
    // Marca o jogador como morto
    void MarkAsDead()
    {
        DeathTime = GetGame().GetTime();
    }
    
    // Limpa o flag de morte (usado quando jogador respawna)
    void ClearDeathFlag()
    {
        DeathTime = 0;
    }
    
    // Verifica se o jogador morreu recentemente (dentro do timeout)
    bool IsRecentlyDead(float timeoutSeconds = 10.0)
    {
        if (DeathTime <= 0)
            return false;
        float timeSinceDeath = (GetGame().GetTime() - DeathTime) / 1000.0;
        return timeSinceDeath < timeoutSeconds;
    }
    
    // Marca que o evento de conexão foi enviado
    void MarkConnectedEventSent()
    {
        HasSentConnectedEvent = true;
    }
    
    // Verifica se o evento de conexão já foi enviado
    bool HasConnectedEventBeenSent()
    {
        return HasSentConnectedEvent;
    }

    void SyncIdentifiers()
    {
        if (Identity)
        {
            SteamId = Identity.GetPlainId();
            PlayerId = Identity.GetId();
        }
    }
}

