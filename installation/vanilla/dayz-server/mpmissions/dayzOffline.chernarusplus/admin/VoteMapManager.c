class VoteMapManager
{
	private ref map<string, int> m_PlayerVotesMap;
	private ref map<int, int>    m_VoteCountsMap;
	private ref Timer            m_VotingMapTimer;

	private bool  m_IsVotingMapActive = false;
	private float m_VotingMapDuration = 300.0; // segundos
	private bool  m_ChangeMapNow = false;

	void VoteMapManager()
	{
		m_PlayerVotesMap = new map<string, int>();
		m_VoteCountsMap  = new map<int, int>();
		m_VotingMapTimer = new Timer(CALL_CATEGORY_GAMEPLAY);
	}

	void ~VoteMapManager()
	{
		if (m_VotingMapTimer) m_VotingMapTimer.Stop();
		m_VotingMapTimer = null;
	}

	// --- Get/Set simples ---
	void SetChangeMapNow(bool value) { m_ChangeMapNow = value; }
	bool GetStatusVotingMap()        { return m_IsVotingMapActive; }

	// --- Métodos de validação ---
	private bool IsValidMapForVoting(int regionId)
	{
		if (!maps) return false;

		foreach (ref SafeZoneData mapData : maps)
		{
			if (mapData && mapData.RegionId == regionId && !mapData.IsDeleted)
				return true;
		}
		return false;
	}

	private ref array<ref SafeZoneData> GetVotableMaps()
	{
		ref array<ref SafeZoneData> votableMaps = new array<ref SafeZoneData>();
		
		if (!maps) return votableMaps;

		foreach (ref SafeZoneData mapData : maps)
		{
			if (mapData && !mapData.IsDeleted)
				votableMaps.Insert(mapData);
		}
		return votableMaps;
	}

	private bool ValidatePlayerOnline(string playerID)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		foreach (Man man : players)
		{
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity() && player.GetIdentity().GetId() == playerID)
				return true;
		}
		return false;
	}

	private void CleanDisconnectedPlayersVotes()
	{
		if (!m_PlayerVotesMap) return;

		array<Man> playersOnline = new array<Man>();
		GetGame().GetPlayers(playersOnline);

		ref array<string> onlinePlayerIds = new array<string>();
		
		foreach (Man man : playersOnline)
		{
			string id = GetPlayerId(man);
			if (id != "")
				onlinePlayerIds.Insert(id);
		}

		ref array<string> disconnectedPlayers = new array<string>();
		
		foreach (string playerID, int regionId : m_PlayerVotesMap)
		{
			bool found = false;
			foreach (string onlineId : onlinePlayerIds)
			{
				if (onlineId == playerID)
				{
					found = true;
					break;
				}
			}
			
			if (!found)
				disconnectedPlayers.Insert(playerID);
		}

		foreach (string disconnectedId : disconnectedPlayers)
		{
			if (m_PlayerVotesMap.Contains(disconnectedId))
			{
				int votedRegionId = m_PlayerVotesMap.Get(disconnectedId);
				
				if (m_VoteCountsMap.Contains(votedRegionId))
				{
					int currentCount = m_VoteCountsMap.Get(votedRegionId);
					if (currentCount > 1)
					{
						m_VoteCountsMap.Set(votedRegionId, currentCount - 1);
					}
					else
					{
						m_VoteCountsMap.Remove(votedRegionId);
					}
				}
				
				m_PlayerVotesMap.Remove(disconnectedId);
			}
		}
	}

	private int CalculateVotingResults()
	{
		if (!m_VoteCountsMap || m_VoteCountsMap.Count() == 0)
			return -1;

		int highest = -1;
		int winner = -1;
		int winnersCount = 0;

		foreach (int regionId, int count : m_VoteCountsMap)
		{
			if (count > highest)
			{
				highest = count;
				winner = regionId;
				winnersCount = 1;
			}
			else if (count == highest)
			{
				winnersCount++;
			}
		}

		if (winnersCount > 1)
		{
			return -1;
		}

		return winner;
	}

	private string FormatMapListForBroadcast()
	{
		ref array<ref SafeZoneData> votableMaps = GetVotableMaps();
		
		if (votableMaps.Count() == 0)
			return "";

		string mapList = "";
		int count = 0;
		
		foreach (ref SafeZoneData mapData : votableMaps)
		{
			if (!mapData) continue;
			
			if (count > 0)
				mapList += ", ";
			
			mapList += mapData.RegionId.ToString() + " - " + mapData.Region;
			count++;
		}
		
		return mapList;
	}

	// --- Fluxo principal ---
	void IniciaVotacaoProximoMapa()
	{
		if (m_IsVotingMapActive) return;

		m_IsVotingMapActive = true;

		// Run(duration, target, "method", params, repeat=false)
		if (m_VotingMapTimer)
			m_VotingMapTimer.Run(m_VotingMapDuration, this, "FinalizarVotacaoMapaTimer", null, false);

		string tempo = FormatTempo(m_VotingMapDuration);

		BroadcastMessage("Votação iniciada! Você tem " + tempo + " para votar.", MessageColor.FRIENDLY);
		WriteToLog("Votação iniciada! Os jogadores têm " + tempo + " para votar.", LogFile.INIT, false, LogType.INFO);
		AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação de mapa iniciada para a troca de mapa\"}");

		string mapList = FormatMapListForBroadcast();
		if (mapList != "")
		{
			BroadcastMessage("Mapas disponíveis: " + mapList + " | Digite: !votemap <ID>", MessageColor.FRIENDLY);
		}
		else
		{
			BroadcastMessage("Nenhum mapa disponível para votação.", MessageColor.WARNING);
		}
	}

	void HandleVote(string playerID, int regionId)
	{
		if (!m_IsVotingMapActive)
		{
			SendPrivateMessage(playerID, "A votação ainda não foi iniciada.", MessageColor.WARNING);
			return;
		}

		if (!ValidatePlayerOnline(playerID))
		{
			SendPrivateMessage(playerID, "Erro: Você não está online.", MessageColor.WARNING);
			return;
		}

		if (!IsValidMapForVoting(regionId))
		{
			SendPrivateMessage(playerID, "ID do mapa inválido ou mapa deletado.", MessageColor.WARNING);
			return;
		}

		CleanDisconnectedPlayersVotes();

		if (m_PlayerVotesMap.Contains(playerID))
		{
			SendPrivateMessage(playerID, "Você já votou nesta rodada.", MessageColor.WARNING);
			return;
		}

		m_PlayerVotesMap.Insert(playerID, regionId);

		int currentVotes = 0;
		if (m_VoteCountsMap.Contains(regionId))
			currentVotes = m_VoteCountsMap.Get(regionId);

		m_VoteCountsMap.Set(regionId, currentVotes + 1);

		string mapName = "";
		foreach (ref SafeZoneData mapI : maps)
		{
			if (mapI && mapI.RegionId == regionId)
			{
				mapName = mapI.Region;
				break;
			}
		}

		SendPrivateMessage(playerID, "Voto registrado para o mapa (" + regionId + ") " + mapName, MessageColor.FRIENDLY);
		WriteToLog("VOTO: " + playerID + " votou em (" + regionId + ") " + mapName, LogFile.INIT, false, LogType.INFO);

		array<Man> playersOnline = new array<Man>();
		GetGame().GetPlayers(playersOnline);

		int totalOnline = 0;
		int totalVotaram = 0;

		foreach (Man man : playersOnline)
		{
			string id = GetPlayerId(man);
			if (id == "") continue;

			totalOnline++;

			if (m_PlayerVotesMap.Contains(id))
				totalVotaram++;
		}

		WriteToLog("Jogadores online: " + totalOnline.ToString(), LogFile.INIT, false, LogType.DEBUG);
		WriteToLog("Jogadores que votaram: " + totalVotaram.ToString(), LogFile.INIT, false, LogType.DEBUG);

		if (totalOnline > 0 && totalVotaram == totalOnline)
		{
			if (m_VotingMapTimer && m_VotingMapTimer.IsRunning())
				m_VotingMapTimer.Stop();

			WriteToLog("Todos os jogadores votaram. Encerrando votação.", LogFile.INIT, false, LogType.INFO);
			FinalizarVotacaoMapaTimer();
		}
	}

	void FinalizarVotacaoMapaTimer()
	{
		m_IsVotingMapActive = false;

		CleanDisconnectedPlayersVotes();

		int winner = CalculateVotingResults();

		if (winner == -1)
		{
			if (m_VoteCountsMap && m_VoteCountsMap.Count() == 0)
			{
				BroadcastMessage("Nenhum voto recebido. O próximo mapa será " + nextMap.Region, MessageColor.FRIENDLY);
				AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Nenhum voto recebido. O próximo mapa será: " + nextMap.Region + "\"}");
			}
			else
			{
				BroadcastMessage("Votação empatada. Mantendo próximo mapa: " + nextMap.Region, MessageColor.WARNING);
				AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação de mapa empatada. Mantendo próximo mapa: " + nextMap.Region + "\"}");
			}
		}
		else
		{
			string mapName = "";
			
			foreach (ref SafeZoneData mapW : maps)
			{
				if (mapW && mapW.RegionId == winner)
				{
					mapName = mapW.Region;
					break;
				}
			}

			if (mapName == "")
				mapName = "ID " + winner.ToString();

			int voteCount = 0;
			if (m_VoteCountsMap.Contains(winner))
				voteCount = m_VoteCountsMap.Get(winner);

			BroadcastMessage("Mapa vencedor: " + winner.ToString() + " - " + mapName + " com " + voteCount.ToString() + " voto(s).", MessageColor.FRIENDLY);
			AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação de mapa finalizada! O próximo mapa será: " + mapName + " com " + voteCount.ToString() + " voto(s).\"}");

			SetNextActiveRegionById(winner);

			if (m_ChangeMapNow)
			{
				AppendExternalAction("{\"action\": \"restart_server\", \"minutes\": 1, \"message\": \"Servidor será reiniciado em 1 minuto\"}");
			}
		}

		ResetVotingMap();
	}

	void ResetVotingMap()
	{
		if (m_VotingMapTimer && m_VotingMapTimer.IsRunning())
			m_VotingMapTimer.Stop();

		if (m_PlayerVotesMap) m_PlayerVotesMap.Clear();
		if (m_VoteCountsMap)  m_VoteCountsMap.Clear();

		m_IsVotingMapActive = false;
		m_ChangeMapNow      = false;
	}

	void ShowResultVotingMap(string playerID)
	{
		if (!m_IsVotingMapActive)
		{
			SendPrivateMessage(playerID, "Nenhuma votação está ativa no momento.", MessageColor.WARNING);
			return;
		}

		SendPrivateMessage(playerID, "Resultado parcial da votação:", MessageColor.FRIENDLY);

		ref array<ref SafeZoneData> votableMaps = GetVotableMaps();

		foreach (ref SafeZoneData mapS : votableMaps)
		{
			if (!mapS) continue;

			int votos = 0;
			if (m_VoteCountsMap.Contains(mapS.RegionId))
				votos = m_VoteCountsMap.Get(mapS.RegionId);

			string linha = mapS.RegionId.ToString() + " - " + mapS.Region + " (" + votos.ToString() + " voto";
			if (votos != 1) linha += "s";
			linha += ")";

			SendPrivateMessage(playerID, linha, MessageColor.FRIENDLY);
		}
	}

	void CheckVotingStatus(string playerID)
	{
		if (m_IsVotingMapActive)
		{
			ShowResultVotingMap(playerID);
		}
		else
		{
			ref array<ref SafeZoneData> votableMaps = GetVotableMaps();
			
			foreach (ref SafeZoneData mapL : votableMaps)
			{
				if (!mapL) continue;
				string linha = mapL.RegionId.ToString() + " - " + mapL.Region;
				SendPrivateMessage(playerID, linha, MessageColor.FRIENDLY);
			}
		}
		SendPrivateMessage(playerID, "Uso: !votemap <ID do mapa>", MessageColor.WARNING);
	}

	void CheckIfVotingAndStart(string playerID, int regionId)
	{
		// if (serverWillRestartSoon) { ... }

		if (!m_IsVotingMapActive)
		{
			IniciaVotacaoProximoMapa();
			SetChangeMapNow(true);
		}

		HandleVote(playerID, regionId);
	}
}
