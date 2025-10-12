class Explosive {
    string name_type;
    int slots;
    int width;
    int height;
    int quantity;
}

class WeaponAttachment {
    string name_type;
    string type;
    int slots;
    int width;
    int height;
    bool battery;
}

class WeaponMagazine {
    string name_type;
    int capacity;
    int slots;
    int width;
    int height;
}

class WeaponAmmunition {
    string name_type;
    int slots;
    int width;
    int height;
}

class WeaponData {
    string name_type;
    string feed_type;
    int slots;
    int width;
    int height;
    ref WeaponAmmunition ammunitions;
    ref WeaponMagazine magazine;
    ref array<ref WeaponAttachment> attachments;
}

class Weapons {
    ref WeaponData primary_weapon;
    ref WeaponData secondary_weapon;
    ref WeaponData small_weapon;
}

class LoadoutItem {
    string name_type;
    string type_name;
    int slots;
    int width;
    int height;
    int storage_slots;
    int storage_width;
    int storage_height;
    string localization;
    ref array<ref LoadoutItem> subitems;
}

class LoadoutData {
    ref Weapons weapons;
    ref array<ref Explosive> explosives;
    ref array<ref LoadoutItem> items;
}

class LoadoutPlayer {
    int Id;
    bool IsActive;
    string Name;
    ref LoadoutData Loadout;
}