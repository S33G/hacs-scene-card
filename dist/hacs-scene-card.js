// src/area-scene-chips-card.ts
var CARD_STYLESHEET_URL = new URL("./hacs-scene-card.css", import.meta.url).href;
function attachCardStylesheet(root) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = CARD_STYLESHEET_URL;
  root.append(stylesheet);
}
var AreaSceneChipsCard = class extends HTMLElement {
  constructor() {
    super();
    this._areas = [];
    this._entities = [];
    this._unsubscribers = [];
    this._registryReady = false;
    this._registryError = "";
    this._refreshToken = 0;
    this.attachShadow({ mode: "open" });
    attachCardStylesheet(this.shadowRoot);
    this._content = document.createElement("div");
    this.shadowRoot.append(this._content);
    this._config = void 0;
    this._areas = [];
    this._entities = [];
    this._unsubscribers = [];
    this._registryReady = false;
    this._registryError = "";
    this._refreshToken = 0;
  }
  setConfig(config) {
    if (!config || !Array.isArray(config.areas) || config.areas.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error("Configure one or more area IDs in `areas`.");
    }
    this._config = { show_names: false, show_title: true, ...config };
    this._render();
    if (this._hass) this._loadRegistries();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._registryReady && this._config) this._loadRegistries();
    this._render();
  }
  get hass() {
    return this._hass;
  }
  connectedCallback() {
    if (this._hass && this._config) this._subscribeRegistries();
  }
  disconnectedCallback() {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
    this._refreshToken++;
  }
  getCardSize() {
    return Math.max(1, (this._config?.areas?.length || 1) * 2);
  }
  getGridOptions() {
    return { rows: "auto", columns: 12, min_rows: 1 };
  }
  static getConfigElement() {
    return document.createElement("area-scene-chips-card-editor");
  }
  static getStubConfig() {
    return { areas: [], show_names: false, show_title: true };
  }
  async _loadRegistries() {
    if (!this._hass?.callWS || !this._config) return;
    const token = ++this._refreshToken;
    try {
      const [areas, entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" })
      ]);
      if (token !== this._refreshToken || !this.isConnected) return;
      this._areas = areas;
      this._entities = entities;
      this._registryReady = true;
      this._registryError = "";
    } catch (error) {
      if (token !== this._refreshToken) return;
      this._registryError = "Could not load Home Assistant area and entity registries.";
      console.error("Area Scene Chips Card: registry request failed", error);
    }
    this._render();
    this._subscribeRegistries();
  }
  _subscribeRegistries() {
    if (!this.isConnected || !this._hass?.connection?.subscribeEvents || this._unsubscribers.length) return;
    for (const eventType of ["entity_registry_updated", "area_registry_updated"]) {
      this._hass.connection.subscribeEvents(() => this._loadRegistries(), eventType).then((unsubscribe) => {
        if (!this.isConnected) unsubscribe();
        else this._unsubscribers.push(unsubscribe);
      }).catch((error) => console.warn(`Area Scene Chips Card: cannot subscribe to ${eventType}`, error));
    }
  }
  _sceneGroups() {
    if (!this._registryReady) return [];
    const areaById = new Map(this._areas.map((area) => [area.area_id, area]));
    const invalid = this._config.areas.filter((id) => !areaById.has(id));
    if (invalid.length) {
      this._registryError = `Unknown area ID${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}. Check the Home Assistant area IDs.`;
      return [];
    }
    this._registryError = "";
    const groups = this._config.areas.map((id) => ({ area: areaById.get(id), scenes: [] }));
    const groupById = new Map(groups.map((group) => [group.area.area_id, group]));
    for (const entry of this._entities) {
      if (!entry.entity_id?.startsWith("scene.") || entry.platform !== "homeassistant" || !entry.area_id) continue;
      const group = groupById.get(entry.area_id);
      const state = this._hass.states[entry.entity_id];
      if (!group || !state) continue;
      group.scenes.push({ entry, state });
    }
    for (const group of groups) {
      group.scenes.sort((a, b) => a.entry.entity_id.localeCompare(b.entry.entity_id));
      const valid = group.scenes.map((scene) => ({ ...scene, timestamp: Date.parse(scene.state.attributes?.last_activated ?? scene.state.attributes?.last_triggered ?? "") })).filter((scene) => Number.isFinite(scene.timestamp));
      valid.sort((a, b) => b.timestamp - a.timestamp || a.entry.entity_id.localeCompare(b.entry.entity_id));
      group.latest = valid[0]?.entry.entity_id;
    }
    return groups.filter((group) => group.scenes.length);
  }
  async _activate(entityId) {
    const state = this._hass?.states?.[entityId];
    if (!state || ["unavailable", "unknown"].includes(state.state)) return;
    try {
      await this._hass.callService("scene", "turn_on", { entity_id: entityId });
    } catch (error) {
      console.error(`Area Scene Chips Card: could not activate ${entityId}`, error);
    }
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    const groups = this._sceneGroups();
    const message = this._registryError || (!this._registryReady ? "Loading scenes\u2026" : "");
    this._content.innerHTML = `<ha-card>${message ? `<div class="${this._registryError ? "error" : "loading"}" role="${this._registryError ? "alert" : "status"}">${this._escape(message)}</div>` : groups.map((group) => {
      const chips = group.scenes.map(({ entry, state }) => {
        const id = entry.entity_id;
        const name = state.attributes?.friendly_name || entry.name || id;
        const unavailable = ["unavailable", "unknown"].includes(state.state);
        const icon = entry.icon || state.attributes?.icon || "mdi:palette";
        const active = group.latest === id;
        return `<button type="button" data-entity="${this._escape(id)}" title="${this._escape(name)}" aria-label="${this._escape(name)}${active ? ", last activated" : ""}${unavailable ? ", unavailable" : ""}" aria-pressed="${active}" ${unavailable ? 'disabled aria-disabled="true"' : ""} class="${active ? "active" : ""}"><ha-icon icon="${this._escape(icon)}"></ha-icon>${this._config.show_names ? `<span class="name">${this._escape(name)}</span>` : ""}</button>`;
      }).join("");
      return `<section class="area" aria-label="${this._escape(group.area.name)}" title="${this._escape(group.area.name)}">${this._config.show_title ? `<div class="label">${this._escape(group.area.name)}</div>` : ""}<div class="chips">${chips}</div></section>`;
    }).join("")}</ha-card>`;
    this._content.querySelectorAll("button[data-entity]").forEach((button) => button.addEventListener("click", () => this._activate(button.dataset.entity)));
  }
  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
};
var AreaSceneChipsCardEditor = class extends HTMLElement {
  constructor() {
    super();
    this._config = { areas: [], show_names: false, show_title: true };
    this._areas = [];
    this._loading = false;
    this._loaded = false;
    this._loadError = "";
    this._rendered = false;
    this._unsubscribers = [];
    this._subscriptionsPending = false;
    this.attachShadow({ mode: "open" });
    attachCardStylesheet(this.shadowRoot);
    this._content = document.createElement("div");
    this.shadowRoot.append(this._content);
    this._config = { areas: [], show_names: false, show_title: true };
    this._areas = [];
  }
  setConfig(config) {
    const next = { show_names: false, show_title: true, ...config, areas: Array.isArray(config?.areas) ? config.areas : [] };
    const changed = this._config.show_names !== next.show_names || this._config.show_title !== next.show_title || this._config.areas.length !== next.areas.length || this._config.areas.some((id, index) => id !== next.areas[index]);
    this._config = next;
    if (!this._rendered || changed) this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._subscribeRegistryEvents();
    if (!this._loaded) this._load();
  }
  connectedCallback() {
    this._subscribeRegistryEvents();
  }
  async _subscribeRegistryEvents() {
    if (!this.isConnected || !this._hass?.connection?.subscribeEvents || this._unsubscribers.length || this._subscriptionsPending) return;
    this._subscriptionsPending = true;
    try {
      const unsubscribers = await Promise.all(["area_registry_updated"].map(
        (eventType) => this._hass.connection.subscribeEvents(() => {
          this._loaded = false;
          this._load();
        }, eventType)
      ));
      if (!this.isConnected) unsubscribers.forEach((unsubscribe) => unsubscribe());
      else this._unsubscribers.push(...unsubscribers);
    } catch (error) {
      console.warn("Area Scene Chips Card editor: cannot subscribe to registry updates", error);
    } finally {
      this._subscriptionsPending = false;
    }
  }
  disconnectedCallback() {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
  }
  async _load() {
    if (!this._hass?.callWS || this._loading || this._loaded) return;
    this._loading = true;
    this._render();
    try {
      this._areas = await this._hass.callWS({ type: "config/area_registry/list" });
      this._loaded = true;
      this._loadError = "";
    } catch (error) {
      this._loadError = "Could not load Home Assistant areas.";
      console.error("Area Scene Chips Card editor: area registry request failed", error);
    }
    this._loading = false;
    this._render();
  }
  _render() {
    this._rendered = true;
    const areas = [...this._areas].sort((a, b) => a.name.localeCompare(b.name) || a.area_id.localeCompare(b.area_id));
    const selectedAreas = new Set(this._config.areas);
    const knownAreas = new Set(areas.map((area) => area.area_id));
    const unknownAreas = this._config.areas.filter((id) => !knownAreas.has(id));
    const areaOptions = unknownAreas.map((id) => `<label class="area-option unknown-area"><input type="checkbox" data-area-id="${this._escape(id)}" checked><span>Unknown area: ${this._escape(id)}</span></label>`).join("") + areas.map((area) => `<label class="area-option"><input type="checkbox" data-area-id="${this._escape(area.area_id)}" ${selectedAreas.has(area.area_id) ? "checked" : ""}><span>${this._escape(area.name)}</span></label>`).join("");
    this._content.innerHTML = `<fieldset class="area-fieldset"><legend>Areas</legend><div class="area-list">${this._loading ? `<div class="area-message" role="status">Loading areas\u2026</div>` : this._loadError ? `<div class="area-message error" role="alert">${this._escape(this._loadError)}</div>` : areaOptions || `<div class="area-message">No areas available.</div>`}</div></fieldset>${this._loaded && unknownAreas.length ? `<div class="error" role="alert">Unknown area ID${unknownAreas.length > 1 ? "s" : ""}: ${this._escape(unknownAreas.join(", "))}</div>` : ""}<div class="hint">All Home Assistant scenes assigned to checked areas appear automatically.</div><label class="toggle"><input id="names" type="checkbox" ${this._config.show_names ? "checked" : ""}> Show scene names</label><label class="toggle"><input id="titles" type="checkbox" ${this._config.show_title ? "checked" : ""}> Show area names</label>`;
    this._content.querySelectorAll("input[data-area-id]").forEach((input) => input.addEventListener("change", () => {
      const id = input.dataset.areaId;
      const areas2 = input.checked ? [...this._config.areas, id] : this._config.areas.filter((areaId) => areaId !== id);
      this._update({ ...this._config, areas: areas2 });
    }));
    this._content.querySelector("#names")?.addEventListener("change", (event) => this._update({ ...this._config, show_names: event.currentTarget.checked }));
    this._content.querySelector("#titles")?.addEventListener("change", (event) => this._update({ ...this._config, show_title: event.currentTarget.checked }));
  }
  _update(config) {
    const active = this.shadowRoot?.activeElement;
    const activeAreaId = active?.dataset?.areaId;
    const activeId = active?.id;
    this._config = config;
    this._render();
    const restored = activeAreaId ? Array.from(this._content.querySelectorAll("input[data-area-id]")).find((input) => input.dataset.areaId === activeAreaId) : activeId ? this._content.querySelector(`#${activeId}`) : null;
    restored?.focus();
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
};
if (!customElements.get("area-scene-chips-card")) customElements.define("area-scene-chips-card", AreaSceneChipsCard);
if (!customElements.get("area-scene-chips-card-editor")) customElements.define("area-scene-chips-card-editor", AreaSceneChipsCardEditor);
var windowWithCustomCards = window;
windowWithCustomCards.customCards = windowWithCustomCards.customCards || [];
windowWithCustomCards.customCards.push({ type: "area-scene-chips-card", name: "Area Scene Chips Card", description: "Compact scene controls grouped by Home Assistant area.", preview: false });
