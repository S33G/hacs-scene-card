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

The `areas` value contains Home Assistant area IDs. The visual editor offers a multi-select of Home Assistant scenes; selecting a scene includes its area, and the card then discovers all Home Assistant scenes in that area, including scenes added later. Scenes without a direct area assignment and scenes provided by other integrations are omitted.

Scene names are hidden by default; their names remain available as tooltips and accessible labels. Area names are shown by default and can be hidden with `show_title: false`; hidden area names remain available as row tooltips and accessible labels. Unavailable scenes cannot be activated. Tapping an available scene calls `scene.turn_on`.

The visual editor provides a multi-select of scenes, plus toggles for scene names and area names. Selecting a scene includes its area, and all Home Assistant scenes in that area are displayed.

## Build from source

The TypeScript source is in `src/area-scene-chips-card.ts`. The checked-in `hacs-scene-card.js` is the standalone dashboard resource installed by HACS. Its filename matches the GitHub repository name as required for HACS Dashboard plugins.

```sh
npm install
npm run build
```

## License

MIT
