# Roomshift

**Rearrange your actual belongings before moving anything heavy.**

Roomshift is a WebXR room planner for one rectangular room and the furniture you already own. Enter measurements, try an arrangement in a tabletop model, inspect it at life size, compare two layouts, and export a measured 2D plan. It is a focused Productivity prototype for the Meta VR Start Developer Competition 2026.

[Try the public prototype](https://roomshift-vr.alx21.chatgpt.site/) · [Watch the simulator demonstration](https://www.youtube.com/watch?v=e3_5WSzcj50)

All room and item measurements come from the user. Photos change the appearance of wall art; they do not establish dimensions.

## Run locally

The project has been checked with Node.js 24.19.0 and pnpm. From this directory:

```powershell
pnpm install
pnpm dev
```

Open **http://localhost:5173/** in a desktop browser. The server binds to loopback, and port 5173 must be free. Use the same host and port when returning to saved work: `localhost` and `127.0.0.1` have separate browser storage.

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

`pnpm test` runs the 17 domain tests. `pnpm build` checks TypeScript and writes the production site to `dist/`. `pnpm preview` serves that build at **http://127.0.0.1:4173/**; the development hand emulator is intentionally absent from production builds.

## Plan a room

1. Enter the room's width, depth, and height in meters. Both layouts use these same room dimensions.
2. Add a sofa, armchair, table, bookshelf, or wall art, up to 12 items in each layout. Enter each item's dimensions in centimeters.
3. Drag furniture in the tabletop browser view. Drag empty space to orbit, scroll to zoom, and use the inspector for exact position and rotation.
4. Select **Life-size** to inspect the arrangement from inside the room. In a headset, this uses a one-to-one meter scale.
5. Enable gaps and overlaps to inspect the selected item. Switch between Layout A and B, or compare them with the other arrangement drawn as a ghost.
6. Export the current layout as a dimensioned SVG plan. Open the SVG in a browser to print it or save a PDF.

The sample room is 5.4 × 4.2 × 2.7 meters with six dimensioned items and two distinct, valid arrangements. Layout names are editable. Copying A to B, or B to A, copies the arrangement while preserving the destination's name. Undo can restore the previous destination.

Undo and redo work for geometry edits, additions, removals, room changes, and copying layouts. Continuous furniture drags create one undo step. Selection and switching the active layout do not create geometry undo steps. Keyboard shortcuts outside text fields are Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y, and Delete/Backspace for the selected item.

## Simulated hands and WebXR

Development uses Meta's Immersive Web SDK 1.0.1 and its Vite development plugin with IWER configured as a Meta Quest 3. Emulator injection is enabled on localhost during development. The app selects simulated hands and exposes **Enter VR** once the runtime reports immersive VR support.

Open the development URL, choose the app's **Enter VR** button, and use the visible simulator controls to move the simulated head and hands. Pinch to grab a belonging in tabletop view. In life-size view, point at a belonging and pinch to move it at a distance. Point and pinch, or touch, the in-room panel to activate controls.

The panel has Plan, Item, Room, and Add pages. It includes view and layout switching, comparison, undo/redo, save/load, copy, export, selection, removal, rotation, and a numeric keypad for exact room and item dimensions and positions. Measurements on the immersive keypad are in centimeters. Art elevation sets the height of the frame's bottom above the floor.

The optional art-photo picker uses the browser interface. Adding a photo is not required for the room-planning flow.

For a physical Quest, host `dist/` over HTTPS and open it in Quest Browser. A headset cannot use the desktop machine's loopback URL. The immersive session requires hand tracking; a browser that cannot provide it can still use the desktop editor. Production deployments need a secure context and any applicable hosting permission policy for WebXR.

Simulator testing exercises interaction and state changes. It does not establish real-headset comfort, hand-tracking reliability, frame rate, thermal behavior, or network performance.

## Measurements and saved work

- The model uses meters internally. X and Z are item-center coordinates measured from the room center; Y is the item's bottom elevation. Positive rotation follows Three.js rotation around Y.
- Collision checks use rotated rectangular footprints and vertical intervals. Touching surfaces are allowed. Art above furniture does not collide with that furniture if their height intervals are separate.
- Wall gaps are signed edge-to-wall distances. A negative gap means the item's measured footprint extends outside the room. The nearest-item reading is the shortest horizontal distance between the two rotated footprints.
- These measurements describe the entered enclosing dimensions. Detailed furniture curves, open shelf space, skirting, door swings, walking routes, and installation tolerances are not modeled.
- Room width and depth accept 2–20 meters, and room height accepts 1.8–5 meters. Item width/depth accept 2–1000 centimeters, and item height accepts 2–500 centimeters.
- Layouts and art photos are saved to this browser origin's `localStorage` under `roomshift.v1`. The editor loads valid saved work on startup and autosaves layout changes. Storage failures appear in the save status.
- Art uploads accept JPG, PNG, or WebP up to 5 MB, decode locally, and are resized to at most 1000 pixels on the longest side. Stored image data is also bounded and checked for a supported raster type.
- Unreadable or newer-version saved data is never replaced by autosave or Retry save. Editing and SVG export still work in memory, but are not an editable backup of that unreadable data. Preserve the original `roomshift.v1` entry before explicitly clearing site storage to start again.
- Clearing browser data removes saved arrangements. Exported SVGs are readable plans, not editable project backups, and they do not embed art photos.

## Implementation

The app is a React 19 and Vite 7 static frontend. `src/model.ts` owns the framework-independent state, validation, collision geometry, history, persistence, and SVG export. `src/model.test.ts` tests those contracts. `src/objects.ts` builds dimensioned furniture, and `src/scene.ts` shares one IWSDK scene and store between browser and immersive modes. `src/spatial-ui.ts` implements hand ray and fingertip controls. `src/App.tsx` provides the browser editor.

There is no application server, paid model API, or automatic reconstruction dependency. The production entry and immersive scene are split, but the IWSDK scene remains a large download: the latest local build reports approximately 234 kB for the entry JavaScript and 6.60 MB for the scene JavaScript before compression, with additional SDK assets. Performance on a headset and production network still needs testing.

## Scope and validation

Version 0.1 focuses on one rectangular room, up to 12 dimensioned belongings, two layouts, manual measurements, hand interactions, and a measured SVG plan. Automatic room reconstruction, measurement from photos, multiple rooms, doors and windows, cloud collaboration, and physical room alignment are outside this version.

Seventeen domain tests pass. Desktop and mobile browser flows and IWER simulated-hand interactions have been exercised. Physical Quest comfort, tracking, and performance remain untested. The demo records actual simulator interactions.

Roomshift is submitted to the [Meta VR Start Developer Competition 2026](https://devpost.com/software/roomshift), Productivity track, New Experience division.

## License

MIT; see [LICENSE](LICENSE). Third-party dependencies retain their own licenses.

Developed by [agammann](https://github.com/agammann).
