// Helping to manage the weather app functionality, including fetching weather data, managing pinned cities, and handling UI interactions.
async function getCountryFlag(country_code) {
    const country_code_formatted = country_code.toLowerCase()
    const flagUrl = `https://flagcdn.com/w40/${country_code_formatted}.png`;
    const response2 = await fetch(flagUrl);
    if (response2.ok) {
        return flagUrl;
    }
}

async function fetchCityFlag(city) {
    try {
        const geocodeResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
        const geocodeData = await geocodeResponse.json();

        if (!geocodeData.results || geocodeData.results.length === 0) {
            throw new Error(`City '${city}' not found`);
        }

        const { country_code } = geocodeData.results[0];
        return getCountryFlag(country_code);
    }
    catch (error) {
        console.error(`Failed to fetch flag for city '${city}': ${error.message}`);
        return null;
    }
}

async function fetchExtendedWeatherData(cityOrCoords) {
    let latitude, longitude, name, country_code, country, geocodeData;

    if (typeof cityOrCoords === 'object' && cityOrCoords !== null) {
        ({ latitude, longitude, name, country_code, country } = cityOrCoords);
    } else {
        try {
            const geocodeResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOrCoords)}&count=1&language=en`);
            geocodeData = await geocodeResponse.json();

            if (!geocodeData.results || geocodeData.results.length === 0) {
                throw new Error(`City '${cityOrCoords}' not found`);
            }

            ({ latitude, longitude, name, country_code, country } = geocodeData.results[0]);
        } catch (error) {
            throw new Error(`Failed to geocode city '${cityOrCoords}': ${error.message}`);
        }
    }

    try {
        const flag = await getCountryFlag(country_code)

        const params = new URLSearchParams({
            latitude: latitude,
            longitude: longitude,
            current_weather: 'true',
            daily: [
            'precipitation_sum',
            'apparent_temperature_max',
            'apparent_temperature_min',
            'precipitation_probability_max',
            'weather_code',
            'precipitation_hours'
            ].join(','),
            hourly: [
            'temperature_2m',
            'relative_humidity_2m',
            'precipitation',
            'weather_code',
            'wind_direction_80m',
            'apparent_temperature',
            'precipitation_probability',
            ].join(','),
            timezone: 'auto',
            forecast_days: 7
        });

        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        const forecast = await weatherResponse.json();

        const windyIframe = document.getElementById('windy-embed');
        if (windyIframe && latitude && longitude) {
            const windyUrl = `https://embed.windy.com/embed2.html?lat=${latitude}&lon=${longitude}&detailLat=${latitude}&detailLon=${longitude}&width=650&height=450&zoom=9&level=surface&overlay=rain&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
            windyIframe.src = windyUrl;
        }

        return processWeatherData(forecast, name, flag, country);
    } catch (error) {
        throw new Error(`Failed to fetch weather data: ${error.message}`);
    }
}

function clearAllPins() {
    pinnedCities = [];
    savePinsToStorage();
    updatePinDisplay();
    console.log('All pins cleared');
}
const cityInput = document.getElementById("city-input");

const autocompleteContainer = document.createElement('div');
autocompleteContainer.style.display = 'none';
autocompleteContainer.id = 'autocomplete-list';
autocompleteContainer.className = 'autocomplete-items';
cityInput.parentNode.appendChild(autocompleteContainer);

let pinnedCities = [];
let editMode = false;

document.addEventListener('DOMContentLoaded', function() {
    loadPinsFromStorage();
    eventListeners();
    checkURLParameters();
});

function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchCityParam = urlParams.get('search');

    if (searchCityParam) {
        const cityInput = document.getElementById('city-input');
        if (cityInput) {
            cityInput.value = searchCityParam;
            setTimeout(() => {
                searchCity();
            }, 100);
        }
    }
}

function updateURL(cityName) {
    if (cityName && cityName.trim()) {
        const newURL = new URL(window.location);
        newURL.searchParams.set('search', cityName.trim());
        window.history.replaceState({}, '', newURL);
    }
}

function clearURLParameter() {
    const newURL = new URL(window.location);
    newURL.searchParams.delete('search');
    window.history.replaceState({}, '', newURL);
}

async function searchCity() {
    const cityName = cityInput.value.trim();
    if (!cityName) {
        showError('Please enter a city name');
        return;
    }

    const searchButton = document.getElementById('search-button');
    const originalText = searchButton.innerHTML;

    try {
        const weatherData = await fetchExtendedWeatherData(cityName);
        displayExtendedWeather(weatherData);

        createPinButton(weatherData.location);

        updateURL(cityName);

        clearError();

        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.innerHTML = '';
        }

        console.log('Extended weather data:', weatherData);

    } catch (error) {
        if (error.message && error.message.includes("not found")) {
            showError(`City ${cityName} not found`);
        } else {
            showError(`${error.message}`);
        }
        console.error('Weather fetch error:', error);
    } finally {
        searchButton.innerHTML = originalText;
        searchButton.disabled = false;
    }
}

function createPinButton(locationData) {
    const existingPinButton = document.getElementById('pin-button');
    if (existingPinButton){
        existingPinButton.remove();
    }

    const pinButton = document.createElement('button');
    pinButton.id = 'pin-button';
    pinButton.className = 'pin-button';

    const cityName = locationData.name || locationData;
    const isAlreadyPinned = pinnedCities.some(city => city.toLowerCase() === cityName.toLowerCase());

    if (isAlreadyPinned) {
        pinButton.innerHTML = "✅";
        pinButton.disabled = true;
        pinButton.style.opacity = '0.6';
    } else {
        pinButton.innerHTML = '📌';
        pinButton.onclick = () => addPin(cityName);
    }

    const weatherContent = document.getElementById('weather-app') || document.getElementById('weather-display');

    if (weatherContent) {
        weatherContent.appendChild(pinButton);
    }
}

function addPin(cityName) {
    if (!cityName || cityName.trim() === '') {
        showError('Please enter a city name');
        return;
    }

    const trimmedCity = cityName.trim();

    if (pinnedCities.some(city => city.toLowerCase() === trimmedCity.toLowerCase())){
        showError('City is already pinned');
        return;
    }

    pinnedCities.push(trimmedCity);
    savePinsToStorage();
    updatePinDisplay();
    clearError();

    const pinButton = document.getElementById('pin-button');
    if (pinButton) {
        pinButton.innerHTML = '✅';
        pinButton.disabled = true;
        pinButton.style.opacity = '0.6';
        pinButton.onclick = null;
    }

    const cityInput = document.getElementById('city-input');
    if (cityInput) {
        cityInput.value = '';
        clearURLParameter();
    }
}

function updatePinDisplay() {
    const pinList = document.getElementById('pin-list');
    if (!pinList) return;

    pinList.innerHTML = '';

    updateEditButtonVisibility();

    pinnedCities.forEach((city, index) => {
        const pinElement = document.createElement('div');
        pinElement.className = 'pin-item';

        if (editMode) {
            pinElement.innerHTML = `
                <span class="pin-name isediting" onclick="removePin(${index})">${city}<img src="" alt="Flag of ${city}" class="pin-flag" style="display:none;"></span>
            `;
        } else {
            pinElement.innerHTML = `
                <span class="pin-name">${city}<img src="" alt="Flag of ${city}" class="pin-flag" style="display:none;"></span>
            `;
            pinElement.onclick = () => navigateToCity(city);
            pinElement.style.cursor = 'pointer';
        }

        pinList.appendChild(pinElement);

        fetchCityFlag(city).then(flag => {
            const flagImg = pinElement.querySelector('.pin-flag');
            if (flagImg && flag) {
                flagImg.src = flag;
                flagImg.style.display = 'inline';
            }
        });
    });
}

async function navigateToCity(cityName) {
    if (editMode) return;

    const cityInput = document.getElementById('city-input');
    if (cityInput) {
        cityInput.value = cityName;
        await searchCity();
    }
}

function removePin(index) {
    if (index >= 0 && index < pinnedCities.length) {
        pinnedCities.splice(index, 1);
        savePinsToStorage();
        updatePinDisplay();

        if (pinnedCities.length === 0) {
            editMode = false;
            updateEditButtonVisibility();
        }
    }
}

function toggleEditMode() {
    editMode = !editMode;
    updateEditButtonVisibility();
    updatePinDisplay();
}

function showError(message) {
    const errorContainer = document.getElementById('error-container');

    if (errorContainer) {
        errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
        errorContainer.style.display = 'block';
    } else {
        console.error('Error container not found: ', message);
    }
}

function clearError() {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.innerHTML = '';
        errorContainer.style.display = 'none';
    }
}

async function fetchCitySuggestions(query) {
    if (query.length < 2) {
        return [];
    }
    try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en`);
        const data = await response.json();
        return data.results ? data.results : [];
    } catch (error) {
        console.error('Error fetching city suggestions:', error);
        return [];
    }
}

function displaySuggestions(suggestions) {
    autocompleteContainer.innerHTML = '';
    if (suggestions.length === 0) {
        autocompleteContainer.style.display = 'none';
        return;
    }

    suggestions.forEach(cityData => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        const flagUrl = `https://flagcdn.com/w20/${cityData.country_code.toLowerCase()}.png`;
        item.innerHTML = `<img src="${flagUrl}" alt="Flag of ${cityData.country}" class="autocomplete-flag" style="vertical-align:middle;margin-right:6px;"> <span class="city-name">${cityData.name}</span> <span class="country-name">${cityData.country}</span>`;
        item.addEventListener('click', async () => {
            cityInput.value = cityData.name;
            autocompleteContainer.innerHTML = '';
            autocompleteContainer.style.display = 'none';
            try {
                const weatherData = await fetchExtendedWeatherData(cityData);
                displayExtendedWeather(weatherData);
                createPinButton(weatherData.location);
                updateURL(cityData.name);
                clearError();
            } catch (error) {
                showError(`Failed to load weather for ${cityData.name}: ${error.message}`);
                console.error('Autocomplete selection error:', error);
            }
        });
        autocompleteContainer.appendChild(item);
    });
    autocompleteContainer.style.display = 'block';
}


function eventListeners() {
    const searchButton = document.getElementById('search-button');
    const cityInput = document.getElementById('city-input');

    if (searchButton) {
        searchButton.addEventListener('click', async function() {
            await searchCity();
            autocompleteContainer.style.display = 'none';
        });
    }

    if (cityInput) {
        cityInput.addEventListener('input', async function() {
            const query = this.value.trim();
            if (query.length > 0) {
                const suggestions = await fetchCitySuggestions(query);
                displaySuggestions(suggestions);
            } else {
                autocompleteContainer.innerHTML = '';
                autocompleteContainer.style.display = 'none';
            }
        });

        cityInput.addEventListener('keypress', async function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                await searchCity();
                autocompleteContainer.style.display = 'none';
            }
        });

        cityInput.addEventListener('focus', async function() {
            const query = this.value.trim();
            if (query.length > 0 && autocompleteContainer.childElementCount > 0) {
                autocompleteContainer.style.display = 'block';
            }
        });

        document.addEventListener('click', function(e) {
            if (!cityInput.contains(e.target) && !autocompleteContainer.contains(e.target)) {
                autocompleteContainer.style.display = 'none';
            }
        });
    }

    const editButton = document.getElementById('edit-pins-button');
    if (editButton) {
        editButton.addEventListener('click', toggleEditMode);
    }

    const hourlyModalCloseButton = document.getElementById('close-hourly-modal');
    if (hourlyModalCloseButton) {
        hourlyModalCloseButton.addEventListener('click', closeHourlyModal);
    }
    const dailyModalCloseButton = document.getElementById('close-daily-modal');
    if (dailyModalCloseButton) {
        dailyModalCloseButton.addEventListener('click', closeDailyModal);
    }
}

function savePinsToStorage() {
    try {
        localStorage.setItem('weatherAppCityPins', JSON.stringify(pinnedCities));
        console.log('Pins saved to localStorage: ', pinnedCities);
    } catch (e) {
        console.warn("Couldn't save pins to localStorage: ", e);
        try {
            window.cityPinsStorage = JSON.stringify(pinnedCities);
            console.log('Pins saved to window storage as fallback');
        } catch (fallbackError) {
            console.error("Couldn't save pins anywhere: ", fallbackError);
        }
    }
}

function loadPinsFromStorage() {
    try {
        const saved = localStorage.getItem('weatherAppCityPins');
        if (saved) {
            pinnedCities = JSON.parse(saved);
            console.log('Pins loaded from localStorage: ', pinnedCities);
            updatePinDisplay();
        } else {
            console.log('No saved pins found in localStorage');
        }
    } catch (e) {
        console.warn("Couldn't load pins from localStorage: ", e);
        try {
            const windowSaved = window.cityPinsStorage;
            if (windowSaved) {
                pinnedCities = JSON.parse(windowSaved);
                console.log('Pins loaded from window storage as fallback');
                updatePinDisplay();
                savePinsToStorage();
            }
        } catch (fallbackError) {
            console.warn("Couldn't load pins from anywhere: ", fallbackError);
            pinnedCities = [];
        }
    }
}

function updateEditButtonVisibility() {
    const editButton = document.getElementById('edit-pins-button');
    const pinList = document.getElementById('pin-list');
    if (!editButton) return;

    if (pinnedCities.length > 0) {
        editButton.style.display = 'block';
        pinList.classList.add('show');
        if (editMode) {
            editButton.textContent = '✅';
            editButton.title = 'End editing';
        } else {
            editButton.textContent = '🗑️';
            editButton.title = 'Edit pins';
        }
    } else {
        editButton.style.display = 'none';
        pinList.classList.remove('show');
        editMode = false;
    }
}

// Dropdown

function toggleDropdown() {
    const menu = document.getElementById('dropdown-menu');
    menu.classList.toggle('show');
}

window.addEventListener('click', function(e) {
    const menu = document.getElementById('dropdown-menu');
    const button = document.querySelector('.menu-button');
    if (!menu.contains(e.target) && !button.contains(e.target)) {
        menu.classList.remove('show');
    }
});

function isNight(currentDate) {
    const hour = currentDate.getHours();
    return hour < 6 || hour > 20;
}

let rainTimer;
let lightningTimer;
let waterLevelTimer;
let currentWeather = 'sunny';
const waterContainer = document.getElementById('water-container');

function createRaindrops() {
    const rainEffect = document.getElementById('rain-effect');
    if (!rainEffect) return;

    const dropCount = 100;
    if (rainEffect.childElementCount !== dropCount) {
        rainEffect.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < dropCount; i++) {
            const drop = document.createElement('div');
            drop.className = 'raindrop';
            fragment.appendChild(drop);
        }
        rainEffect.appendChild(fragment);
    }

    for (let i = 0; i < dropCount; i++) {
        const drop = rainEffect.children[i];
        drop.style.left = (Math.random() * 100) + '%';
        drop.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
        drop.style.animationDelay = (Math.random() * 2) + 's';
    }
}

function createScreenDrops() {
    const screenDrops = document.getElementById('screen-drops');
    if (!screenDrops) return;

    screenDrops.innerHTML = '';

    for (let i = 0; i < 20; i++) {
        const drop = document.createElement('div');
        drop.className = 'screen-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.top = Math.random() * 70 + '%';
        drop.style.animationDelay = Math.random() * 3 + 's';
        screenDrops.appendChild(drop);
    }
}

function activateWaterWaves() {
    if (waterContainer) {
        waterContainer.classList.add('active-waves');
    }
}

function deactivateWaterWaves() {
    if (waterContainer) {
        waterContainer.classList.remove('active-waves');
    }
}

function activateRainScene() {
    deactivateAllScenes();

    const rainBg = document.getElementById('rain-background');
    const rainEffect = document.getElementById('rain-effect');
    const screenDrops = document.getElementById('screen-drops');

    if (rainBg) rainBg.classList.add('active');
    if (rainEffect) rainEffect.classList.add('active');
    if (screenDrops) screenDrops.classList.add('active');

    activateWaterWaves();

    createRaindrops();
    createScreenDrops();
}

function activateSunnyScene() {
    deactivateAllScenes();
    const sunnyBg = document.getElementById('sunny-background');
    if (sunnyBg) sunnyBg.classList.add('active');
}

function deactivateAllScenes() {
    const allScenes = document.querySelectorAll(
        '.background-scene, .rain-background, .cloudy-background, .fog-background, .snow-background, .freezing-background, .thunderstorm-background'
    );
    allScenes.forEach(scene => scene.classList.remove('active'));

    const rainEffect = document.getElementById('rain-effect');
    const screenDrops = document.getElementById('screen-drops');

    if (rainEffect) rainEffect.classList.remove('active');
    if (screenDrops) screenDrops.classList.remove('active');

    deactivateWaterWaves();

    if (lightningTimer) {
        clearInterval(lightningTimer);
        lightningTimer = null;
    }
}

function activateScene(bgId) {
    deactivateAllScenes();

    const el = document.getElementById(bgId);
    if (el) el.classList.add('active');

    if (bgId === "rain-background" || bgId === "thunderstorm-background") {
        activateRainScene();
    } else if (bgId === "sunny-background") {
        activateSunnyScene();
    }
}

const weatherCodes = {
    0: { desc: "Clear sky", bg: "sunny-background", emoji: "☀️" },
    1: { desc: "Mainly clear", bg: "sunny-background", emoji: "🌤️" },
    2: { desc: "Partly cloudy", bg: "cloudy-background", emoji: "⛅" },
    3: { desc: "Overcast", bg: "cloudy-background", emoji: "☁️" },
    45: { desc: "Fog", bg: "fog-background", emoji: "🌫️" },
    48: { desc: "Depositing rime fog", bg: "fog-background", emoji: "🌫️" },
    51: { desc: "Light Drizzle", bg: "rain-background", emoji: "🌦️" },
    53: { desc: "Moderate Drizzle", bg: "rain-background", emoji: "🌧️" },
    55: { desc: "Dense Drizzle", bg: "rain-background", emoji: "🌧️" },
    61: { desc: "Slight Rain", bg: "rain-background", emoji: "🌦️" },
    63: { desc: "Moderate Rain", bg: "rain-background", emoji: "🌧️" },
    65: { desc: "Heavy Rain", bg: "rain-background", emoji: "🌧️" },
    71: { desc: "Slight Snow", bg: "snow-background", emoji: "🌨️" },
    73: { desc: "Moderate Snow", bg: "snow-background", emoji: "🌨️" },
    75: { desc: "Heavy Snow", bg: "snow-background", emoji: "❄️" },
    80: { desc: "Slight Rain Showers", bg: "rain-background", emoji: "🌦️" },
    81: { desc: "Moderate Rain Showers", bg: "rain-background", emoji: "🌧️" },
    82: { desc: "Violent Rain Showers", bg: "rain-background", emoji: "🌧️" },
    85: { desc: "Slight Snow Showers", bg: "snow-background", emoji: "🌨️" },
    86: { desc: "Heavy Snow Showers", bg: "snow-background", emoji: "❄️" },
    95: { desc: "Thunderstorm", bg: "thunderstorm-background", emoji: "⛈️" },
    96: { desc: "Thunderstorm with slight hail", bg: "hail-background", emoji: "⛈️" },
    99: { desc: "Thunderstorm with heavy hail", bg: "hail-background", emoji: "⛈️" }
};

function getWindDirection(degree) {
    if (typeof degree !== 'number') return 'N';
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round((degree % 360) / 22.5) % 16;
    return directions[index];
}

let globalDailyForecast = [];

function processWeatherData(forecast, locationName, flag, country) {
    const currentWeather = forecast.current_weather;
    const currentTime = new Date(currentWeather.time);

    let currentHourlyData = {
        humidity: null,
        precipitation: null,
        weather_code: null,
        wind_direction: null,
        apparent_temperature: null
    };

    for (let index = 0; index < forecast.hourly.time.length; index++) {
        const hourTime = new Date(forecast.hourly.time[index]);

        if (hourTime.getMonth() === currentTime.getMonth() &&
            hourTime.getDate() === currentTime.getDate() &&
            hourTime.getHours() === currentTime.getHours() &&
            hourTime.getFullYear() === currentTime.getFullYear()) {

            currentHourlyData = {
                humidity: forecast.hourly.relative_humidity_2m[index],
                precipitation: forecast.hourly.precipitation[index],
                weather_code: forecast.hourly.weather_code[index],
                wind_direction: forecast.hourly.wind_direction_80m[index],
                apparent_temperature: forecast.hourly.apparent_temperature[index]
            };
            break;
        }
    }

    let currentDailyData = {
        max_temp: null,
        min_temp: null,
        precipitation_hours: null
    };

    for (let index = 0; index < forecast.daily.time.length; index++) {
        const dayTime = new Date(forecast.daily.time[index]);

        if (dayTime.getMonth() === currentTime.getMonth() &&
            dayTime.getDate() === currentTime.getDate() &&
            dayTime.getFullYear() === currentTime.getFullYear()) {

            currentDailyData = {
                max_temp: forecast.daily.apparent_temperature_max[index],
                min_temp: forecast.daily.apparent_temperature_min[index],
                precipitation_hours: forecast.daily.precipitation_hours[index]
            };
            break;
        }
    }

    const hourlyForecast = generateHourlyForecast(forecast, currentTime);
    const dailyForecast = generateDailyForecast(forecast, currentTime);
    const weatherInfo = weatherCodes[currentHourlyData.weather_code || currentWeather.weathercode] || weatherCodes[0];

    return {
        location: locationName,
        flag: flag,
        country: country,
        current_weather: {
            temperature: currentWeather.temperature,
            apparent_temperature: Math.round(currentHourlyData.apparent_temperature || currentWeather.temperature),
            humidity: Math.round(currentHourlyData.humidity || 0),
            precipitation: Math.round((currentHourlyData.precipitation || 0) * 10) / 10,
            wind_speed: currentWeather.windspeed,
            wind_direction: getWindDirection(currentHourlyData.wind_direction || currentWeather.winddirection),
            weather_code: currentHourlyData.weather_code || currentWeather.weathercode,
            weather: weatherInfo.desc,
            bg: weatherInfo.bg,
            emoji: weatherInfo.emoji
        },
        daily: {
            max_temp: Math.round(currentDailyData.max_temp || 0),
            min_temp: Math.round(currentDailyData.min_temp || 0),
            precipitation_hours: Math.round(currentDailyData.precipitation_hours || 0),
            precipitation_sum: Math.round((forecast.daily.precipitation_sum[0] || 0) * 10) / 10,
            precipitation_probability: Math.round(forecast.daily.precipitation_probability_max[0] || 0)
        },
        hourly_forecast: hourlyForecast,
        daily_forecast: dailyForecast
    };
}

function generateHourlyForecast(forecast, currentTime) {
    const hourlyForecast = [];
    const endTime = new Date(currentTime.getTime() + (24 * 60 * 60 * 1000));

    for (let i = 0; i < forecast.hourly.time.length; i++) {
        const hourTime = new Date(forecast.hourly.time[i]);

        if (hourTime > currentTime && hourTime <= endTime) {
            const weatherInfo = weatherCodes[forecast.hourly.weather_code[i]] || weatherCodes[0];

            hourlyForecast.push({
                time: hourTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }),
                rain: Math.round(forecast.hourly.precipitation_probability[i] || 0),
                temperature: Math.round(forecast.hourly.temperature_2m[i] || 0),
                humidity: Math.round(forecast.hourly.relative_humidity_2m[i] || 0),
                precipitation: Math.round((forecast.hourly.precipitation[i] || 0) * 10) / 10,
                weather_code: weatherInfo.desc,
                wind_direction: getWindDirection(forecast.hourly.wind_direction_80m[i]),
                apparent_temperature: Math.round(forecast.hourly.apparent_temperature[i] || 0),
                emoji: weatherInfo.emoji,
                description: weatherInfo.desc
            });
        }
    }

    return hourlyForecast;
}

function generateDailyForecast(forecast, currentTime) {
    const dailyForecast = [];
    const currentDate = new Date(currentTime);
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < forecast.daily.time.length; i++) {
        const dayTime = new Date(forecast.daily.time[i]);
        dayTime.setHours(0, 0, 0, 0);

        if (dayTime > currentDate) {
            const weatherInfo = weatherCodes[forecast.daily.weather_code[i]] || weatherCodes[0];

            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const weekday = dayNames[dayTime.getDay()];
            const weekdayFull = dayNamesFull[dayTime.getDay()]

            dailyForecast.push({
                weekday: weekday,
                weekdayFull: weekdayFull,
                date: dayTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                precipitation_sum: Math.round((forecast.daily.precipitation_sum[i] || 0) * 10) / 10,
                apparent_temperature_max: Math.round(forecast.daily.apparent_temperature_max[i] || 0),
                apparent_temperature_min: Math.round(forecast.daily.apparent_temperature_min[i] || 0),
                weather_code: weatherInfo.desc,
                precipitation_hours: Math.round(forecast.daily.precipitation_hours[i] || 0),
                precipitation_probability: Math.round(forecast.daily.precipitation_probability_max[i] || 0),
                emoji: weatherInfo.emoji,
                description: weatherInfo.desc
            });
        }
    }

    return dailyForecast.slice(0, 6);
}

function displayHourlyForecast(hourlyData) {
    const container = document.getElementById('hourly-forecast');
    if (!container) return;

    container.innerHTML = '';

    if (!hourlyData || hourlyData.length === 0) {
        container.innerHTML = '<p>No hourly forecast available</p>';
        return;
    }

    hourlyData.forEach(hour => {
        const hourElement = document.createElement('div');
        hourElement.className = 'hourly-item';
        hourElement.innerHTML = `
            <div class="hour-time">${hour.time}</div>
            <div class="hour-emoji">${hour.emoji}</div>
            <div class="hour-temp">${hour.temperature}°</div>
            <div class="hour-rain">${hour.rain}%</div>
        `;

        hourElement.addEventListener('click', () => {
            openHourlyModal(hour);
        });

        container.appendChild(hourElement);
    });
}

function openHourlyModal(hourData) {
    const modal = document.getElementById('hourly-modal');

    document.getElementById('hourly-modal-emoji').textContent = hourData.emoji;
    document.getElementById('hourly-modal-time').textContent = hourData.time;
    document.getElementById('hourly-modal-description').textContent = hourData.description;
    document.getElementById('hourly-modal-temp').textContent = hourData.temperature;
    document.getElementById('hourly-modal-apparent-temp').textContent = hourData.apparent_temperature;
    document.getElementById('hourly-modal-humidity').textContent = hourData.humidity;
    document.getElementById('hourly-modal-precipitation').textContent = hourData.precipitation;
    document.getElementById('hourly-modal-rain-prob').textContent = hourData.rain;
    document.getElementById('hourly-modal-wind-direction').textContent = hourData.wind_direction;
    document.getElementById('hourly-modal-weather-code').textContent = hourData.weather_code;

    modal.classList.add('show');
}

function closeHourlyModal() {
    const modal = document.getElementById('hourly-modal');
    modal.classList.remove('show');
}

function displayDailyForecast(dailyData) {
    const container = document.getElementById('daily-forecast');
    if (!container) return;

    container.innerHTML = '';

    if (!dailyData || dailyData.length === 0) {
        container.innerHTML = '<p>No daily forecast available</p>';
        return;
    }

    globalDailyForecast = dailyData;

    dailyData.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'daily-item';
        dayElement.innerHTML = `
            <div class="daily-day">
                <div class="day-name">${day.weekday}</div>
                <div class="day-date">${day.date}</div>
            </div>
            <div class="daily-weather">
                <span class="daily-emoji">${day.emoji}</span>
                <div class="daily-desc">${day.description}</div>
            </div>
            <div class="daily-temps">
                <span class="daily-high">${day.apparent_temperature_max}°</span>
                <span class="daily-low">${day.apparent_temperature_min}°</span>
            </div>
            <div class="daily-rain">
                <div class="rain-prob">${day.precipitation_probability}%</div>
                <div class="rain-amount">${day.precipitation_sum}mm</div>
            </div>
        `;

        dayElement.addEventListener('click', () => {
            openDailyModal(day);
        });

        container.appendChild(dayElement);
    });
}

function openDailyModal(dayData) {
    const modal = document.getElementById('daily-modal');

    document.getElementById('modal-emoji').textContent = dayData.emoji;
    document.getElementById('modal-day-name').textContent = dayData.weekdayFull;
    document.getElementById('modal-date').textContent = dayData.dateFull;
    document.getElementById('modal-description').textContent = dayData.description;
    document.getElementById('modal-temp-high').textContent = dayData.apparent_temperature_max;
    document.getElementById('modal-temp-low').textContent = dayData.apparent_temperature_min;
    document.getElementById('modal-precipitation-sum').textContent = dayData.precipitation_sum;
    document.getElementById('modal-precipitation-prob').textContent = dayData.precipitation_probability;
    document.getElementById('modal-precipitation-hours').textContent = dayData.precipitation_hours;
    document.getElementById('modal-weather-code').textContent = dayData.weather_code;

    modal.classList.add('show');
}

function closeDailyModal() {
    const modal = document.getElementById('daily-modal');
    modal.classList.remove('show');
}

function displayExtendedWeather(data) {
    const elements = {
        'app-heading': data.location,
        'weather-desc': data.current_weather.weather,
        'temp-value': data.current_weather.temperature,
        'feel-temp': data.current_weather.apparent_temperature,
        'min-temp': data.daily.min_temp,
        'max-temp': data.daily.max_temp,
        'humidity': data.current_weather.humidity,
        'wind-speed': data.current_weather.wind_speed,
        'precipitation': data.current_weather.precipitation,
        'precipitation-hours': data.daily.precipitation_hours,
        'rain-risk': data.daily.precipitation_probability
    };

    const flagElement = document.createElement('img');
    flagElement.src = data.flag;

    const countryElement = document.getElementById('app-heading-country');
    if (countryElement && data.country) {
        countryElement.textContent = data.country + " ";
        countryElement.appendChild(flagElement);
    }

    Object.keys(elements).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = elements[id];
        }
    });

    displayHourlyForecast(data.hourly_forecast);
    displayDailyForecast(data.daily_forecast);

    const weatherDisplay = document.getElementById('weather-display');
    if (weatherDisplay) {
        weatherDisplay.classList.add('show');
    }

    activateScene(data.current_weather.bg);

    const now = new Date();

    const nightBg = document.getElementById("night-background");
    if (isNight(now)) {
        if (nightBg) nightBg.classList.add("active");
    } else {
        if (nightBg) nightBg.classList.remove("active");
    }
}

let defaultBgActive = false;

let lastWeatherSceneId = null;

function toggleDefaultBackground() {
    const defaultBg = document.getElementById('thunderstorm-background');
    if (!defaultBgActive) {
        const activeScene = document.querySelector('.background-scene.active, .rain-background.active, .cloudy-background.active, .fog-background.active, .snow-background.active, .freezing-background.active, .thunderstorm-background.active, .hail-background.active, .sunny-background.active');
        if (activeScene) {
            lastWeatherSceneId = activeScene.id;
        } else {
            lastWeatherSceneId = null;
        }
        deactivateAllScenes();
        if (defaultBg) {
            defaultBg.classList.add('active');
            defaultBgActive = true;
        }
    } else {
        defaultBgActive = false;
        if (defaultBg) defaultBg.classList.remove('active');
        if (lastWeatherSceneId) {
            activateScene(lastWeatherSceneId);
        }
    }
}

document.getElementById('weather-app').addEventListener('submit', async function(e) {
    e.preventDefault();
});