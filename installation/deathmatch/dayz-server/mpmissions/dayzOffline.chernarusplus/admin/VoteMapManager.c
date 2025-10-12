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

		// 'maps' deve ser array/ref já existente no seu escopo
		foreach (ref SafeZoneData mapV : maps)
		{
			if (!mapV) continue;
			BroadcastMessage(mapV.RegionId.ToString() + " - " + mapV.Region + " - digite no chat: !votemap " + mapV.RegionId.ToString(), MessageColor.FRIENDLY);
		}
	}

	void HandleVote(string playerID, int regionId)
	{
		if (!m_IsVotingMapActive)
		{
			SendPrivateMessage(playerID, "A votação ainda não foi iniciada.", MessageColor.WARNING);
			return;
		}

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

		int highest = -1;
		int winner  = -1;

		// Iteração sobre map<int,int>
		foreach (int regionId, int count : m_VoteCountsMap)
		{
			if (count > highest)
			{
				highest = count;
				winner  = regionId;
			}
		}

		if (winner != -1)
		{
			string mapName = "";
			foreach (ref SafeZoneData mapW : maps)
			{
				if (mapW && mapW.RegionId == winner)
				{
					mapName = mapW.Region;
					nextMap = mapW; // assume variável global existente
					break;
				}
			}

			if (m_ChangeMapNow)
			{
				array<Man> playersOnline = new array<Man>();
				GetGame().GetPlayers(playersOnline);

				int totalOnline       = 0;
				int votosNoVencedor   = 0;

				foreach (Man man : playersOnline)
				{
					string id = GetPlayerId(man);
					if (id == "") continue;

					totalOnline++;

					if (m_PlayerVotesMap.Contains(id) && m_PlayerVotesMap.Get(id) == winner)
						votosNoVencedor++;
				}

				WriteToLog("Total online: " + totalOnline.ToString(), LogFile.INIT, false, LogType.DEBUG);
				WriteToLog("Votos no vencedor: " + votosNoVencedor.ToString(), LogFile.INIT, false, LogType.DEBUG);

				if (votosNoVencedor == totalOnline && totalOnline > 0)
				{
					BroadcastMessage("Votação unânime! Reiniciando com o mapa: " + mapName, MessageColor.IMPORTANT);
					AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação de mapa finalizada! O próximo mapa será: " + mapName + "\"}");
					SetActiveRegionById(winner);
					AppendExternalAction("{\"action\": \"restart_server\", \"minutes\": 1, \"message\": \"Servidor será reiniciado em 1 minuto\"}");
				}
				else
				{
					AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação de mapa finalizada! A votação não foi unânime e nenhuma troca será feita.\"}");
					BroadcastMessage("A votação não foi unânime. Nenhuma troca será feita.", MessageColor.WARNING);
				}
			}
			else
			{
				if (mapName == "")
					mapName = "ID " + winner.ToString();

				BroadcastMessage("Mapa vencedor: " + winner + " - " + mapName + " com " + highest.ToString() + " votos.", MessageColor.FRIENDLY);
				AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Mapa vencedor: " + winner + " - " + mapName + " com " + highest.ToString() + " votos.\"}");
				SetActiveRegionById(winner);
			}
		}
		else
		{
			BroadcastMessage("Nenhum voto recebido. O próximo mapa será " + nextMap.Region, MessageColor.FRIENDLY);
			AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Nenhum voto recebido. O próximo mapa será: " + nextMap.Region + "\"}");
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

		foreach (ref SafeZoneData mapS : maps)
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
			foreach (ref SafeZoneData mapL : maps)
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

