class SafeZoneDataVehicle {
    string name;
    string coord;

    vector GetCoord()
    {
        coord.Replace(",", " "); 
        return coord.ToVector();
    }
    
}
class SafeZoneDataSpawns {
    ref array<SafeZoneDataVehicle> Vehicles;
}
class SafeZoneData {
    int RegionId;
	string Region;
	string CustomMessage;
	ref array<string> SpawnZones;
	ref array<string> WallZones;
	bool Active;
    SafeZoneDataSpawns Spawns;

	ref array<vector> GetSpawnZoneVectors() {
        ref array<vector> vecs = new array<vector>();
        foreach (string s : SpawnZones) {
            s.Replace(",", " "); 
            vector v = s.ToVector();
            vecs.Insert(v);
        }
        return vecs;
    }

    ref array<vector> GetWallZoneVectors() {
        ref array<vector> vecs = new array<vector>();
        foreach (string s : WallZones) {
            s.Replace(",", " "); 
            vector v = s.ToVector();
            vecs.Insert(v);
        }
        return vecs;
    }
}