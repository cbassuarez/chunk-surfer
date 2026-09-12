# Inventory portraits

Bag and battle preparation use cached ASCII stills. INSPECT opens the same GLB
through one shared, manually rendered AsciiObject instance. Drag or arrow keys
rotate; R restores the authored view. Controller navigation rotates, the previous
tab button resets, and Back leaves inspection. No inventory state is changed.

Ordinary slots create no portrait WebGL context. Inspection redraws only after
input or model load. A cached image is copied into the game's UI canvas on other
frames. Closing or covering inspection stops its rendering; model load failure
keeps the still and back controls. Small combat controls retain printed symbols.

## Models

The existing models were audited before selecting source geometry. The torch,
tuning fork, isolated fountain eyes and open score are extracted from the game.
The player requested better close-inspection versions of the recorder, radio,
coffee, film badge, keys and spanner after reviewing the extracted versions.
Those models now have separately authored inspection geometry. The bent rig is
also authored for inspection. Game-world asset packs and placements are untouched.

Physical references inform construction and proportions; these are unbranded game
objects, not exact product replicas. No reference photographs are redistributed.

- Recorder: [Tascam DR-100MKIII](https://www.tascam.eu/en/dr-100mkiii.html), with paired microphone capsules, transport controls, jog wheel and XLR sockets; separate closed-back headphones.
- Radio: [Motorola GP380](https://www.motorolasolutions.com/en_xu/products/two-way-radios-licensed/analog-business-radios/discontinued/gp380.html), consistent with the existing radio illustration's display, keypad and long antenna.
- Coffee: `public/story-art/booth.coffee.form.jpg`; tapered open paper cup, rolled rim, folded seam and recessed coffee surface.
- Film badge: [ORAU's ORNL film-badge collection](https://www.orau.org/health-physics-museum/collection/dosimeters/film/ornl-1950s.html); passive filter holder, film-packet slots and sprung clip.
- Keys: milled cylinder-key profiles, split rings and the existing two-notch C-17 / three-notch master tag distinction.
- Spanner: [Stanley six-inch adjustable wrench](https://www.stanleytools.com/product/87-367/6-adjustable-wrench); forged body, separate sliding jaw, worm screw and hanging hole. Blue enamel preserves the existing prop's distinguishing colour.
- Rig: `public/story-art/circuit-bent-interface.jpg`; converter chassis, paired meters, toggle bank, rotary controls and a visible added return lead.

`public/assets/items/models.json` records extraction sources and hashes. Portable
searchlight geometry retains the Poly Haven CC0 credits from the acquisition pack.
AsciiObject's license ships in `public/licenses/ascii-object.txt`.

## Rebuilding and checking

1. `node scripts/build-item-models.mjs`
2. Start Vite, then `GAME_URL=http://127.0.0.1:5213 node tools/chunk_surfer/build-item-portraits.mjs`
3. `node --test test/item-portraits.spec.mjs`
4. `GAME_URL=http://127.0.0.1:5213 node tools/chunk_surfer/verify-item-portraits.mjs`
5. `GAME_URL=http://127.0.0.1:5213 node tools/chunk_surfer/verify-battle-preparation.mjs`

The baking tool uses the production renderer and writes 192 / 512 WebP stills.
Review `artifacts/item-portraits/contact-sheet.png` and the actual game captures.
Browser checks use a disposable profile. They do not establish native Tauri GPU,
native controller hardware, or audio-perception acceptance.
