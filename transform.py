import pandas as pd
import os

# --- Konfiguration ---
input_dir = './gtfs_raw/'
output_dir = './gtfs_filtered/'
target_agency = '819'

# Zielordner erstellen
os.makedirs(output_dir, exist_ok=True)
print(f"Starte Filterung für Agency ID: {target_agency}...")

# 1. Routes filtern
routes = pd.read_csv(f'{input_dir}routes.txt', dtype=str)
filtered_routes = routes[routes['agency_id'] == target_agency]
filtered_routes.to_csv(f'{output_dir}routes.txt', index=False)
route_ids = filtered_routes['route_id'].tolist()
print(f"Gefundene Routen: {len(route_ids)}")

# 2. Trips filtern
trips = pd.read_csv(f'{input_dir}trips.txt', dtype=str)
filtered_trips = trips[trips['route_id'].isin(route_ids)]
filtered_trips.to_csv(f'{output_dir}trips.txt', index=False)
trip_ids = filtered_trips['trip_id'].tolist()

# Wir speichern die Service-IDs für den Kalender-Filter
service_ids = filtered_trips['service_id'].dropna().unique().tolist()
print(f"Gefundene Fahrten (Trips): {len(trip_ids)}")

# 2.5 Kalenderdaten filtern (NEU)
if os.path.exists(f'{input_dir}calendar.txt'):
    calendar = pd.read_csv(f'{input_dir}calendar.txt', dtype=str)
    filtered_calendar = calendar[calendar['service_id'].isin(service_ids)]
    filtered_calendar.to_csv(f'{output_dir}calendar.txt', index=False)
    print(f"Gefundene reguläre Kalender-Profile: {len(filtered_calendar)}")

if os.path.exists(f'{input_dir}calendar_dates.txt'):
    calendar_dates = pd.read_csv(f'{input_dir}calendar_dates.txt', dtype=str)
    filtered_calendar_dates = calendar_dates[calendar_dates['service_id'].isin(service_ids)]
    filtered_calendar_dates.to_csv(f'{output_dir}calendar_dates.txt', index=False)
    print(f"Gefundene Kalender-Ausnahmen: {len(filtered_calendar_dates)}")

# 3. Shapes filtern (mit Sicherheitsprüfung)
if 'shape_id' in filtered_trips.columns:
    shape_ids = filtered_trips['shape_id'].dropna().unique().tolist()
    
    if os.path.exists(f'{input_dir}shapes.txt') and len(shape_ids) > 0:
        shapes = pd.read_csv(f'{input_dir}shapes.txt', dtype=str)
        filtered_shapes = shapes[shapes['shape_id'].isin(shape_ids)]
        filtered_shapes.to_csv(f'{output_dir}shapes.txt', index=False)
        print(f"Gefundene Form-Punkte (Shapes): {len(filtered_shapes)}")
    else:
        print("shapes.txt existiert nicht, wird übersprungen.")
else:
    print("Achtung: Keine 'shape_id' in trips.txt. Das Unternehmen liefert keine exakten Pfade.")

# 4. Stop Times & Stops filtern
stop_times = pd.read_csv(f'{input_dir}stop_times.txt', dtype=str)
filtered_stop_times = stop_times[stop_times['trip_id'].isin(trip_ids)]
filtered_stop_times.to_csv(f'{output_dir}stop_times.txt', index=False)
stop_ids = filtered_stop_times['stop_id'].unique().tolist()

stops = pd.read_csv(f'{input_dir}stops.txt', dtype=str)
filtered_stops = stops[stops['stop_id'].isin(stop_ids)]
filtered_stops.to_csv(f'{output_dir}stops.txt', index=False)
print(f"Gefundene Haltestellen (Stops): {len(filtered_stops)}")

print("Daten-Pipeline erfolgreich abgeschlossen.")