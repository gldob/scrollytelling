const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [8.10, 47.11], // Start: Region Sursee
    zoom: 12.5,
    pitch: 45,
    bearing: 10,
    interactive: false,
    attributionControl: false
});

map.addControl(new maplibregl.AttributionControl({
    customAttribution: '© <a href="https://carto.com/">CARTO</a> | Daten: Rottal Auto AG'
}), 'bottom-right');

const scroller = scrollama();
const timeDisplay = document.getElementById('time-display');
const isMobile = window.innerWidth <= 768;

let allTrips = [];
let targetMinutes = 240; // 04:00
let currentMinutes = 240;
const speed = 15; // Simulationsgeschwindigkeit (Minuten pro Sekunde)
let animationStarted = false;

// FPS Throttling Variablen für Mobile
let lastFrameTime = 0;
const fpsInterval = 1000 / 30; // Ziel: 30 FPS auf dem Smartphone

// Format-Hilfsfunktion für die Uhrzeit
function formatTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Mathematische Hilfsfunktion für die lineare Interpolation
function getInterpolatedPosition(coords, times, currentMinute) {
    for (let i = 0; i < times.length - 1; i++) {
        if (currentMinute >= times[i] && currentMinute <= times[i + 1]) {
            const segmentDuration = times[i + 1] - times[i];
            const timePassed = currentMinute - times[i];
            const progress = segmentDuration === 0 ? 0 : timePassed / segmentDuration;

            const startCoord = coords[i];
            const endCoord = coords[i + 1];

            const lon = startCoord[0] + (endCoord[0] - startCoord[0]) * progress;
            const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * progress;

            return [lon, lat];
        }
    }
    return coords[coords.length - 1];
}

map.on('load', () => {
    // Datenquelle für dynamische Trip-Linien
    map.addSource('trips-source', {
        type: 'geojson',
        data: 'trips.geojson',
        lineMetrics: true
    });

    // Hauptlayer für die aktiven Linien
    map.addLayer({
        id: 'trips-layer',
        type: 'line',
        source: 'trips-source',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                10, 2,
                14, 6
            ],
            'line-color': '#00e5ff',
            'line-opacity': 0, // Wird animiert
            'line-blur': 1
        }
    });

    // Glow-Effekt für die Linien (Performance-Tweak: Nur auf Desktop)
    if (!isMobile) {
        map.addLayer({
            id: 'trips-glow',
            type: 'line',
            source: 'trips-source',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 6,
                    14, 18
                ],
                'line-color': '#00e5ff',
                'line-opacity': 0, // Wird animiert
                'line-blur': 10
            }
        });
    }

    // Leere Source für die Fahrzeuge
    map.addSource('vehicles', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    // Layer für die Fahrzeuge (Punkte)
    map.addLayer({
        id: 'vehicles-layer',
        type: 'circle',
        source: 'vehicles',
        paint: {
            'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                10, 2,
                14, 5
            ],
            'circle-color': '#ffea00', // Leuchtendes Gelb
            'circle-opacity': 1
        }
    });

    // Glow-Effekt für die Fahrzeuge (Performance-Tweak: Nur auf Desktop)
    if (!isMobile) {
        map.addLayer({
            id: 'vehicles-glow',
            type: 'circle',
            source: 'vehicles',
            paint: {
                'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 6,
                    14, 15
                ],
                'circle-color': '#ffea00', // Leuchtendes Gelb
                'circle-opacity': 0.6,
                'circle-blur': 0.8
            }
        }, 'vehicles-layer');
    }

    // Daten in den RAM laden
    fetch('./trips.geojson')
        .then(response => response.json())
        .then(data => {
            allTrips = data.features;

            // Graph generieren (04:00 bis 27:59)
            const graphContainer = document.getElementById('trip-graph');
            const tripHistogram = new Array(24).fill(0);

            allTrips.forEach(trip => {
                const props = trip.properties;
                const startH = Math.floor(props.start_time / 60);
                const endH = Math.floor(props.end_time / 60);

                for (let h = startH; h <= endH; h++) {
                    const bucket = h - 4;
                    if (bucket >= 0 && bucket < 24) {
                        tripHistogram[bucket]++;
                    }
                }
            });

            const maxTrips = Math.max(...tripHistogram, 1);

            tripHistogram.forEach((count, i) => {
                const bar = document.createElement('div');
                bar.className = 'bar';
                const height = Math.max(5, (count / maxTrips) * 100);
                bar.style.height = `${height}%`;

                const hourOfDay = (i + 4) % 24;
                const nextHourOfDay = (i + 5) % 24;
                bar.title = `${hourOfDay.toString().padStart(2, '0')}:00 - ${nextHourOfDay.toString().padStart(2, '0')}:00 Uhr: ${count} aktive Fahrzeuge`;

                graphContainer.appendChild(bar);
            });

            initScrollama();

            if (!animationStarted) {
                animationStarted = true;
                requestAnimationFrame(animateVehicles);
            }
        });
});

function initScrollama() {
    scroller
        .setup({
            step: '.step',
            offset: 0.5,
            progress: true
        })
        .onStepEnter(handleStepEnter)
        .onStepProgress(handleStepProgress);
}

function handleStepEnter(response) {
    const steps = document.querySelectorAll('.step');
    steps.forEach(step => step.classList.remove('is-active'));
    response.element.classList.add('is-active');

    const el = response.element;
    const lng = parseFloat(el.getAttribute('data-lng'));
    const lat = parseFloat(el.getAttribute('data-lat'));
    let zoom = parseFloat(el.getAttribute('data-zoom'));
    const pitch = parseFloat(el.getAttribute('data-pitch'));
    const bearing = parseFloat(el.getAttribute('data-bearing'));

    // Mobile Zoom-Anpassung
    if (isMobile) {
        zoom = zoom - 0.8;
    }

    // Kamera-Fahrt auslösen
    map.flyTo({
        center: [lng, lat],
        zoom: zoom,
        pitch: pitch,
        bearing: bearing,
        duration: 3000,
        essential: true,
        easing: (t) => t * (2 - t)
    });
}

function animateVehicles(timestamp) {
    // Nächsten Frame anfordern
    requestAnimationFrame(animateVehicles);

    if (!timestamp) timestamp = performance.now();

    // FPS-Throttling für Mobile
    if (isMobile) {
        const elapsed = timestamp - lastFrameTime;
        if (elapsed < fpsInterval) return;
        lastFrameTime = timestamp - (elapsed % fpsInterval);
    }

    // Berechne Delta Time in Sekunden für frame-unabhängige Animation
    if (lastUpdateTime === 0) lastUpdateTime = timestamp;
    let deltaTime = (timestamp - lastUpdateTime) / 1000;
    lastUpdateTime = timestamp;

    // Limitiere deltaTime bei inaktivem Tab, um massive Sprünge zu vermeiden
    if (deltaTime > 0.5) deltaTime = 0.5;

    // Interpoliere currentMinutes sanft in Richtung targetMinutes
    if (Math.abs(targetMinutes - currentMinutes) > 0.1) {
        const direction = targetMinutes > currentMinutes ? 1 : -1;
        const diff = Math.abs(targetMinutes - currentMinutes);

        // Wenn die Distanz sehr groß ist, beschleunigen wir
        const dynamicSpeed = diff > 60 ? speed * 3 : speed;

        // Multiplikator anpassen, da der Loop auf Mobile nur noch halb so oft feuert
        const timeFactor = isMobile ? 2 : 1;
        currentMinutes += direction * ((dynamicSpeed * timeFactor) / 60);

        // Overshoot protection
        if ((direction === 1 && currentMinutes > targetMinutes) ||
            (direction === -1 && currentMinutes < targetMinutes)) {
            currentMinutes = targetMinutes;
        }
    }

    timeDisplay.textContent = formatTime(Math.floor(currentMinutes));

    // Aktualisiere Graph
    const currentHourBucket = Math.floor(currentMinutes / 60) - 4;
    const bars = document.querySelectorAll('#trip-graph .bar');
    bars.forEach((bar, index) => {
        if (index === currentHourBucket) {
            bar.classList.add('active');
        } else {
            bar.classList.remove('active');
        }
    });

    const activePoints = [];

    // Gehe durch alle Trips
    for (const trip of allTrips) {
        const props = trip.properties;
        if (currentMinutes >= props.start_time && currentMinutes <= props.end_time) {
            const currentPos = getInterpolatedPosition(
                trip.geometry.coordinates,
                props.times,
                currentMinutes
            );

            activePoints.push({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': currentPos
                }
            });
        }
    }

    // Aktualisiere die Fahrzeuge
    if (map.getSource('vehicles')) {
        map.getSource('vehicles').setData({
            'type': 'FeatureCollection',
            'features': activePoints
        });
    }

    // Aktualisiere die Sichtbarkeit der aktiven Linien
    if (map.getSource('trips-source')) {
        map.setPaintProperty('trips-layer', 'line-opacity', [
            'case',
            ['all',
                ['<=', ['get', 'start_time'], currentMinutes],
                ['>=', ['get', 'end_time'], currentMinutes]
            ], 0.5,
            0
        ]);

        if (!isMobile) {
            map.setPaintProperty('trips-glow', 'line-opacity', [
                'case',
                ['all',
                    ['<=', ['get', 'start_time'], currentMinutes],
                    ['>=', ['get', 'end_time'], currentMinutes]
                ], 0.2,
                0
            ]);
        }
    }
}

window.addEventListener('resize', scroller.resize);
