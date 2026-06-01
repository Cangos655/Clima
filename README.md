# Clima Room Card

A compact Home Assistant Lovelace custom card for monitoring and controlling a single room's climate. Designed to be used with up to 7 rooms side-by-side or in a grid.

## Features

- Displays target temperature with +/- adjustment buttons
- Shows current HVAC mode as a colour-coded badge
- Valve position with a 12-hour sparkline history chart
- Temperature and humidity sensors, each clickable for more-info
- Visual config editor in the Lovelace UI editor
- Narrow layout (~300 px) — fits multiple cards in a horizontal stack

## Installation via HACS

1. Open HACS in your Home Assistant sidebar.
2. Go to **Frontend** (Dashboard).
3. Click the three-dot menu in the top-right and choose **Custom repositories**.
4. Add this repository URL and select **Dashboard** as the category.
5. Click **Add**.
6. Search for **Clima Room Card** and click **Download**.
7. Reload your browser (hard-refresh / Ctrl+Shift+R).

## Manual Installation

1. Copy `clima-room-card.js` to your `config/www/` folder (e.g. `/config/www/clima-room-card.js`).
2. In Home Assistant, go to **Settings → Dashboards → Resources**.
3. Click **Add Resource** and enter:
   - **URL**: `/local/clima-room-card.js`
   - **Resource type**: JavaScript module
4. Save and reload the browser.

## Card Configuration

Add the card manually in Lovelace YAML:

```yaml
type: custom:clima-room-card
room_name: Living Room
climate_entity: climate.living_room
valve_entity: number.living_room_valve        # optional
temp_entity: sensor.living_room_temperature   # optional
humidity_entity: sensor.living_room_humidity  # optional
```

### Options

| Option | Required | Description |
|---|---|---|
| `room_name` | No | Display name shown in the card header |
| `climate_entity` | **Yes** | Entity ID of the climate device |
| `valve_entity` | No | Entity ID of the valve/TRV position sensor |
| `temp_entity` | No | Entity ID of the room temperature sensor |
| `humidity_entity` | No | Entity ID of the room humidity sensor |

## Example: 7-room layout

```yaml
type: horizontal-stack
cards:
  - type: custom:clima-room-card
    room_name: Living Room
    climate_entity: climate.living_room
    valve_entity: number.living_room_valve
    temp_entity: sensor.living_room_temperature
    humidity_entity: sensor.living_room_humidity

  - type: custom:clima-room-card
    room_name: Bedroom
    climate_entity: climate.bedroom
    valve_entity: number.bedroom_valve
    temp_entity: sensor.bedroom_temperature
    humidity_entity: sensor.bedroom_humidity

  # ... repeat for remaining rooms
```

## Requirements

- Home Assistant 2023.4 or later (uses built-in LitElement)
- Long-lived access tokens are not needed — the card uses `hass.fetchWithAuth` for history calls
