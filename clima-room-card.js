/**
 * Clima Room Card — compact room card for Home Assistant Lovelace
 * HACS-compliant, single-file, no build step required.
 *
 * type: custom:clima-room-card
 */

const CLIMA_CARD_VERSION = "1.2.0";

// Force Home Assistant to register <ha-entity-picker> by instantiating the
// config element of a built-in card that uses it. Without this, the element
// may never be defined and pickers stay empty.
const loadEntityPicker = async () => {
  if (customElements.get("ha-entity-picker")) return;
  if (!window.loadCardHelpers) return;
  const helpers = await window.loadCardHelpers();
  const entitiesCard = await helpers.createCardElement({ type: "entities", entities: [] });
  await entitiesCard.constructor.getConfigElement();
};
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

    // Event delegation on shadow root — survives any innerHTML changes.
    // Resolve the nearest ancestor that declares which entity to open.
    this.shadowRoot.addEventListener("click", (e) => {
      const el = e.target.closest("[data-more]");
      if (el) this._moreInfo(this._config[el.dataset.more]);
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
        ha-card { padding:0; overflow:hidden; border-radius:12px; }
        /* Header */
        .header {
          background: linear-gradient(135deg, #1e88e5, #1565c0);
          padding: 8px 12px;
          display:flex; justify-content:space-between; align-items:center;
        }
        .room { font-size:.7rem; font-weight:700; text-transform:uppercase;
                letter-spacing:.08em; color:rgba(255,255,255,.85); }
        .ver  { font-size:.58rem; font-weight:400; opacity:.6; margin-left:4px; }
        .badge { font-size:.6rem; font-weight:700; text-transform:uppercase;
                 padding:2px 7px; border-radius:6px;
                 background:rgba(255,255,255,.2); color:#fff; white-space:nowrap; }
        .badge.heat      { background:rgba(255,152,0,.35); color:#ffe0b2; }
        .badge.cool      { background:rgba(33,150,243,.35); color:#bbdefb; }
        .badge.heat_cool,.badge.auto { background:rgba(156,39,176,.35); color:#e1bee7; }
        /* Body */
        .body { padding:10px 12px; }
        /* Tiles 50/50 */
        .main-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
        .temp-cell { display:flex; flex-direction:column; align-items:flex-end; cursor:pointer;
                     background:rgba(30,136,229,.08); border-radius:8px; padding:6px 10px;
                     min-height:62px; }
        .temp-cell:active { background:rgba(30,136,229,.18); }
        .temp-label { font-size:.62rem; color:#1565c0; text-transform:uppercase;
                      letter-spacing:.04em; margin-bottom:2px; }
        .target { font-size:1.4rem; font-weight:700; color:#1565c0; line-height:1; }
        .hvac-badge { font-size:.6rem; font-weight:700; text-transform:uppercase;
                      padding:2px 6px; border-radius:5px; margin-top:auto;
                      background:rgba(255,255,255,.6); color:#1565c0;
                      border:1px solid rgba(30,136,229,.25); white-space:nowrap; }
        .hvac-badge.off       { background:rgba(0,0,0,.05); color:#bbb; border-color:#e0e0e0; }
        .hvac-badge.heat      { background:rgba(255,152,0,.12); color:#e65100; border-color:rgba(255,152,0,.3); }
        .hvac-badge.cool      { background:rgba(33,150,243,.12); color:#1565c0; border-color:rgba(33,150,243,.3); }
        .hvac-badge.heat_cool,.hvac-badge.auto { background:rgba(255,152,0,.12); color:#e65100; border-color:rgba(255,152,0,.3); }
        .valve-cell { display:flex; flex-direction:column; align-items:flex-end; cursor:pointer;
                      background:rgba(30,136,229,.08); border-radius:8px; padding:6px 10px; }
        .valve-cell:active { background:rgba(30,136,229,.18); }
        .vlabel { font-size:.62rem; color:#1565c0; text-transform:uppercase;
                  letter-spacing:.04em; margin-bottom:2px; }
        .vpct   { font-size:1.4rem; font-weight:700; color:#1565c0; line-height:1; }
        .vavg   { font-size:.68rem; color:#90caf9; margin-top:2px; }
        /* Sensors */
        .sensors { display:flex; gap:8px; }
        .chip { flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
                cursor:pointer; padding:5px 8px; border-radius:8px;
                background:var(--secondary-background-color,rgba(0,0,0,.04));
                font-size:.82rem; font-weight:600; }
        .chip:active { background:var(--primary-color,#03a9f4); color:#fff; }
      </style>
      <ha-card>
        <div class="header">
          <span class="room"><span id="room-name"></span></span>
        </div>
        <div class="body">
          <div class="main-row">
            <div class="temp-cell" data-more="climate_entity">
              <span class="temp-label">Soll-Temp</span>
              <span class="target" id="target-val">—°</span>
              <span class="hvac-badge off" id="hvac-badge">off</span>
            </div>
            ${cfg.valve_entity ? `
            <div class="valve-cell" data-more="valve_entity">
              <span class="vlabel">Ventil</span>
              <span class="vpct" id="valve-pct">—</span>
              <span class="vavg" id="valve-avg"></span>
            </div>` : ""}
          </div>
          <div class="sensors">
            ${cfg.temp_entity     ? `<div class="chip" id="chip-temp" data-more="temp_entity">🌡 —</div>` : ""}
            ${cfg.humidity_entity ? `<div class="chip" id="chip-hum" data-more="humidity_entity">💧 —</div>`  : ""}
          </div>
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

    sr.getElementById("target-val").textContent = `${targetTemp}°`;
    const badge = sr.getElementById("hvac-badge");
    badge.textContent = hvacMode.replace(/_/g, " ");
    badge.className   = `hvac-badge ${hvacMode}`;

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
    this._hass = null;
  }

  async setConfig(config) {
    this._config = { ...config };
    await loadEntityPicker();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Pass hass to all entity pickers
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((el) => {
      el.hass = hass;
    });
  }

  _fireChange() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      bubbles: true, composed: true,
      detail: { config: this._config },
    }));
  }

  _render() {
    const c = this._config;

    this.shadowRoot.innerHTML = `
      <style>
        .form { display:flex; flex-direction:column; gap:12px; padding:8px 0; }
        .field { display:flex; flex-direction:column; gap:4px; }
        label { font-size:.85rem; color:var(--secondary-text-color,#888); }
        input { padding:6px 8px; border:1px solid var(--divider-color,#ccc);
                border-radius:4px; background:var(--card-background-color,#fff);
                color:var(--primary-text-color); font-size:.9rem; width:100%; }
        input:focus { outline:none; border-color:var(--primary-color,#03a9f4); }
        small { font-size:.72rem; color:var(--secondary-text-color,#aaa); }
      </style>
      <div class="form">
        <div class="field">
          <label>Zimmer-Name</label>
          <input id="room_name" value="${c.room_name || ""}" placeholder="z.B. Wohnzimmer">
        </div>
        <div class="field">
          <label>Thermostat Entity *</label>
          <ha-entity-picker id="climate_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field">
          <label>Ventil Entity (optional)</label>
          <ha-entity-picker id="valve_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field">
          <label>Temperatur Sensor (optional)</label>
          <ha-entity-picker id="temp_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field">
          <label>Luftfeuchte Sensor (optional)</label>
          <ha-entity-picker id="humidity_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <small>* Pflichtfeld</small>
      </div>`;

    // Room name input
    this.shadowRoot.getElementById("room_name").addEventListener("change", (e) => {
      this._config = { ...this._config, room_name: e.target.value };
      this._fireChange();
    });

    // Entity pickers — picker element is loaded before _render() runs
    const pickerDomains = {
      climate_entity:  ["climate"],
      valve_entity:    null,
      temp_entity:     ["sensor"],
      humidity_entity: ["sensor"],
    };
    Object.entries(pickerDomains).forEach(([key, domains]) => {
      const el = this.shadowRoot.getElementById(key);
      if (!el) return;
      if (this._hass) el.hass = this._hass;
      el.value = c[key] || "";
      if (domains) el.includeDomains = domains;
      el.addEventListener("value-changed", (e) => {
        this._config = { ...this._config, [key]: e.detail.value };
        this._fireChange();
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

// ─────────────────────────────────────────────────────────────────────────────
// Clima Multiroom Card — room overview
// type: custom:clima-multiroom-card
// ─────────────────────────────────────────────────────────────────────────────

class ClimaMultiroomCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._built = false;

    this.shadowRoot.addEventListener("click", (e) => {
      const row = e.target.closest("[data-entity]");
      if (row) this._moreInfo(row.dataset.entity);
    });
  }

  setConfig(config) {
    if (!config.rooms || !Array.isArray(config.rooms)) {
      throw new Error("clima-multiroom-card: 'rooms' array is required");
    }
    this._config = config;
    this._built = false;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() {
    return Math.max(3, (this._config.rooms?.length || 0) + 2);
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true, detail: { entityId },
    }));
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:0; overflow:hidden; }

        .header {
          display:flex; align-items:center; gap:12px;
          padding:14px 16px 10px;
          border-bottom:1px solid var(--divider-color,rgba(0,0,0,.08));
        }
        .title-block { flex:1; }
        .title { font-size:1.1rem; font-weight:700; color:var(--primary-text-color); }
        .subtitle { font-size:.75rem; color:var(--secondary-text-color,#888); margin-top:1px; }
        .avg-badge {
          font-size:.85rem; font-weight:700;
          padding:4px 10px; border-radius:20px;
          background:rgba(30,136,229,.12); color:#1565c0;
          white-space:nowrap;
        }

        .col-header {
          display:grid;
          grid-template-columns: 1fr 60px 68px 72px 60px 68px;
          padding:4px 16px;
          font-size:.62rem; font-weight:700; text-transform:uppercase;
          letter-spacing:.06em; color:var(--secondary-text-color,#aaa);
          border-bottom:1px solid var(--divider-color,rgba(0,0,0,.06));
        }

        .row {
          display:grid;
          grid-template-columns: 1fr 60px 68px 72px 60px 68px;
          align-items:center;
          padding:10px 16px;
          border-bottom:1px solid var(--divider-color,rgba(0,0,0,.04));
          cursor:pointer;
          transition:background .15s;
          border-left:3px solid transparent;
        }
        .row:last-child { border-bottom:none; }
        .row:active { background:var(--secondary-background-color,rgba(0,0,0,.04)); }
        .row.heating { background:rgba(255,152,0,.04); border-left-color:#ff9800; }
        .row.unavailable { opacity:.45; cursor:default; }

        .room-cell { display:flex; align-items:center; gap:8px; }
        .room-icon { font-size:1.1rem; flex-shrink:0; }
        .room-name { font-size:.9rem; font-weight:600; color:var(--primary-text-color); }

        .cell { font-size:.82rem; color:var(--primary-text-color); text-align:right; }
        .cell.dim { color:var(--secondary-text-color,#aaa); }
        .cell .sub { font-size:.65rem; color:var(--secondary-text-color,#bbb); display:block; }
        .cell.temp-ist { font-size:1rem; font-weight:700; }
        .cell.humid { color:#1e88e5; font-weight:600; }

        .soll { display:flex; align-items:center; justify-content:flex-end; gap:3px;
                font-size:.82rem; color:var(--secondary-text-color,#888); }
        .arrow { font-size:.7rem; opacity:.6; }

        .mode-badge {
          font-size:.6rem; font-weight:700; text-transform:uppercase;
          padding:2px 6px; border-radius:5px; justify-self:end;
          background:rgba(0,0,0,.05); color:#aaa;
          border:1px solid rgba(0,0,0,.08);
          white-space:nowrap;
        }
        .mode-badge.heat      { background:rgba(255,152,0,.12); color:#e65100; border-color:rgba(255,152,0,.3); }
        .mode-badge.cool      { background:rgba(33,150,243,.12); color:#1565c0; border-color:rgba(33,150,243,.3); }
        .mode-badge.heat_cool,
        .mode-badge.auto      { background:rgba(255,152,0,.12); color:#e65100; border-color:rgba(255,152,0,.3); }
        .mode-badge.unavail   { background:transparent; color:#ccc; border-color:#e8e8e8;
                                font-style:italic; }
      </style>
      <ha-card>
        <div class="header">
          <div class="title-block">
            <div class="title" id="card-title">Heizung</div>
            <div class="subtitle" id="card-subtitle"></div>
          </div>
          <div class="avg-badge" id="avg-badge" style="display:none"></div>
        </div>
        <div class="col-header">
          <span>Raum</span>
          <span style="text-align:right">Feuchte</span>
          <span style="text-align:right">Ist</span>
          <span style="text-align:right">Ventil</span>
          <span style="text-align:right">Soll</span>
          <span style="text-align:right">Modus</span>
        </div>
        <div id="rows"></div>
      </ha-card>`;
    this._built = true;
  }

  _update() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();

    const cfg  = this._config;
    const hass = this._hass;
    const sr   = this.shadowRoot;

    sr.getElementById("card-title").textContent = cfg.title || "Heizung";

    const rooms = cfg.rooms || [];
    let heatingCount = 0;
    const currentTemps = [];

    const rowsHtml = rooms.map((room) => {
      const climate = room.climate_entity ? hass.states[room.climate_entity] : null;
      const tempS   = room.temp_entity    ? hass.states[room.temp_entity]    : null;
      const humS    = room.humidity_entity? hass.states[room.humidity_entity]: null;
      const valveS  = room.valve_entity   ? hass.states[room.valve_entity]   : null;

      const unavailable = climate?.state === "unavailable" || (!climate && !tempS);
      const hvacMode    = climate?.state ?? "off";
      const isHeating   = hvacMode === "heat" || hvacMode === "heat_cool" || hvacMode === "auto";
      if (isHeating) heatingCount++;

      const istTemp = tempS && tempS.state !== "unavailable"
        ? `${parseFloat(tempS.state).toFixed(1)}°` : "—";
      if (tempS && tempS.state !== "unavailable") currentTemps.push(parseFloat(tempS.state));

      const humid = humS && humS.state !== "unavailable"
        ? `${parseFloat(humS.state).toFixed(0)}%` : "—";
      const humClass = humid !== "—" ? "cell humid" : "cell dim";

      const valvePct = valveS && valveS.state !== "unavailable"
        ? `${parseFloat(valveS.state).toFixed(0)}%` : "—";

      const sollTemp = climate?.attributes?.temperature != null
        ? `${parseFloat(climate.attributes.temperature).toFixed(1)}°` : "—";

      const modeLabel = unavailable ? "Unavail." : hvacMode.replace(/_/g, " ");
      const modeClass = unavailable ? "mode-badge unavail" : `mode-badge ${hvacMode}`;
      const rowClass  = unavailable ? "row unavailable" : isHeating ? "row heating" : "row";
      const clickEntity = room.climate_entity || room.temp_entity || "";

      return `
        <div class="${rowClass}" data-entity="${clickEntity}">
          <div class="room-cell">
            ${room.icon ? `<span class="room-icon">${room.icon}</span>` : ""}
            <span class="room-name">${room.name || ""}</span>
          </div>
          <span class="${humClass}">${humid}</span>
          <span class="cell temp-ist">${istTemp}</span>
          <span class="cell dim">${valvePct}<span class="sub">Ø —</span></span>
          <span class="soll"><span class="arrow">→</span>${sollTemp}</span>
          <span class="${modeClass}">${modeLabel}</span>
        </div>`;
    }).join("");

    sr.getElementById("rows").innerHTML = rowsHtml;

    const heatingTxt = heatingCount > 0 ? ` · ${heatingCount} heizen` : "";
    sr.getElementById("card-subtitle").textContent = `${rooms.length} Räume${heatingTxt}`;

    if (currentTemps.length > 0) {
      const avg = currentTemps.reduce((a, b) => a + b, 0) / currentTemps.length;
      const badge = sr.getElementById("avg-badge");
      badge.textContent = `Ø ${avg.toFixed(1)}°`;
      badge.style.display = "";
    }
  }

  static getStubConfig() {
    return {
      title: "Heizung",
      rooms: [
        {
          name: "Wohnzimmer",
          icon: "🛋️",
          climate_entity: "climate.wohnzimmer",
          temp_entity: "sensor.wohnzimmer_temperature",
          humidity_entity: "sensor.wohnzimmer_humidity",
          valve_entity: "sensor.wohnzimmer_valve",
        },
      ],
    };
  }
}

customElements.define("clima-multiroom-card", ClimaMultiroomCard);

window.customCards.push({
  type: "clima-multiroom-card",
  name: "Clima Multiroom Card",
  description: "Raumübersicht: Temperatur, Feuchte, Ventil, Soll-Temp und Modus aller Zimmer.",
  preview: false,
});
