/**
 * Clima Room Card — compact room card for Home Assistant Lovelace
 * HACS-compliant, single-file, no build step required.
 *
 * type: custom:clima-room-card
 */

const CLIMA_CARD_VERSION = "1.0.6";
console.info(`%c CLIMA-ROOM-CARD %c v${CLIMA_CARD_VERSION} `, "background:#03a9f4;color:#fff;font-weight:700", "background:#ccc;color:#000");

class ClimaRoomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._valveAvg = null;
    this._historyLoading = false;
    this._lastHistoryFetch = 0;
    this._built = false;

    // Event delegation on shadow root — survives any innerHTML changes
    this.shadowRoot.addEventListener("click", (e) => {
      const id = e.target.id || e.target.closest("[id]")?.id;
if (id === "target")     this._moreInfo(this._config.climate_entity);
      if (id === "chip-temp")  this._moreInfo(this._config.temp_entity);
      if (id === "chip-hum")   this._moreInfo(this._config.humidity_entity);
    });
  }

  setConfig(config) {
    if (!config.climate_entity) {
      throw new Error("clima-room-card: 'climate_entity' ist erforderlich");
    }
    this._config = config;
    this._built = false;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
    const now = Date.now();
    if (
      this._config.valve_entity &&
      now - this._lastHistoryFetch > 5 * 60 * 1000
    ) {
      this._lastHistoryFetch = now;
      this._loadHistory();
    }
  }

  getCardSize() { return 2; }

  // ---- Build DOM once --------------------------------------------------------

  _build() {
    const cfg = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:10px 14px; }
        .room { font-size:.75rem; font-weight:700; text-transform:uppercase;
                letter-spacing:.06em; color:var(--secondary-text-color,#888);
                margin-bottom:6px; }
        .ver  { font-size:.6rem; font-weight:400; opacity:.5; }
        .thermo { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
        .target { font-size:1.9rem; font-weight:700; cursor:pointer; flex:1;
                  color:var(--primary-text-color); line-height:1; }
        .target:hover { color:var(--primary-color,#03a9f4); }
.badge { font-size:.62rem; font-weight:700; text-transform:uppercase;
                 padding:2px 6px; border-radius:10px;
                 background:var(--primary-color,#03a9f4); color:#fff; white-space:nowrap; }
        .badge.off       { background:var(--disabled-text-color,#bbb); }
        .badge.heat      { background:#ff9800; }
        .badge.cool      { background:#2196f3; }
        .badge.heat_cool,.badge.auto { background:#9c27b0; }
        .valve  { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .vlabel { font-size:.72rem; color:var(--secondary-text-color,#888); }
        .vpct   { font-size:.82rem; font-weight:700; min-width:34px; }
        .vavg   { font-size:.72rem; color:var(--secondary-text-color,#888); }
        .sensors { display:flex; gap:10px; }
        .chip { display:flex; align-items:center; gap:4px; cursor:pointer;
                padding:3px 8px; border-radius:12px;
                background:var(--secondary-background-color,rgba(0,0,0,.05));
                font-size:.82rem; font-weight:600; }
        .chip:active { background:var(--primary-color,#03a9f4); color:#fff; }
      </style>
      <ha-card>
        <div class="room">
          <span id="room-name"></span>
          <span class="ver">v${CLIMA_CARD_VERSION}</span>
        </div>
        <div class="thermo">
          <span class="target" id="target">—°</span>
          <span class="badge off" id="badge">off</span>
        </div>
        ${cfg.valve_entity ? `
        <div class="valve">
          <span class="vlabel">Ventil</span>
          <span class="vpct" id="valve-pct">—</span>
          <span class="vavg" id="valve-avg"></span>
        </div>` : ""}
        <div class="sensors">
          ${cfg.temp_entity     ? `<div class="chip" id="chip-temp">🌡 —</div>` : ""}
          ${cfg.humidity_entity ? `<div class="chip" id="chip-hum">💧 —</div>`  : ""}
        </div>
      </ha-card>`;

    this._built = true;
  }

  // ---- Update only text/values -----------------------------------------------

  _update() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();

    const cfg  = this._config;
    const hass = this._hass;
    const sr   = this.shadowRoot;

    // Room name
    sr.getElementById("room-name").textContent = cfg.room_name || "Zimmer";

    // Climate
    const climate   = hass.states[cfg.climate_entity];
    const targetTemp = climate?.attributes?.temperature != null
      ? parseFloat(climate.attributes.temperature).toFixed(1)
      : "—";
    const hvacMode  = climate?.state ?? "off";

    sr.getElementById("target").textContent = `${targetTemp}°`;
    const badge = sr.getElementById("badge");
    badge.textContent  = hvacMode.replace(/_/g, " ");
    badge.className    = `badge ${hvacMode}`;

    // Valve
    if (cfg.valve_entity) {
      const valve = hass.states[cfg.valve_entity];
      sr.getElementById("valve-pct").textContent =
        valve ? `${parseFloat(valve.state).toFixed(0)}%` : "—";
      const avgEl = sr.getElementById("valve-avg");
      if (avgEl) {
        avgEl.textContent = this._historyLoading
          ? "Laden…"
          : this._valveAvg != null
            ? `Ø 24h: ${this._valveAvg.toFixed(0)}%`
            : "";
      }
    }

    // Sensors
    const tempS = cfg.temp_entity ? hass.states[cfg.temp_entity] : null;
    const humS  = cfg.humidity_entity ? hass.states[cfg.humidity_entity] : null;
    const chipTemp = sr.getElementById("chip-temp");
    const chipHum  = sr.getElementById("chip-hum");
    if (chipTemp) chipTemp.textContent = `🌡 ${tempS ? parseFloat(tempS.state).toFixed(1) + "°" : "—"}`;
    if (chipHum)  chipHum.textContent  = `💧 ${humS  ? parseFloat(humS.state).toFixed(0)  + "%" : "—"}`;
  }

  // ---- History ---------------------------------------------------------------

  async _loadHistory() {
    if (!this._config.valve_entity || !this._hass) return;
    this._historyLoading = true;
    this._updateValveAvg();

    const end   = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const url   = `/api/history/period/${start.toISOString()}` +
      `?filter_entity_id=${this._config.valve_entity}` +
      `&minimal_response&end_time=${end.toISOString()}`;
    try {
      const res  = await this._hass.fetchWithAuth(url);
      if (res.ok) {
        const data   = await res.json();
        const values = (data?.[0] ?? [])
          .map((s) => parseFloat(s.state))
          .filter((v) => !isNaN(v));
        this._valveAvg = values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null;
      }
    } catch (_) {
      this._valveAvg = null;
    }
    this._historyLoading = false;
    this._updateValveAvg();
  }

  _updateValveAvg() {
    const el = this.shadowRoot.getElementById("valve-avg");
    if (!el) return;
    el.textContent = this._historyLoading
      ? "Laden…"
      : this._valveAvg != null
        ? `Ø 24h: ${this._valveAvg.toFixed(0)}%`
        : "";
  }

  // ---- Actions ---------------------------------------------------------------

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true, detail: { entityId },
    }));
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
        this.dispatchEvent(new CustomEvent("config-changed", {
          bubbles: true, composed: true,
          detail: { config: this._config },
        }));
      });
    });
  }
}

customElements.define("clima-room-card-editor", ClimaRoomCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "clima-room-card",
  name: "Clima Room Card",
  description: "Kompakte Zimmerkarte: Thermostat, Ventilstellung, Temperatur & Luftfeuchte.",
  preview: false,
});
