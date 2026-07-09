# IBCL V2 Modular Development Build

This folder is the modular development version of **IBCL V2**. It preserves the current standalone dashboard behavior while splitting the file into easier-to-edit pieces.

## Files

```text
IBCL_v2_modular/
├── index.html                  # Main HTML shell
├── css/
│   └── ibcl.css                # All IBCL styling and dashboard/card CSS
├── js/
│   ├── app.js                  # App state, math, events, translations, exports, graph logic
│   └── desktop-layout.js       # Drag/resize cards, presets, personalization, hints
├── tools/
│   └── build_singlefile.py     # Re-packs modular files into one deployable HTML file
└── dist/
    └── IBCL_v2_standalone_source.html
```

## Usage

Open `index.html` in a modern browser for development.

The app is still fully client-side. Events, settings, layouts, language, graph history, and preferences are stored in browser `localStorage`.

## Build a one-page release

From this folder:

```bash
python tools/build_singlefile.py
```

The packed file will be written to:

```text
dist/IBCL_v2_singlefile.html
```

## Current preserved features

- IBCL V2 dashboard workspace
- draggable/resizable/minimizable cards
- bring-card-forward behavior
- saved layouts and layout presets
- dark/light theme
- English, Spanish, and Greek UI language support
- hints toggle
- personalization badge
- PID, DD, Pre-Sort, and CrossBelt area selection
- active loss and total loss tracking
- live auto-update
- synced start-time option
- event log with edit/delete/clear
- export: copy, CSV, JSON, Markdown
- projection graph with history samples
- shift presets for Days/Nights, OT extension, and sample interval controls

## Notes

This modular build does not add new features. It is a development split of the current one-page app so future changes can be made without editing a single massive HTML file.
