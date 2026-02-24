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

    // Delega o clima ao script da missão
    weather.MissionWeather(true);

    // Section A
	//limits of clouds at any point in time. Valued between 0.0 and 1.0.
	//( 1.0 , 1.0 ); max cloud all the time
	//( 0.0 , 0.0 ); no clouds ever
	//( 0.0 , 1.0 ); between no clouds and max clouds
	//( 0.5 , 0.5 ); always half clouds
	//you have to test with clouds on highest in video settings to test well

	weather.GetOvercast().SetLimits( 0.0 , 1.0 );
	weather.GetRain().SetLimits(     0.0 , 0.5 );
	weather.GetFog().SetLimits(      0.0 , 0.3 );

	// Section B
	//limits of how much clouds change over time
	//( 1.0 , 1.0 ); clouds change 1.0 or -1.0 within time limits from Section C
	//( 0.0 , 0.0 ); clouds never change
	//( 0.0 , 1.0 ); clouds change between -1.0 and 1.0 within time limits from Section C
	//( 0.5 , 0.5 ); clouds change -0.5 or 0.5 within time limits from Section C

	weather.GetOvercast().SetForecastChangeLimits( 0.2, 0.2 );
	weather.GetRain().SetForecastChangeLimits(     0.3, 0.3 );
	weather.GetFog().SetForecastChangeLimits(      0.8, 0.8 );;

	//Section C
	//limits how long it takes for clouds to change in seconds
	//( 1800 , 1800 ); clouds take 1800 seconds to change by a value set in Section B
	//( 1 , 1800 ); clouds take between 1 and 1800 seconds to change by a value set in Section B
	//( 1 , 1 ); clouds take 1 second to change by a value set in Section B

	weather.GetOvercast().SetForecastTimeLimits( 60 , 600 );
	weather.GetRain().SetForecastTimeLimits(     60 , 600 );
	weather.GetFog().SetForecastTimeLimits(      60 , 600 );

	//Saction D
	//when the server starts it's session the intensity of clouds is equal to a number with a 6-7 decimal precision within 0.0 and 0.3
	//you can change Math.RandomFloatInclusive(0.0, 0.3) to just a value
	//for example: weather.GetOvercast().Set( 0.5, 0, 0);
	//the server session's cloud intensity will be 0.5 on that session. It's still subject to change over time because of Section B and C, but the lower this value, the less of an impact the values in Section A B and C have

	weather.GetOvercast().Set( Math.RandomFloatInclusive(0.0, 0.8), 0, 0);
	weather.GetRain().Set(     Math.RandomFloatInclusive(0.0, 0.3), 0, 0);
	weather.GetFog().Set(      Math.RandomFloatInclusive(0.0, 0.3), 0, 0);


	//Section E - Wind settings
	//Maximum windspeed ever
	//I think the values mean that wind changes within a factors 0.1 and 0.3 of the maximum value over a certain period
	//(1.0, 1.0, 50) makes the wind 15 all the time
	//needs some further testing because wind doesn't seem to always be insane
	//(0.0, 0.0, 50) makes it wind speed 0 all the time
	//this seems to be consistently no wind
	//Again not 100% sure, especially the value 50 is difficult to see any difference when testing
	//I don’t see any difference between 50 or 1 for example
	//With lower wind speeds comes slower getting wet and drying up
	//With 0 wind speed consistently, drying up takes a very long time

	weather.SetWindMaximumSpeed(20);
	weather.SetWindFunctionParams(0.1, 0.3, 50);

	weather.GetRain().Set(0.0, 1, 0);
                weather.GetOvercast().Set(0.01, 1, 0);
                weather.GetFog().Set(0.0, 1, 0);
                weather.SetWindSpeed(0.0);
                weather.SetWindMaximumSpeed(0.0);
                weather.SetWindFunctionParams(0, 0, 0); // sem variação
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