void HandleWeaponLoadout(Weapons weapons, PlayerBase player, string playerId)
{
    if (!weapons) return;

    if (weapons.primary_weapon)
        HandleWeaponData(weapons.primary_weapon, player, 0, "primary", playerId);

    if (weapons.secondary_weapon)
        HandleWeaponData(weapons.secondary_weapon, player, 1, "secondary", playerId);

    if (weapons.small_weapon)
        HandleWeaponData(weapons.small_weapon, player, 2, "small", playerId);
}

void HandleWeaponData(WeaponData weaponData, PlayerBase player, int quickBarSlot, string label, string playerId)
{
    if (!weaponData.name_type)
        return;

    bool possuiAttachments = false;
    bool possuiMagazine = false;
    bool possuiAmmo = false;

    EntityAI weaponEntity; 
    if (label == "primary")
        weaponEntity = player.GetHumanInventory().CreateInHands(weaponData.name_type);
    else
        weaponEntity = player.GetInventory().CreateInInventory(weaponData.name_type);

    if (!weaponEntity) {
        weaponEntity = TryCreateItemInInventoryOrOnGround(player, weaponData.name_type);
        if (!weaponEntity)
        {
            WriteToLog("Falha ao criar arma: " + weaponData.name_type, LogFile.INIT, false, LogType.ERROR);
            return;
        }        
    }

    player.SetQuickBarEntityShortcut(weaponEntity, quickBarSlot, true);

    WriteToLog("Criada arma " + label + ": " + weaponData.name_type, LogFile.INIT, false, LogType.INFO);
    if (weaponData.attachments) {
        if (weaponData.attachments.Count() > 0)
            possuiAttachments = true;
    }
    if (weaponData.magazine) {
        if (weaponData.magazine.name_type != "")
            possuiMagazine = true;
    }
    if (weaponData.ammunitions) {
        if (weaponData.ammunitions.name_type != "")
            possuiAmmo = true;
    }

    if (possuiAttachments) {
        foreach (WeaponAttachment att : weaponData.attachments) {
            if (!att || att.name_type == "") continue;

            EntityAI attEntity = weaponEntity.GetInventory().CreateAttachment(att.name_type);
            if (attEntity) {
                WriteToLog("Anexado: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                if (att.battery) {
                    EntityAI battery = attEntity.GetInventory().CreateAttachment("Battery9V");
                    if (battery)
                        WriteToLog("Bateria adicionada a: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                    else
                        WriteToLog("Falha ao adicionar bateria à: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                }
            } else {
                WriteToLog("Falha ao anexar: " + att.name_type, LogFile.INIT, false, LogType.ERROR);
                WriteToLog("Tentando criar no inventário do jogador...", LogFile.INIT, false, LogType.INFO);
                EntityAI attEntity2 = player.GetInventory().CreateInInventory(att.name_type);
                if (attEntity2) {
                    WriteToLog("Criado no inventário: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                    if (att.battery) {
                        EntityAI battery2 = attEntity2.GetInventory().CreateAttachment("Battery9V");
                        if (battery2)
                            WriteToLog("Bateria adicionada a: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                        else
                            WriteToLog("Falha ao adicionar bateria à: " + att.name_type, LogFile.INIT, false, LogType.INFO);
                    }
                } else {
                    if (!TryCreateItemInInventoryOrOnGround(player, att.name_type))
                        WriteToLog("Falha ao anexar: " + att.name_type, LogFile.INIT, false, LogType.ERROR);
                }
            }
        }
    }

    Weapon_Base weapon_base = Weapon_Base.Cast(weaponEntity);
    if (!weapon_base) {
        WriteToLog("Falha no cast de Weapon_Base para: " + weaponData.name_type, LogFile.INIT, false, LogType.ERROR);
        return;
    }

    if (possuiMagazine) {
        Magazine mag = weapon_base.SpawnAttachedMagazine(weaponData.magazine.name_type);
        if (!mag) {
            WriteToLog("Falha ao anexar pente " + weaponData.magazine.name_type + " para arma: " + weaponData.name_type, LogFile.INIT, false, LogType.ERROR);
            TryCreateItemInInventoryOrOnGround(player, weaponData.magazine.name_type);
            return;
        }
        if (possuiAmmo)
        {
            // Funciona mas munição aleatória
            int amountAmmo = mag.GetAmmoMax() - 1;
            if (amountAmmo > 0) {
                mag.LocalSetAmmoCount(amountAmmo);	
                mag.ServerSetAmmoCount(amountAmmo);
                WriteToLog("Pente carregado com " + amountAmmo.ToString() + " munições.", LogFile.INIT, false, LogType.INFO);
            }

            // // Não funcionou
            // mag.LocalSetAmmoCount(0);	
            // mag.ServerSetAmmoCount(0);            
            // weapon_base.FillInnerMagazine(weaponData.ammunitions.name_type, WeaponWithAmmoFlags.MAX_CAPACITY_MAG);

        }        
    } else if (weaponData.feed_type == "manual" && possuiAmmo) {
        // Shotguns, revolvers
        WriteToLog("Arma sem suporte a pente. Tentando criar munição no chamber... ", LogFile.INIT, false, LogType.INFO);
        // Funciona mas munição aleatória
        //weapon_base.SpawnAmmo("", WeaponWithAmmoFlags.CHAMBER);	

        int muzzCount = weapon_base.GetMuzzleCount();
        WriteToLog("Quantidade suportada no chamber: " + muzzCount, LogFile.INIT, false, LogType.INFO);
        for (int imuzzCount = 0; imuzzCount < muzzCount; ++imuzzCount)
        {   
            WriteToLog("Inserindo municao " + weaponData.ammunitions.name_type + " no chamber... " + imuzzCount, LogFile.INIT, false, LogType.INFO);
            weapon_base.FillChamber(weaponData.ammunitions.name_type);
        }   

    } else if (weaponData.feed_type == "internal" && possuiAmmo) {
        WriteToLog("Arma sem suporte a pente. Tentando criar munição no pente interno... ", LogFile.INIT, false, LogType.INFO);
        // Funciona mas munição aleatória
        //weapon_base.SpawnAmmo("", WeaponWithAmmoFlags.CHAMBER);	

        weapon_base.FillInnerMagazine(weaponData.ammunitions.name_type);
    } else if (possuiAmmo)
    {
        WriteToLog("O tipo de alimentação da arma não foi identificado. Tentando criar munição com o método SpawnAmmo... ", LogFile.INIT, false, LogType.INFO);
        weapon_base.SpawnAmmo(weaponData.ammunitions.name_type, WeaponWithAmmoFlags.CHAMBER);
    }

    // Extra cria no inventário enquanto não tem customização
    if (possuiMagazine)
    {        
        int qtdMagazineExtra = 3;
        if (weaponData.magazine.slots > 4)
            qtdMagazineExtra = 1;

        WriteToLog("Criando pentes extras...", LogFile.INIT, false, LogType.INFO);
        for (int magExtraI = 0; magExtraI < qtdMagazineExtra; magExtraI++) {
            EntityAI magExtra = player.GetInventory().CreateInInventory(weaponData.magazine.name_type);
            if (!magExtra)
            {
                magExtra = TryCreateItemInInventoryOrOnGround(player, weaponData.magazine.name_type);
                if (!magExtra)
                {
                    WriteToLog("Erro ao criar pente extra!", LogFile.INIT, false, LogType.ERROR);
                    break;
                }                
            }
            Magazine magExtraCast = Magazine.Cast(magExtra);
            if (!magExtraCast)
            {
                WriteToLog("Erro ao tentar colocar munição no pente extra!", LogFile.INIT, false, LogType.ERROR);
                break;
            }
            magExtraCast.ServerSetAmmoCount(weaponData.magazine.capacity);
            WriteToLog("Pente extra criado e carregado!", LogFile.INIT, false, LogType.INFO);
        }
    }
    if (possuiAmmo)
    {
        for (int ammoExtraI = 0; ammoExtraI < 5; ammoExtraI++) {
            EntityAI ammoExtra = player.GetInventory().CreateInInventory(weaponData.ammunitions.name_type);
            if (!ammoExtra)
            {
                ammoExtra = TryCreateItemInInventoryOrOnGround(player, weaponData.ammunitions.name_type);
                if (!ammoExtra)
                {
                    WriteToLog("Erro ao criar munição extra!", LogFile.INIT, false, LogType.ERROR);
                    break;
                }                
            }
        }
        
    }

}

EntityAI CreateItemWithSubitems(EntityAI parent, LoadoutItem itemData, PlayerBase player)
{
    EntityAI item;

    if (parent) {
        WriteToLog("Criando item como attachment: " + itemData.name_type, LogFile.INIT, false, LogType.INFO);
        item = parent.GetInventory().CreateAttachment(itemData.name_type);
    } else {
        WriteToLog("Criando item no inventário: " + itemData.name_type, LogFile.INIT, false, LogType.INFO);
        item = player.GetInventory().CreateInInventory(itemData.name_type);
    }

    if (!item) {
        item = TryCreateItemInInventoryOrOnGround(player, itemData.name_type);
        if (!item)
        {
            WriteToLog("CreateItemWithSubitems() Erro ao criar item: " + itemData.name_type, LogFile.INIT, false, LogType.ERROR);
            return null;
        }
    }

    if (itemData.subitems) {
        foreach (LoadoutItem sub : itemData.subitems) {
            if (sub) {
                CreateItemWithSubitems(item, sub, player);
            } else {
                WriteToLog("Subitem nulo detectado para: " + itemData.name_type, LogFile.INIT, false, LogType.ERROR);
            }
        }
    }

    return item;
}

bool GiveAdminLoadout(PlayerBase player, string playerId)
{
    string jsonPlayerId = LoadoutAdminJsonFile;
    FileHandle handle2 = OpenFile(jsonPlayerId, FileMode.READ);
    if (!handle2)
    {
        WriteToLog("Arquivo de loadout admin não encontrado: " + jsonPlayerId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }
    CloseFile(handle2);

    ref array<ref LoadoutPlayer> loadoutsPlayer;
    JsonFileLoader<array<ref LoadoutPlayer>>.JsonLoadFile(jsonPlayerId, loadoutsPlayer);

    if (!loadoutsPlayer || loadoutsPlayer.Count() == 0)
    {
        WriteToLog("JSON de loadout admin carregado, mas lista vazia ou nula.", LogFile.INIT, false, LogType.ERROR);
        return false;
    }

    LoadoutPlayer loadoutPlayer = null;
    foreach (ref LoadoutPlayer entry2 : loadoutsPlayer)
    {
        if (!entry2)
            continue;

        if (entry2.IsActive)
        {
            loadoutPlayer = entry2;
            break;
        }
    }

    if (!loadoutPlayer)
    {
        WriteToLog("O de loadout admin não tem nenhum loadout ativo.", LogFile.INIT, false, LogType.INFO);
        return false;
    }

    LoadoutData data = loadoutPlayer.Loadout;
    if (!data) {
        WriteToLog("Erro ao obter dados de loadout admin para: " + playerId, LogFile.INIT, false, LogType.ERROR);
        return false;
    }

    WriteToLog("Iniciando loadout admin para player " + playerId, LogFile.INIT, false, LogType.INFO);

    // Itens extras
    if (data.items) {
        foreach (LoadoutItem li : data.items) {
            CreateItemWithSubitems(null, li, player);
        }
    }

    // Armas
    HandleWeaponLoadout(data.weapons, player, playerId);

    // Explosivos
    if (data.explosives) {
        WriteToLog("Criando explosivos...", LogFile.INIT, false, LogType.INFO);
        foreach (Explosive explosive : data.explosives) {
            for (int e = 0; e < explosive.quantity; e++) {
                EntityAI ex = player.GetInventory().CreateInInventory(explosive.name_type);
                if (ex)
                    WriteToLog("Criado explosivo: " + explosive.name_type, LogFile.INIT, false, LogType.INFO);
                else
                    WriteToLog("Erro ao criar explosivo: " + explosive.name_type, LogFile.INIT, false, LogType.ERROR);
            }
        }
    }

    WriteToLog("Loadout aplicado com sucesso", LogFile.INIT, false, LogType.INFO);
    return true;
}

EntityAI TryCreateItemInInventoryOrOnGround(PlayerBase player, string itemType)
{
    EntityAI item = player.GetInventory().CreateInInventory(itemType);

    if (!item) // Inventário cheio ou item incompatível
    {
        vector position = player.GetPosition();
        position[1] = GetGame().SurfaceY(position[0], position[2]); // Garante o item no solo

        item = EntityAI.Cast(GetGame().CreateObject(itemType, position, false, true));
        if (item)
        {
            WriteToLog("Item " + itemType + " criado no chão por falta de espaço no inventário.", LogFile.INIT, false, LogType.ERROR);
        }
        else
        {
            WriteToLog("Falha ao criar item " + itemType + " no inventário e no chão.", LogFile.INIT, false, LogType.ERROR);
        }
    }

    return item;
}
