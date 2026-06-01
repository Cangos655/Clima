/**
 * Clima Room Card — compact room card for Home Assistant Lovelace
 * HACS-compliant, single-file, no build step required.
 *
 * Usage:
 *   type: custom:clima-room-card
 *   room_name: Living Room
 *   climate_entity: climate.living_room
 *   valve_entity: number.living_room_valve
 *   temp_entity: sensor.living_room_temperature
 *   humidity_entity: sensor.living_room_humidity
 */

(function () {
  // Reuse HA's built-in LitElement / html / css to avoid external imports
  const LitElement = Object.getPrototypeOf(
    customElements.get("ha-panel-lovelace")
  );
  const { html, css } = LitElement.prototype.constructor;

  // ---------------------------------------------------------------------------
  // Helper: fetch 12-hour history for a single entity and return value array
  // ---------------------------------------------------------------------------
  async function fetchHistory(hass, entityId) {
    const end = new Date();
    const start = new Date(end.getTime() - 12 * 60 * 60 * 1000);
    const startIso = start.toISOString();
    const url =
      `/api/history/period/${startIso}` +
      `?filter_entity_id=${entityId}&minimal_response&end_time=${end.toISOString()}`;
    try {
      const res = await hass.fetchWithAuth(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data || !data[0]) return [];
      return data[0]
        .map((s) => parseFloat(s.state))
        .filter((v) => !isNaN(v));
    } catch (_) {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: build a tiny inline SVG sparkline from an array of numbers
  // ---------------------------------------------------------------------------
  function sparkline(values, width = 80, height = 24) {
    if (!values || values.length < 2)
      return `<svg width="${width}" height="${height}"></svg>`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
           xmlns="http://www.w3.org/2000/svg" style="display:block">
        <polyline
          points="${pts.join(" ")}"
          fill="none"
          stroke="var(--primary-color, #03a9f4)"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>`;
  }

  // ---------------------------------------------------------------------------
  // Main card element
  // ---------------------------------------------------------------------------
  class ClimaRoomCard extends LitElement {
    static get properties() {
      return {
        _config: { type: Object },
        _hass: { type: Object },
        _valveHistory: { type: Array },
        _historyLoading: { type: Boolean },
        _historyStale: { type: Boolean },
      };
    }

    constructor() {
      super();
      this._valveHistory = [];
      this._historyLoading = false;
      this._historyStale = true;
      this._lastHistoryFetch = 0;
    }

    setConfig(config) {
      if (!config.climate_entity) {
        throw new Error("clima-room-card: 'climate_entity' is required");
      }
      this._config = config;
      this._historyStale = true;
    }

    set hass(hass) {
      this._hass = hass;
      // Refresh history at most once every 5 minutes
      const now = Date.now();
      if (
        this._config &&
        this._config.valve_entity &&
        (this._historyStale || now - this._lastHistoryFetch > 5 * 60 * 1000)
      ) {
        this._historyStale = false;
        this._lastHistoryFetch = now;
        this._loadHistory();
      }
    }

    async _loadHistory() {
      if (!this._config.valve_entity) return;
      this._historyLoading = true;
      const values = await fetchHistory(this._hass, this._config.valve_entity);
      this._valveHistory = values;
      this._historyLoading = false;
    }

    // ---- actions ------------------------------------------------------------

    _moreInfo(entityId) {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        })
      );
    }

    _adjustTemp(delta) {
      const climate = this._hass.states[this._config.climate_entity];
      if (!climate) return;
      const current =
        parseFloat(climate.attributes.temperature) ||
        parseFloat(climate.attributes.current_temperature) ||
        20;
      const step =
        parseFloat(climate.attributes.target_temp_step) || 0.5;
      const newTemp = Math.round((current + delta) / step) * step;
      this._hass.callService("climate", "set_temperature", {
        entity_id: this._config.climate_entity,
        temperature: newTemp,
      });
    }

    // ---- render -------------------------------------------------------------

    static get styles() {
      return css`
        :host {
          display: block;
        }
        ha-card {
          padding: 12px 14px 10px;
          box-sizing: border-box;
          max-width: 320px;
        }
        .room-name {
          font-size: 0.78rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--secondary-text-color, #888);
          margin-bottom: 6px;
        }
        /* --- thermostat row --- */
        .thermo-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }
        .temp-target {
          font-size: 2rem;
          font-weight: 700;
          color: var(--primary-text-color);
          cursor: pointer;
          line-height: 1;
          flex: 1;
        }
        .temp-target:hover {
          color: var(--primary-color, #03a9f4);
        }
        .adj-btn {
          background: none;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 50%;
          width: 28px;
          height: 28px;
          cursor: pointer;
          font-size: 1.1rem;
          line-height: 1;
          color: var(--primary-text-color);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: background 0.15s;
        }
        .adj-btn:hover {
          background: var(--primary-color, #03a9f4);
          color: #fff;
          border-color: var(--primary-color, #03a9f4);
        }
        .hvac-badge {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 2px 6px;
          border-radius: 10px;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          white-space: nowrap;
        }
        .hvac-badge.off {
          background: var(--disabled-text-color, #bbb);
        }
        .hvac-badge.cool {
          background: #2196f3;
        }
        .hvac-badge.heat {
          background: #ff9800;
        }
        .hvac-badge.heat_cool,
        .hvac-badge.auto {
          background: #9c27b0;
        }
        .hvac-badge.fan_only {
          background: #009688;
        }
        .hvac-badge.dry {
          background: #795548;
        }
        /* --- valve row --- */
        .valve-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          min-height: 28px;
        }
        .valve-label {
          font-size: 0.75rem;
          color: var(--secondary-text-color, #888);
          white-space: nowrap;
        }
        .valve-pct {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--primary-text-color);
          min-width: 36px;
        }
        .sparkline-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        .loading-text {
          font-size: 0.7rem;
          color: var(--secondary-text-color, #aaa);
          font-style: italic;
        }
        /* --- sensor row --- */
        .sensor-row {
          display: flex;
          gap: 12px;
        }
        .sensor-chip {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 3px 7px;
          border-radius: 12px;
          background: var(--secondary-background-color, rgba(0,0,0,0.04));
          transition: background 0.15s;
        }
        .sensor-chip:hover {
          background: var(--primary-color, #03a9f4);
          color: #fff;
        }
        .sensor-icon {
          font-size: 0.85rem;
        }
        .sensor-value {
          font-size: 0.85rem;
          font-weight: 600;
        }
      `;
    }

    render() {
      if (!this._config || !this._hass) return html``;

      const cfg = this._config;
      const hass = this._hass;

      // Climate entity
      const climate = hass.states[cfg.climate_entity];
      const targetTemp = climate
        ? climate.attributes.temperature != null
          ? parseFloat(climate.attributes.temperature).toFixed(1)
          : "—"
        : "—";
      const hvacMode = climate ? climate.state : "off";
      const hvacLabel = hvacMode.replace(/_/g, " ");

      // Valve entity
      const valve = cfg.valve_entity ? hass.states[cfg.valve_entity] : null;
      const valvePct = valve ? `${parseFloat(valve.state).toFixed(0)}%` : "—";

      // Sensor entities
      const tempSensor = cfg.temp_entity ? hass.states[cfg.temp_entity] : null;
      const humSensor = cfg.humidity_entity
        ? hass.states[cfg.humidity_entity]
        : null;
      const tempVal = tempSensor
        ? `${parseFloat(tempSensor.state).toFixed(1)}°`
        : "—";
      const humVal = humSensor
        ? `${parseFloat(humSensor.state).toFixed(0)}%`
        : "—";

      const roomName = cfg.room_name || "Room";

      const sparkSvg = this._historyLoading
        ? ""
        : sparkline(this._valveHistory);

      return html`
        <ha-card>
          <div class="room-name">${roomName}</div>

          <!-- Thermostat row -->
          <div class="thermo-row">
            <span
              class="temp-target"
              @click=${() => this._moreInfo(cfg.climate_entity)}
              title="Open more info"
            >${targetTemp}°</span>
            <button class="adj-btn" @click=${() => this._adjustTemp(-0.5)} title="Decrease">−</button>
            <button class="adj-btn" @click=${() => this._adjustTemp(0.5)} title="Increase">+</button>
            <span class="hvac-badge ${hvacMode}">${hvacLabel}</span>
          </div>

          <!-- Valve row -->
          ${cfg.valve_entity
            ? html`
              <div class="valve-row">
                <span class="valve-label">Ventiel</span>
                <span class="valve-pct">${valvePct}</span>
                <div class="sparkline-wrap">
                  ${this._historyLoading
                    ? html`<span class="loading-text">Laden…</span>`
                    : html`<span .innerHTML=${sparkSvg}></span>`}
                </div>
              </div>`
            : ""}

          <!-- Sensor row -->
          <div class="sensor-row">
            ${tempSensor
              ? html`
                <div
                  class="sensor-chip"
                  @click=${() => this._moreInfo(cfg.temp_entity)}
                  title="${cfg.temp_entity}"
                >
                  <span class="sensor-icon">🌡</span>
                  <span class="sensor-value">${tempVal}</span>
                </div>`
              : ""}
            ${humSensor
              ? html`
                <div
                  class="sensor-chip"
                  @click=${() => this._moreInfo(cfg.humidity_entity)}
                  title="${cfg.humidity_entity}"
                >
                  <span class="sensor-icon">💧</span>
                  <span class="sensor-value">${humVal}</span>
                </div>`
              : ""}
          </div>
        </ha-card>
      `;
    }

    // ---- card config --------------------------------------------------------

    static getConfigElement() {
      return document.createElement("clima-room-card-editor");
    }

    static getStubConfig() {
      return {
        room_name: "Living Room",
        climate_entity: "climate.living_room",
        valve_entity: "number.living_room_valve",
        temp_entity: "sensor.living_room_temperature",
        humidity_entity: "sensor.living_room_humidity",
      };
    }
  }

  customElements.define("clima-room-card", ClimaRoomCard);

  // ---------------------------------------------------------------------------
  // Visual config editor
  // ---------------------------------------------------------------------------
  class ClimaRoomCardEditor extends LitElement {
    static get properties() {
      return {
        _config: { type: Object },
        hass: { type: Object },
      };
    }

    setConfig(config) {
      this._config = { ...config };
    }

    _valueChanged(field, e) {
      const val = e.target.value;
      this._config = { ...this._config, [field]: val };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: this._config },
        })
      );
    }

    static get styles() {
      return css`
        .editor-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 8px 0;
        }
        label {
          display: flex;
          flex-direction: column;
          font-size: 0.85rem;
          color: var(--secondary-text-color);
          gap: 3px;
        }
        input {
          padding: 6px 8px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color);
          font-size: 0.9rem;
        }
        input:focus {
          outline: none;
          border-color: var(--primary-color, #03a9f4);
        }
      `;
    }

    render() {
      if (!this._config) return html``;
      const c = this._config;
      const field = (label, key, placeholder) => html`
        <label>
          ${label}
          <input
            .value=${c[key] || ""}
            placeholder=${placeholder}
            @change=${(e) => this._valueChanged(key, e)}
          />
        </label>`;

      return html`
        <div class="editor-row">
          ${field("Room Name", "room_name", "e.g. Living Room")}
          ${field("Climate Entity", "climate_entity", "climate.living_room")}
          ${field("Valve Entity (optional)", "valve_entity", "number.living_room_valve")}
          ${field("Temperature Sensor (optional)", "temp_entity", "sensor.living_room_temperature")}
          ${field("Humidity Sensor (optional)", "humidity_entity", "sensor.living_room_humidity")}
        </div>
      `;
    }
  }

  customElements.define("clima-room-card-editor", ClimaRoomCardEditor);

  // Register card info with Lovelace
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "clima-room-card",
    name: "Clima Room Card",
    description:
      "Compact room card showing climate target temp, valve sparkline, temperature and humidity.",
    preview: false,
  });
})();
