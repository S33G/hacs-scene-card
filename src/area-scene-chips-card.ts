/* Compact Home Assistant area scene card. */
interface SceneState {
  state: string;
  attributes: { friendly_name?: string; icon?: string; last_activated?: string; last_triggered?: string };
}
interface RegistryArea { area_id: string; name: string }
interface RegistryEntity { entity_id: string; platform: string; area_id?: string; name?: string; icon?: string }
interface HomeAssistant {
  states: Record<string, SceneState>;
  callWS<T = any>(message: { type: string }): Promise<T>;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  connection: { subscribeEvents(callback: () => void, eventType: string): Promise<() => void> };
}

class AreaSceneChipsCard extends HTMLElement {
  private _config?: { areas: string[]; show_names: boolean; show_title: boolean };
  private _hass?: HomeAssistant;
  private _areas: RegistryArea[] = [];
  private _entities: RegistryEntity[] = [];
  private _unsubscribers: Array<() => void> = [];
  private _registryReady = false;
  private _registryError = "";
  private _refreshToken = 0;
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = undefined;
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

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._registryReady && this._config) this._loadRegistries();
    this._render();
  }

  get hass(): HomeAssistant | undefined { return this._hass; }

  connectedCallback() {
    if (this._hass && this._config) this._subscribeRegistries();
  }

  disconnectedCallback() {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._unsubscribers = [];
    this._refreshToken++;
  }

  getCardSize() { return Math.max(1, (this._config?.areas?.length || 1) * 2); }
  getGridOptions() { return { rows: "auto", columns: 12, min_rows: 1 }; }
  getConfigElement() { return document.createElement("area-scene-chips-card-editor"); }
  static getStubConfig() { return { type: "custom:area-scene-chips-card", areas: [], show_names: false, show_title: true }; }

  async _loadRegistries() {
    if (!this._hass?.callWS || !this._config) return;
    const token = ++this._refreshToken;
    try {
      const [areas, entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
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
      this._hass.connection.subscribeEvents(() => this._loadRegistries(), eventType)
        .then((unsubscribe) => {
          if (!this.isConnected) unsubscribe();
          else this._unsubscribers.push(unsubscribe);
        })
        .catch((error) => console.warn(`Area Scene Chips Card: cannot subscribe to ${eventType}`, error));
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
      const valid = group.scenes
        .map((scene) => ({ ...scene, timestamp: Date.parse(scene.state.attributes?.last_activated ?? scene.state.attributes?.last_triggered ?? "") }))
        .filter((scene) => Number.isFinite(scene.timestamp));
      valid.sort((a, b) => b.timestamp - a.timestamp || a.entry.entity_id.localeCompare(b.entry.entity_id));
      group.latest = valid[0]?.entry.entity_id;
    }
    return groups.filter((group) => group.scenes.length);
  }

  async _activate(entityId) {
    const state = this._hass?.states?.[entityId];
    if (!state || ["unavailable", "unknown"].includes(state.state)) return;
    try { await this._hass.callService("scene", "turn_on", { entity_id: entityId }); }
    catch (error) { console.error(`Area Scene Chips Card: could not activate ${entityId}`, error); }
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const groups = this._sceneGroups();
    const message = this._registryError || (!this._registryReady ? "Loading scenes…" : "");
    this.shadowRoot.innerHTML = `<style>
      :host { display:block; }
      ha-card { background: transparent; box-shadow:none; border:0; padding: 4px 0; }
      .error { color: var(--error-color, #db4437); padding: 8px; }
      .loading { color: var(--secondary-text-color); padding: 8px; }
      .area { margin: 0 0 8px; }
      .area:last-child { margin-bottom:0; }
      .label { color:var(--secondary-text-color); font-size:var(--ha-font-size-s, 12px); margin:0 0 3px 4px; }
      .chips { display:flex; flex-wrap:wrap; align-items:center; gap:4px; }
      button { appearance:none; border:0; border-radius:999px; background:var(--secondary-background-color, #f4f4f4); color:var(--primary-text-color); font:inherit; min-height:40px; min-width:40px; padding:4px 10px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; }
      button:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
      button[disabled] { opacity:.55; cursor:not-allowed; }
      button.active { color:var(--state-active-color, var(--primary-color)); }
      ha-icon { --mdc-icon-size:20px; }
      .name { font-size:var(--ha-font-size-s, 12px); white-space:nowrap; }
    </style><ha-card>${message ? `<div class="${this._registryError ? "error" : "loading"}" role="${this._registryError ? "alert" : "status"}">${this._escape(message)}</div>` : groups.map((group) => {
      const chips = group.scenes.map(({ entry, state }) => {
        const id = entry.entity_id;
        const name = state.attributes?.friendly_name || entry.name || id;
        const unavailable = ["unavailable", "unknown"].includes(state.state);
        const icon = entry.icon || state.attributes?.icon || "mdi:palette";
        const active = group.latest === id;
        return `<button type="button" data-entity="${this._escape(id)}" title="${this._escape(name)}" aria-label="${this._escape(name)}${active ? ", last activated" : ""}${unavailable ? ", unavailable" : ""}" aria-pressed="${active}" ${unavailable ? "disabled aria-disabled=\"true\"" : ""} class="${active ? "active" : ""}"><ha-icon icon="${this._escape(icon)}"></ha-icon>${this._config.show_names ? `<span class="name">${this._escape(name)}</span>` : ""}</button>`;
      }).join("");
      return `<section class="area" aria-label="${this._escape(group.area.name)}" title="${this._escape(group.area.name)}">${this._config.show_title ? `<div class="label">${this._escape(group.area.name)}</div>` : ""}<div class="chips">${chips}</div></section>`;
    }).join("")}</ha-card>`;
    this.shadowRoot.querySelectorAll("button[data-entity]").forEach((button) => button.addEventListener("click", () => this._activate(button.dataset.entity)));
  }

  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
}

class AreaSceneChipsCardEditor extends HTMLElement {
  private _config: { areas: string[]; show_names: boolean; show_title: boolean } = { areas: [], show_names: false, show_title: true };
  private _hass?: HomeAssistant;
  private _areas: RegistryArea[] = [];
  private _entities: RegistryEntity[] = [];
  private _loading = false;
  private _loaded = false;
  private _unsubscribers: Array<() => void> = [];
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { areas: [], show_names: false, show_title: true };
    this._areas = [];
    this._entities = [];
  }

  setConfig(config) { this._config = { areas: [], show_names: false, show_title: true, ...config }; this._render(); }
  set hass(hass: HomeAssistant) { this._hass = hass; if (!this._loaded) this._load(); this._render(); }

  connectedCallback() {
    if (!this._hass?.connection?.subscribeEvents || this._unsubscribers.length) return;
    for (const eventType of ["entity_registry_updated", "area_registry_updated"]) {
      this._hass.connection.subscribeEvents(() => { this._loaded = false; this._load(); }, eventType)
        .then((unsubscribe) => this.isConnected ? this._unsubscribers.push(unsubscribe) : unsubscribe())
        .catch((error) => console.warn(`Area Scene Chips Card editor: cannot subscribe to ${eventType}`, error));
    }
  }

  disconnectedCallback() { this._unsubscribers.forEach((unsubscribe) => unsubscribe()); this._unsubscribers = []; }

  async _load() {
    if (!this._hass?.callWS || this._loading || this._loaded) return;
    this._loading = true;
    try {
      [this._areas, this._entities] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/entity_registry/list" }),
      ]);
      this._loaded = true;
    } catch (error) { console.error("Area Scene Chips Card editor: registry request failed", error); }
    this._loading = false;
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;
    const scenes = this._entities.filter((entry) => entry.entity_id?.startsWith("scene.") && entry.platform === "homeassistant")
      .map((entry) => ({ entry, state: this._hass?.states?.[entry.entity_id] }))
      .filter(({ entry, state }) => entry.area_id && state)
      .sort((a, b) => (a.state.attributes?.friendly_name || a.entry.entity_id).localeCompare(b.state.attributes?.friendly_name || b.entry.entity_id));
    const selectedAreas = new Set(this._config.areas || []);
    this.shadowRoot.innerHTML = `<style>
      :host { display:block; } label { display:block; margin:12px 0 4px; color:var(--primary-text-color); }
      select { box-sizing:border-box; width:100%; min-height:160px; padding:8px; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:4px; }
      .hint { color:var(--secondary-text-color); font-size:var(--ha-font-size-s, 12px); margin-top:5px; }
      .toggle { display:flex; align-items:center; gap:10px; margin-top:12px; }
    </style><label for="scenes">Scenes</label><select id="scenes" multiple aria-label="Select scenes; all scenes in their areas will appear">${scenes.length ? scenes.map(({ entry, state }) => {
      const name = state.attributes?.friendly_name || entry.entity_id;
      const area = this._areas.find((item) => item.area_id === entry.area_id)?.name || entry.area_id;
      return `<option value="${this._escape(entry.entity_id)}" ${selectedAreas.has(entry.area_id) ? "selected" : ""}>${this._escape(name)} — ${this._escape(area)}</option>`;
    }).join("") : `<option disabled>No Home Assistant scenes with area assignments were found.</option>`}</select><div class="hint">Choose scenes by name and area. The card shows all Home Assistant scenes in the selected areas, including scenes added later.</div><label class="toggle"><input id="names" type="checkbox" ${this._config.show_names ? "checked" : ""}> Show scene names</label><label class="toggle"><input id="titles" type="checkbox" ${this._config.show_title ? "checked" : ""}> Show area names</label>`;
    this.shadowRoot.querySelector("#scenes")?.addEventListener("change", (event) => {
      const areaIds = [...new Set([...event.target.selectedOptions].map((option) => this._entities.find((entry) => entry.entity_id === option.value)?.area_id).filter(Boolean))];
      this._update({ ...this._config, areas: areaIds });
    });
    this.shadowRoot.querySelector("#names")?.addEventListener("change", (event) => this._update({ ...this._config, show_names: event.target.checked }));
    this.shadowRoot.querySelector("#titles")?.addEventListener("change", (event) => this._update({ ...this._config, show_title: event.target.checked }));
  }

  _update(config) { this._config = config; this._render(); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true })); }
  _escape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
}

if (!customElements.get("area-scene-chips-card")) customElements.define("area-scene-chips-card", AreaSceneChipsCard);
if (!customElements.get("area-scene-chips-card-editor")) customElements.define("area-scene-chips-card-editor", AreaSceneChipsCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "area-scene-chips-card", name: "Area Scene Chips Card", description: "Compact scene controls grouped by Home Assistant area.", preview: false });
