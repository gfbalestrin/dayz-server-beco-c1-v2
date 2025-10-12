class VoteKickManager
{
	private ref map<string, bool> playerVotesKick;
	private bool isVotingKickActive;
	private float votingKickDuration;
	private ref Timer votingKickTimer;

	private string targetPlayerId;
	private string targetPlayerName;

	void VoteKickManager()
	{
		playerVotesKick = new map<string, bool>();
		votingKickTimer = new Timer(CALL_CATEGORY_GAMEPLAY);
		isVotingKickActive = false;
		votingKickDuration = 120.0;
	}

	// Inicia a votação para kickar um jogador
	void StartKickVote(string callerId, string targetId, string targetName)
	{
		if (isVotingKickActive) {
			SendPrivateMessage(callerId, "Já existe uma votação de kick em andamento.", MessageColor.WARNING);
			return;
		}

		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		if (players.Count() < 3) {
			BroadcastMessage("É necessário pelo menos 3 jogadores online para iniciar uma votação de kick.", MessageColor.WARNING);
			return;
		}

		bool found = false;
		foreach (Man man : players) {
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity() && player.GetIdentity().GetId() == targetId) {
				found = true;
				break;
			}
		}

		if (!found) {
			SendPrivateMessage(callerId, "O jogador não está online ou o ID está incorreto.", MessageColor.WARNING);
			return;
		}

		isVotingKickActive = true;
		targetPlayerId = targetId;
		targetPlayerName = targetName;
		playerVotesKick.Clear();

		votingKickTimer.Run(votingKickDuration, this, "FinalizarKickVote");

		BroadcastMessage("Votação para kickar " + targetPlayerName + " iniciada! Digite 1 para SIM ou 2 para NÃO.", MessageColor.WARNING);
		WriteToLog("Votação de kick iniciada por " + callerId + " contra " + targetPlayerId, LogFile.INIT, false, LogType.INFO);
		AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação para kickar " + targetPlayerName + " iniciada!\"}");
	}

	// Processa o voto de um jogador
	void HandleVote(string playerId, int vote)
	{
		if (!isVotingKickActive) {
			SendPrivateMessage(playerId, "Nenhuma votação de kick está ativa no momento.", MessageColor.WARNING);
			return;
		}

		if (!IsPlayerOnline(playerId)) {
			// Proteção contra votos de jogadores já desconectados
			return;
		}

		if (playerId == targetPlayerId) {
			SendPrivateMessage(playerId, "Você não pode votar na votação para seu próprio kick.", MessageColor.WARNING);
			return;
		}

		if (playerVotesKick.Contains(playerId)) {
			SendPrivateMessage(playerId, "Você já votou.", MessageColor.WARNING);
			return;
		}

		if (vote != 1 && vote != 2) {
			SendPrivateMessage(playerId, "Voto inválido. Digite 1 para SIM ou 2 para NÃO.", MessageColor.WARNING);
			return;
		}

		playerVotesKick.Insert(playerId, vote == 1);

		SendPrivateMessage(playerId, "Seu voto foi registrado.", MessageColor.FRIENDLY);

		CheckIfAllVoted();
	}

	// Verifica se todos os jogadores online (exceto o alvo) já votaram
	void CheckIfAllVoted()
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		int totalVoters = 0;
		foreach (Man man : players) {
			PlayerBase player = PlayerBase.Cast(man);
			if (!player || !player.GetIdentity()) continue;

			string id = player.GetIdentity().GetId();
			if (id != targetPlayerId) totalVoters++;
		}

		if (playerVotesKick.Count() >= totalVoters) {
			votingKickTimer.Stop();
			FinalizarKickVote();
		}
	}

	// Finaliza a votação, verifica resultado e aplica kick se for unânime
	void FinalizarKickVote()
	{
		int simVotes = 0;

		foreach (bool v : playerVotesKick) {
			if (v) simVotes++;
		}

		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		if (players.Count() < 3) {
			BroadcastMessage("É necessário pelo menos 3 jogadores online para finalizar uma votação de kick. A votação foi anulada.", MessageColor.WARNING);
			ResetKickVote();
			return;
		}

		int totalVoters = 0;
		foreach (Man man : players) {
			PlayerBase player = PlayerBase.Cast(man);
			if (!player || !player.GetIdentity()) continue;

			string id = player.GetIdentity().GetId();
			if (id != targetPlayerId) totalVoters++;
		}

		if (simVotes == totalVoters) {
			KickPlayerById(targetPlayerId);
			BroadcastMessage("Jogador " + targetPlayerName + " foi kickado por votação unânime!", MessageColor.IMPORTANT);
			WriteToLog("Jogador " + targetPlayerId + " kickado após votação.", LogFile.INIT, false, LogType.INFO);
			AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Jogador " + targetPlayerId + " kickado após votação.\"}");
		} else {
			BroadcastMessage("Votação para kickar " + targetPlayerName + " falhou. Votos SIM: " + simVotes + "/" + totalVoters, MessageColor.WARNING);
			AppendExternalAction("{\"action\":\"send_log_discord\",\"message\":\"Votação para kickar " + targetPlayerName + " falhou. Votos SIM: " + simVotes + "/" + totalVoters + "\"}");
		}

		ResetKickVote();
	}

	// Reseta os dados da votação
	void ResetKickVote()
	{
		isVotingKickActive = false;
		playerVotesKick.Clear();
		targetPlayerId = "";
		targetPlayerName = "";
	}

	// Lista os jogadores online, ocultando o solicitante
	void ListarJogadoresOnline(string solicitanteId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		if (players.Count() <= 1) {
			SendPrivateMessage(solicitanteId, "Você é o único jogador online.", MessageColor.WARNING);
			return;
		}

		SendPrivateMessage(solicitanteId, "Jogadores online:", MessageColor.FRIENDLY);

		foreach (Man man : players) {
			PlayerBase player = PlayerBase.Cast(man);
			if (!player || !player.GetIdentity()) continue;

			string playerId = player.GetIdentity().GetId();
			string playerName = player.GetIdentity().GetName();

			if (playerId == solicitanteId) continue;

			SendPrivateMessage(solicitanteId, playerName + " - ID: " + playerId, MessageColor.FRIENDLY);
		}
	}

	// Verifica se um player está online
	private bool IsPlayerOnline(string playerId)
	{
		array<Man> players = new array<Man>();
		GetGame().GetPlayers(players);

		foreach (Man man : players) {
			PlayerBase player = PlayerBase.Cast(man);
			if (player && player.GetIdentity() && player.GetIdentity().GetId() == playerId)
				return true;
		}
		return false;
	}
}
