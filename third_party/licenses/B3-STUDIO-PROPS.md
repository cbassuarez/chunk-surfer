# B3 studio props

The dedicated `public/assets/b3-studio-props.glb` uses selected structural parts
from four publicly downloadable models published by 3D Assets / 3DAssets.dev.
The creator marks each asset-specific page CC0 1.0 Universal and
reports AI-assisted procedural modeling. We preserve that provenance rather
than describing these as scanned or manufacturer-supplied equipment.

Original files, their stable download URLs, SHA-256 hashes and asset-specific
source URLs are in `assets/third-party/b3-studio/sources.json`. They remain
vendored unchanged so the adapted pack can be reproduced without a network.

- Mixing Console, asset 33804: only the timber shell is retained. Original
  controls, static channel caps and oversized display windows are excluded.
- Desk Chair, asset 33809: only the five-caster base is retained. The original
  centre post protruded through its seat; seat, back, armrests and pedestal
  have been rebuilt at coherent working heights.
- Outboard Rack on Wheels, asset 33807: its frame, casters and timber top are
  adapted. Front equipment, sockets, mechanical meters and controls are new.
- Patch Bay Panel, asset 33810: selected frame and label-strip geometry is
  retained. The original solid knob-like socket parts are excluded; new empty
  annular jack wells distinguish a disconnected jackfield from plugged gear.

Licence: <https://creativecommons.org/publicdomain/zero/1.0/>

`tools/chunk_surfer/build-b3-studio-props.mjs` dequantizes the source's normalized
integer attributes before baking its hierarchy, then applies physical sizing
and B3's palette. It adds the console's raked channel bays, separate animated
caps, engraved tape-strip legends, mechanical meter bridge, master controls,
chair upholstery and the two timber/acoustic window surrounds. The original
B3 fader origins/travel are preserved. All materials remain opaque and
non-emissive; glass optics are owned by the existing game shader.

The resulting pack includes its source attributions and modification record in
`public/assets/b3-studio-props.credits.json`. CPU geometry previews and focused
shape tests are not proof of native visual quality, performance or player
understanding.
