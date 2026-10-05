# Area Scene Chips Card

A compact Lovelace card that groups Home Assistant-created scenes by area. The most recently activated scene in each area gets a theme-aware highlight. This records last activation; it does not indicate whether devices still match the scene.

## Install with HACS

1. In HACS, open **Frontend** and select the three-dot menu, then **Custom repositories**.
2. Add `https://github.com/s33g/hacs-scene-card` with category **Dashboard**.
3. Find **Area Scene Chips Card** in HACS and install it. Reload the browser when prompted.
4. Add the card from the dashboard visual editor, or add it manually:

```yaml
type: custom:area-scene-chips-card
areas:
  - studio
  - living_room
show_names: false
show_title: true
```

The `areas` value contains Home Assistant area IDs. The visual editor lists available areas as checkboxes. The card discovers all Home Assistant scenes in checked areas, including scenes added later. Scenes without a direct area assignment and scenes provided by other integrations are omitted.

Scene names are hidden by default; their names remain available as tooltips and accessible labels. Area names are shown by default and can be hidden with `show_title: false`; hidden area names remain available as row tooltips and accessible labels. Unavailable scenes cannot be activated. Tapping an available scene calls `scene.turn_on`.

The visual editor also provides toggles for scene names and area names. Newly checked areas are added to the end of the display order; edit YAML to set a specific order.

## Build from source

The TypeScript source is in `src/area-scene-chips-card.ts`, and styles are in `src/hacs-scene-card.css`. The build places both installable files in `dist/`. HACS installs the JavaScript and its companion CSS together; the JavaScript loads the stylesheet from its own directory. The JavaScript filename matches the GitHub repository name as required for HACS Dashboard plugins.

```sh
npm install
npm run build
```

## License

MIT
