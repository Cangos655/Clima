/**
 * Clima Multiroom Card — room overview for Home Assistant Lovelace
 * HACS-compliant, single-file, no build step required.
 *
 * type: custom:clima-multiroom-card
 */

const CLIMA_MULTIROOM_VERSION = "1.0.0";
console.info(
  `%c CLIMA-MULTIROOM-CARD %c v${CLIMA_MULTIROOM_VERSION} `,
  "background:#1e88e5;color:#fff;font-weight:700",
  "background:#ccc;color:#000"
);

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

  // ── Build static shell ──────────────────────────────────────────────────────

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { padding:0; overflow:hidden; }

        /* Header */
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

        /* Column headers */
        .col-header {
          display:grid;
          grid-template-columns: 1fr 60px 68px 72px 60px 68px;
          padding:4px 16px;
          font-size:.62rem; font-weight:700; text-transform:uppercase;
          letter-spacing:.06em; color:var(--secondary-text-color,#aaa);
          border-bottom:1px solid var(--divider-color,rgba(0,0,0,.06));
        }

        /* Rows */
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
        .row.heating {
          background:rgba(255,152,0,.04);
          border-left-color:#ff9800;
        }
        .row.unavailable { opacity:.45; cursor:default; }

        /* Room cell */
        .room-cell { display:flex; align-items:center; gap:8px; }
        .room-icon { font-size:1.1rem; flex-shrink:0; }
        .room-name { font-size:.9rem; font-weight:600; color:var(--primary-text-color); }

        /* Data cells */
        .cell { font-size:.82rem; color:var(--primary-text-color); text-align:right; }
        .cell.dim { color:var(--secondary-text-color,#aaa); }
        .cell .sub { font-size:.65rem; color:var(--secondary-text-color,#bbb); display:block; }
        .cell.temp-ist { font-size:1rem; font-weight:700; }
        .cell.humid { color:#1e88e5; font-weight:600; }

        /* Soll with arrow */
        .soll { display:flex; align-items:center; justify-content:flex-end; gap:3px;
                font-size:.82rem; color:var(--secondary-text-color,#888); }
        .arrow { font-size:.7rem; opacity:.6; }

        /* Mode badge */
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
                                font-style:italic; letter-spacing:.01em; }
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

  // ── Update values ───────────────────────────────────────────────────────────

  _update() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();

    const cfg  = this._config;
    const hass = this._hass;
    const sr   = this.shadowRoot;

    // Header
    sr.getElementById("card-title").textContent = cfg.title || "Heizung";

    const rooms = cfg.rooms || [];
    let heatingCount = 0;
    const currentTemps = [];

    // Build rows HTML
    const rowsHtml = rooms.map((room) => {
      const climate  = room.climate_entity ? hass.states[room.climate_entity] : null;
      const tempS    = room.temp_entity    ? hass.states[room.temp_entity]    : null;
      const humS     = room.humidity_entity? hass.states[room.humidity_entity]: null;
      const valveS   = room.valve_entity   ? hass.states[room.valve_entity]   : null;

      const unavailable = climate?.state === "unavailable" || (!climate && !tempS);
      const hvacMode    = climate?.state ?? "off";
      const isHeating   = hvacMode === "heat" || hvacMode === "heat_cool" || hvacMode === "auto";
      if (isHeating) heatingCount++;

      const istTemp = tempS && tempS.state !== "unavailable"
        ? `${parseFloat(tempS.state).toFixed(1)}°`
        : "—";
      if (tempS && tempS.state !== "unavailable") {
        currentTemps.push(parseFloat(tempS.state));
      }

      const humid = humS && humS.state !== "unavailable"
        ? `${parseFloat(humS.state).toFixed(0)}%`
        : "—";
      const humClass = humid !== "—" ? "cell humid" : "cell dim";

      const valvePct = valveS && valveS.state !== "unavailable"
        ? `${parseFloat(valveS.state).toFixed(0)}%`
        : "—";

      const sollTemp = climate?.attributes?.temperature != null
        ? `${parseFloat(climate.attributes.temperature).toFixed(1)}°`
        : "—";

      const modeLabel = unavailable
        ? "Unavail."
        : hvacMode.replace(/_/g, " ");
      const modeClass = unavailable
        ? "mode-badge unavail"
        : `mode-badge ${hvacMode}`;

      const rowClass = unavailable ? "row unavailable"
        : isHeating ? "row heating"
        : "row";

      const clickEntity = room.climate_entity || room.temp_entity || "";

      return `
        <div class="${rowClass}" data-entity="${clickEntity}">
          <div class="room-cell">
            ${room.icon ? `<span class="room-icon">${room.icon}</span>` : ""}
            <span class="room-name">${room.name || ""}</span>
          </div>
          <span class="${humClass}">${humid}</span>
          <span class="cell temp-ist">${istTemp}</span>
          <span class="cell dim">
            ${valvePct}
            <span class="sub">Ø —</span>
          </span>
          <span class="soll">
            <span class="arrow">→</span>${sollTemp}
          </span>
          <span class="${modeClass}">${modeLabel}</span>
        </div>`;
    }).join("");

    sr.getElementById("rows").innerHTML = rowsHtml;

    // Subtitle
    const heatingTxt = heatingCount > 0 ? ` · ${heatingCount} heizen` : "";
    sr.getElementById("card-subtitle").textContent =
      `${rooms.length} Räume${heatingTxt}`;

    // Average badge
    if (currentTemps.length > 0) {
      const avg = currentTemps.reduce((a, b) => a + b, 0) / currentTemps.length;
      const badge = sr.getElementById("avg-badge");
      badge.textContent = `Ø ${avg.toFixed(1)}°`;
      badge.style.display = "";
    }
  }

  // ── Config element (YAML only — room list too complex for visual editor) ────

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

window.customCards = window.customCards || [];
window.customCards.push({
  type: "clima-multiroom-card",
  name: "Clima Multiroom Card",
  description: "Raumübersicht: Temperatur, Feuchte, Ventil, Soll-Temp und Modus aller Zimmer.",
  preview: false,
});
