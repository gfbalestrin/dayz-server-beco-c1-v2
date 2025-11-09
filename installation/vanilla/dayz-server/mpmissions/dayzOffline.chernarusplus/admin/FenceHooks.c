class Fence;

modded class BaseBuilding
{
	override void OnPartBuiltServer(int partId, PlayerBase player, ItemBase tool)
	{
		super.OnPartBuiltServer(partId, player, tool);
		
		if (!GetGame() || !GetGame().IsServer())
			return;
		
		if (!this || !this.IsKindOf("Fence"))
			return;
		
		Fence builtFence = Fence.Cast(this);
		if (!builtFence)
			return;
		
		RegisterFence(builtFence);
	}
}


