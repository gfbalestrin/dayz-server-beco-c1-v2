modded class Fence
{
	override void OnPartBuiltServer(int partId, PlayerBase player, ItemBase tool)
	{
		super.OnPartBuiltServer(partId, player, tool);
		
		if (!GetGame() || !GetGame().IsServer())
			return;
		
		RegisterFence(this);
	}
}


