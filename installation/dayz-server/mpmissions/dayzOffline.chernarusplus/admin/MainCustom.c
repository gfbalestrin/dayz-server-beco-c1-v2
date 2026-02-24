void MainCustom()
{
    WriteToLog("main(): Inicializando método main()...", LogFile.INIT, false, LogType.INFO);

	//INIT ECONOMY--------------------------------------
	Hive ce = CreateHive();
	if ( ce )
		ce.InitOffline();

	//DATE RESET AFTER ECONOMY INIT-------------------------
	int year, month, day, hour, minute;
	int reset_month = 9, reset_day = 20;
	GetGame().GetWorld().GetDate(year, month, day, hour, minute);
	WriteToLog("main(): Data atual no jogo -> " + year + "/" + month + "/" + day, LogFile.INIT, false, LogType.INFO);

	if (!IsDeathmatchEnabled)
	{
		if ((month == reset_month) && (day < reset_day))
		{
			GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
		}
		else
		{
			if ((month == reset_month + 1) && (day > reset_day))
			{
				GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
			}
			else
			{
				if ((month < reset_month) || (month > reset_month + 1))
				{
					GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
				}
			}
		}
	} else {
		// Força o horário para 06:00
		hour = 6;
		minute = 0;

		if ((month == reset_month) && (day < reset_day))
		{
			WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
			GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
		}
		else if ((month == reset_month + 1) && (day > reset_day))
		{
			WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
			GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
		}
		else if ((month < reset_month) || (month > reset_month + 1))
		{
			WriteToLog("main(): Ajustando data para " + reset_month + "/" + reset_day, LogFile.INIT, false, LogType.INFO);
			GetGame().GetWorld().SetDate(year, reset_month, reset_day, hour, minute);
		}
		else
		{
			// Mesmo se não for necessário ajustar a data, ainda força o horário para 06
			GetGame().GetWorld().SetDate(year, month, day, hour, minute);
			WriteToLog("main(): Data mantida, horário ajustado para 06:00.", LogFile.INIT, false, LogType.INFO);
		}

		// >>> Clima CLEAR no start
		SetClearWeatherNow();

		// (Opcional) Reaplica após alguns segundos, caso algum subsistema mude o clima muito cedo
		GetGame().GetCallQueue(CALL_CATEGORY_SYSTEM).CallLater(SetClearWeatherNow, 5000, false);
	}
}

void SetClearWeatherNow()
{
    Weather weather = GetGame().GetWeather();
    if (!weather) return;

    weather.MissionWeather(true);

	GetGame().GetWorld().SetDate(yy, 12, 21, 12, 0);
	// O SEGREDO: Overcast no máximo (1.0) para tapar o sol e matar o "Atmospheric Scattering"
	weather.GetOvercast().Set(1.0, 1, 0);
                
	// Mas forçamos a chuva e a neblina volumétrica a ficarem no zero absoluto
	weather.GetRain().Set(0.0, 1, 0);
	weather.GetFog().Set(0.0, 1, 0);
	
	weather.SetWindSpeed(0.0);
	weather.SetWindMaximumSpeed(0.0);
}

void SetClearWeatherNowOld()
{
    Weather weather = GetGame().GetWeather();
    if (!weather) return;

    // Delega o clima ao script da missão
    weather.MissionWeather(true);

    // Destrava limites e tempos (sem máquina de previsão)
    weather.GetOvercast().SetLimits(0.0, 1.0);
    weather.GetOvercast().SetForecastChangeLimits(0, 0);
    weather.GetOvercast().SetForecastTimeLimits(0, 0);

    weather.GetRain().SetLimits(0.0, 1.0);
    weather.GetRain().SetForecastChangeLimits(0, 0);
    weather.GetRain().SetForecastTimeLimits(0, 0);
    weather.SetRainThresholds(0.0, 1.0, 0); // chuva não fica presa a thresholds

    weather.GetFog().SetLimits(0.0, 1.0);
    weather.GetFog().SetForecastChangeLimits(0, 0);
    weather.GetFog().SetForecastTimeLimits(0, 0);

    // Aplica "clear" quase instantâneo
    weather.GetOvercast().Set(0.01, 1, 0);
    weather.GetRain().Set(0.0, 1, 0);
    weather.GetFog().Set(0.0, 1, 0);

    // Vento parado
    weather.SetWindSpeed(0.0);
    weather.SetWindMaximumSpeed(0.0);
    weather.SetWindFunctionParams(0, 0, 0);

    WriteToLog("SetClearWeatherNow(): aplicado CLEAR no init.", LogFile.INIT, false, LogType.INFO);
}