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
```

The `areas` value contains Home Assistant area IDs. The visual editor offers a multi-select of Home Assistant scenes; selecting a scene includes its area, and the card then discovers all Home Assistant scenes in that area, including scenes added later. Scenes without a direct area assignment and scenes provided by other integrations are omitted.

Names are hidden by default. Scene names remain available as tooltips and accessible labels. Unavailable scenes cannot be activated. Tapping an available scene calls `scene.turn_on`.

## Build from source

The TypeScript source is in `src/area-scene-chips-card.ts`. The checked-in `area-scene-chips-card.js` is the standalone dashboard resource installed by HACS.

```sh
npm install
npm run build
```

## License

MIT
