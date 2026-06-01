/**
 * Clima Room Card — compact room card for Home Assistant Lovelace
 * HACS-compliant, single-file, no build step required.
 *
 * type: custom:clima-room-card
 */

class ClimaRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._valveHistory = [];
    this._historyLoading = false;
    this._lastHistoryFetch = 0;
  }

  setConfig(config) {
    if (!config.climate_entity) {
      throw new Error("clima-room-card: 'climate_entity' ist erforderlich");
    }
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    // Reload history every 5 minutes
    const now = Date.now();
    if (
      this._config.valve_entity &&
      now - this._lastHistoryFetch > 5 * 60 * 1000
    ) {
      this._lastHistoryFetch = now;
      this._loadHistory();
    }
  }

  getCardSize() {
    return 2;
  }

  // ---- History ---------------------------------------------------------------

  async _loadHistory() {
    if (!this._config.valve_entity || !this._hass) return;
    this._historyLoading = true;
    this._renderValveRow();

    const end = new Date();
    const start = new Date(end.getTime() - 12 * 60 * 60 * 1000);
    const url =
      `/api/history/period/${start.toISOString()}` +
      `?filter_entity_id=${this._config.valve_entity}` +
      `&minimal_response&end_time=${end.toISOString()}`;
    try {
      const res = await this._hass.fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        this._valveHistory = (data && data[0] ? data[0] : [])
          .map((s) => parseFloat(s.state))
          .filter((v) => !isNaN(v));
      }
    } catch (_) {
      this._valveHistory = [];
    }
    this._historyLoading = false;
    this._renderValveRow();
  }

  // ---- Sparkline SVG ---------------------------------------------------------

  _sparkline(values, width = 90, height = 26) {
    if (!values || values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <polyline points="${pts}" fill="none" stroke="var(--primary-color,#03a9f4)"
        stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // ---- Actions ---------------------------------------------------------------

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
    const climate = this._hass && this._hass.states[this._config.climate_entity];
    if (!climate) return;
    const current =
      parseFloat(climate.attributes.temperature) ||
      parseFloat(climate.attributes.current_temperature) ||
      20;
    const step = parseFloat(climate.attributes.target_temp_step) || 0.5;
    const newTemp = Math.round((current + delta) / step) * step;
    this._hass.callService("climate", "set_temperature", {
      entity_id: this._config.climate_entity,
      temperature: newTemp,
    });
  }

  // ---- Render ----------------------------------------------------------------

  _styles() {
    return `
      :host { display: block; }
      ha-card { padding: 10px 14px 10px; }
      .room { font-size:.75rem; font-weight:700; text-transform:uppercase;
              letter-spacing:.06em; color:var(--secondary-text-color,#888);
              margin-bottom:6px; }
      .thermo { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
      .target { font-size:1.9rem; font-weight:700; cursor:pointer; flex:1;
                color:var(--primary-text-color); line-height:1; }
      .target:hover { color:var(--primary-color,#03a9f4); }
      .btn { background:none; border:1px solid var(--divider-color,#ccc);
             border-radius:50%; width:26px; height:26px; cursor:pointer;
             font-size:1rem; color:var(--primary-text-color);
             display:flex; align-items:center; justify-content:center; padding:0; }
      .btn:hover { background:var(--primary-color,#03a9f4); color:#fff;
                   border-color:var(--primary-color,#03a9f4); }
      .badge { font-size:.62rem; font-weight:700; text-transform:uppercase;
               padding:2px 6px; border-radius:10px;
               background:var(--primary-color,#03a9f4); color:#fff; white-space:nowrap; }
      .badge.off  { background:var(--disabled-text-color,#bbb); }
      .badge.heat { background:#ff9800; }
      .badge.cool { background:#2196f3; }
      .badge.heat_cool,.badge.auto { background:#9c27b0; }
      .valve { display:flex; align-items:center; gap:8px; margin-bottom:6px; min-height:28px; }
      .vlabel { font-size:.72rem; color:var(--secondary-text-color,#888); white-space:nowrap; }
      .vpct   { font-size:.82rem; font-weight:700; min-width:34px; }
      .spark  { flex:1; display:flex; justify-content:flex-end; align-items:center; }
      .loading { font-size:.68rem; color:var(--secondary-text-color,#aaa); font-style:italic; }
      .sensors { display:flex; gap:10px; }
      .chip { display:flex; align-items:center; gap:4px; cursor:pointer;
              padding:3px 8px; border-radius:12px;
              background:var(--secondary-background-color,rgba(0,0,0,.05));
              font-size:.82rem; font-weight:600; }
      .chip:hover { background:var(--primary-color,#03a9f4); color:#fff; }
    `;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const cfg = this._config;
    const hass = this._hass;

    const climate = hass.states[cfg.climate_entity];
    const targetTemp = climate && climate.attributes.temperature != null
      ? parseFloat(climate.attributes.temperature).toFixed(1)
      : "—";
    const hvacMode = climate ? climate.state : "off";
    const hvacLabel = hvacMode.replace(/_/g, " ");

    const valve = cfg.valve_entity ? hass.states[cfg.valve_entity] : null;
    const valvePct = valve ? `${parseFloat(valve.state).toFixed(0)}%` : "—";

    const tempS = cfg.temp_entity ? hass.states[cfg.temp_entity] : null;
    const humS  = cfg.humidity_entity ? hass.states[cfg.humidity_entity] : null;
    const tempVal = tempS ? `${parseFloat(tempS.state).toFixed(1)}°` : null;
    const humVal  = humS  ? `${parseFloat(humS.state).toFixed(0)}%`  : null;

    const roomName = cfg.room_name || "Zimmer";

    const sparkHtml = this._historyLoading
      ? `<span class="loading">Laden…</span>`
      : `<span class="svg-wrap">${this._sparkline(this._valveHistory)}</span>`;

    const valveRow = cfg.valve_entity ? `
      <div class="valve" id="valve-row">
        <span class="vlabel">Ventil</span>
        <span class="vpct">${valvePct}</span>
        <span class="spark">${sparkHtml}</span>
      </div>` : "";

    const sensorRow = (tempVal || humVal) ? `
      <div class="sensors">
        ${tempVal ? `<div class="chip" id="chip-temp">🌡 ${tempVal}</div>` : ""}
        ${humVal  ? `<div class="chip" id="chip-hum">💧 ${humVal}</div>`   : ""}
      </div>` : "";

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="room">${roomName}</div>
        <div class="thermo">
          <span class="target" id="target">${targetTemp}°</span>
          <button class="btn" id="btn-minus">−</button>
          <button class="btn" id="btn-plus">+</button>
          <span class="badge ${hvacMode}">${hvacLabel}</span>
        </div>
        ${valveRow}
        ${sensorRow}
      </ha-card>`;

    // Attach events after render
    this.shadowRoot.getElementById("target")
      ?.addEventListener("click", () => this._moreInfo(cfg.climate_entity));
    this.shadowRoot.getElementById("btn-minus")
      ?.addEventListener("click", () => this._adjustTemp(-0.5));
    this.shadowRoot.getElementById("btn-plus")
      ?.addEventListener("click", () => this._adjustTemp(0.5));
    this.shadowRoot.getElementById("chip-temp")
      ?.addEventListener("click", () => this._moreInfo(cfg.temp_entity));
    this.shadowRoot.getElementById("chip-hum")
      ?.addEventListener("click", () => this._moreInfo(cfg.humidity_entity));
  }

  _renderValveRow() {
    const row = this.shadowRoot.querySelector(".valve");
    if (!row) return;
    const cfg = this._config;
    const hass = this._hass;
    const valve = cfg.valve_entity ? hass.states[cfg.valve_entity] : null;
    const valvePct = valve ? `${parseFloat(valve.state).toFixed(0)}%` : "—";
    const sparkHtml = this._historyLoading
      ? `<span class="loading">Laden…</span>`
      : `<span class="svg-wrap">${this._sparkline(this._valveHistory)}</span>`;
    row.innerHTML = `
      <span class="vlabel">Ventil</span>
      <span class="vpct">${valvePct}</span>
      <span class="spark">${sparkHtml}</span>`;
  }

  // ---- Visual editor ---------------------------------------------------------

  static getConfigElement() {
    return document.createElement("clima-room-card-editor");
  }

  static getStubConfig() {
    return {
      room_name: "Zimmer",
      climate_entity: "climate.beispiel",
      valve_entity: "",
      temp_entity: "",
      humidity_entity: "",
    };
  }
}

customElements.define("clima-room-card", ClimaRoomCard);

// ---------------------------------------------------------------------------
// Visual config editor
// ---------------------------------------------------------------------------
class ClimaRoomCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(_) {}

  _render() {
    const c = this._config;
    const field = (label, key, placeholder, required = false) =>
      `<label>${label}${required ? " *" : ""}
        <input data-key="${key}" value="${c[key] || ""}" placeholder="${placeholder}">
      </label>`;

    this.shadowRoot.innerHTML = `
      <style>
        .form { display:flex; flex-direction:column; gap:10px; padding:8px 0; }
        label { display:flex; flex-direction:column; font-size:.85rem;
                color:var(--secondary-text-color,#888); gap:3px; }
        input { padding:6px 8px; border:1px solid var(--divider-color,#ccc);
                border-radius:4px; background:var(--card-background-color,#fff);
                color:var(--primary-text-color); font-size:.9rem; }
        input:focus { outline:none; border-color:var(--primary-color,#03a9f4); }
        small { font-size:.72rem; color:var(--secondary-text-color,#aaa); }
      </style>
      <div class="form">
        ${field("Zimmer-Name", "room_name", "z.B. Wohnzimmer")}
        ${field("Thermostat Entity", "climate_entity", "climate.wohnzimmer", true)}
        ${field("Ventil Entity (optional)", "valve_entity", "sensor.wohnzimmer_ventil")}
        ${field("Temperatur Sensor (optional)", "temp_entity", "sensor.wohnzimmer_temperatur")}
        ${field("Luftfeuchte Sensor (optional)", "humidity_entity", "sensor.wohnzimmer_luftfeuchte")}
        <small>* Pflichtfeld</small>
      </div>`;

    this.shadowRoot.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const key = e.target.dataset.key;
        this._config = { ...this._config, [key]: e.target.value };
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            bubbles: true,
            composed: true,
            detail: { config: this._config },
          })
        );
      });
    });
  }
}

customElements.define("clima-room-card-editor", ClimaRoomCardEditor);

// Register card in HA card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: "clima-room-card",
  name: "Clima Room Card",
  description: "Kompakte Zimmerkarte: Thermostat, Ventilstellung, Temperatur & Luftfeuchte.",
  preview: false,
});
