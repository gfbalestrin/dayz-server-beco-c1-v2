class ActionBuildPart;

modded class ActionBuildPart
{
	override void OnFinishProgressServer(ActionData action_data)
	{
		super.OnFinishProgressServer(action_data);

		if (!GetGame() || !GetGame().IsServer())
			return;

		ConstructionActionData constructionData = ConstructionActionData.Cast(action_data);
		if (!constructionData)
			return;

		if (!constructionData.m_Target)
			return;

		Object targetObject = constructionData.m_Target.GetObject();
		if (!targetObject)
			return;

		Fence constructedFence = Fence.Cast(targetObject);
		if (!constructedFence)
			return;

		RegisterFence(constructedFence);
	}
}

