void LogLootContainersDetailed()
	{
		if (!GetGame() || !GetGame().IsServer())
			return;

		array<Object> objects = new array<Object>;
		GetGame().GetObjectsAtPosition("0 0 0", 999999, objects, NULL);

		// Tipos de containers relevantes
		TStringArray lootTypes = {
			"WoodenCrate",
			"Barrel_Yellow",
			"Barrel_Red",
			"Barrel_Blue",
			"CarTent",
			"LargeTent",
			"MediumTent",
			"PartyTent"
		};

		int totalContainers = 0;
		int totalItems = 0;
		string containersJson = "";

		foreach (Object obj : objects)
		{
			if (!obj)
				continue;

			string type = obj.GetType();

			foreach (string lootType : lootTypes)
			{
				if (type == lootType)
				{
					totalContainers++;

					vector pos = obj.GetPosition();
					vector ori = obj.GetOrientation();

					WriteToLog("Loot container found: " + type + " at " + pos.ToString() + " with orientation " + ori.ToString(), LogFile.INIT, false, LogType.INFO);

					// Monta JSON do container
					string containerJson = "";
					string itemsJson = "";

					// --- Verifica itens dentro ---
					EntityAI container = EntityAI.Cast(obj);
					if (container)
					{
						CargoBase cargo = container.GetInventory().GetCargo();
						if (cargo)
						{
							for (int i = 0; i < cargo.GetItemCount(); i++)
							{
								EntityAI item = cargo.GetItem(i);
								if (!item) continue;

								string itemType = item.GetType();
								float health = item.GetHealth("", "");
								totalItems++;

								WriteToLog("Item found: " + itemType + " with health " + health.ToString(), LogFile.INIT, false, LogType.INFO);

								// Adiciona item ao JSON
								if (itemsJson != "")
									itemsJson += ",";
								itemsJson += "{\"type\":\"" + itemType + "\",\"health\":" + health.ToString() + "}";
							}
						}

						// --- Itens em attachments (ex: slots externos de barris e tendas) ---
						for (int a = 0; a < container.GetInventory().AttachmentCount(); a++)
						{
							EntityAI attachment = container.GetInventory().GetAttachmentFromIndex(a);
							if (!attachment) continue;

							string attType = attachment.GetType();
							float attHealth = attachment.GetHealth("", "");
							totalItems++;

							WriteToLog("Attachment found: " + attType + " with health " + attHealth.ToString(), LogFile.INIT, false, LogType.INFO);

							// Adiciona attachment ao JSON
							if (itemsJson != "")
								itemsJson += ",";
							itemsJson += "{\"type\":\"" + attType + "\",\"health\":" + attHealth.ToString() + "}";
						}
					}

					// Monta JSON do container completo
					containerJson = "{\"container_type\":\"" + type + "\",\"position\":{\"x\":" + pos[0].ToString() + ",\"z\":" + pos[1].ToString() + ",\"y\":" + pos[2].ToString() + "},\"orientation\":{\"x\":" + ori[0].ToString() + ",\"y\":" + ori[1].ToString() + ",\"z\":" + ori[2].ToString() + "},\"items\":[" + itemsJson + "]}";

					// Adiciona ao array de containers
					if (containersJson != "")
						containersJson += ",";
					containersJson += containerJson;

					break;
				}
			}
		}

		// Envia JSON via ExternalAction
		if (containersJson != "")
		{
			string jsonAction = "{\"action\":\"containers_positions\",\"container_data\":[" + containersJson + "]}";
			AppendExternalAction(jsonAction);
			WriteToLog("LogLootContainersDetailed(): JSON com " + totalContainers.ToString() + " containers e " + totalItems.ToString() + " itens enviado via ExternalAction", LogFile.INIT, false, LogType.INFO);
		}

		string summary = string.Format("[LOOT SCAN] Containers: %1 ", totalContainers);
		Print(summary);
		WriteToLog(summary, LogFile.INIT, false, LogType.INFO);
	}