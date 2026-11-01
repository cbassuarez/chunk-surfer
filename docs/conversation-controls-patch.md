# Conversation controls: VFD choices and metal bezel rails

## Design

Changing conversation responses belong to the electronic display. Fixed
instrument controls belong to the metal surround. The recorder's existing
REC / STOP / TAKES bank is the spacing reference.

This patch removes the physical numbered caps from the shared transcript
choice renderer. Numbers, the selected cursor, and the archive diamond now
render on the same VFD plane and baseline as the response. Selection, spent
responses, archive emphasis, shortcuts, and response ordering keep their
existing meaning. The radio's electronic reply captions use the same material
rule while retaining the radio's physical controls and hold-to-transmit action.

Recorder guide choices already use the VFD. Their normal rendering is retained;
a scrolled continuation now regains its response number and selection marker.
Long choice banks reserve a consistent gutter so wrapping cannot discard a
character when the list grows above 99 responses.

## Physical control placement

The setup handoff's OPEN FIELD CASE control and preparation's BACK / CONFIRM
SHIFT controls move into an explicitly reserved bottom metal rail. Their
horizontal positions, widths, heights, labels, and actions stay the same.
Pointer targets use the exact painted rectangles. Save status remains in the
VFD above the rail, including the compact seven-rule custom-shift layout.

The Inventory, Sheets, and Skills field-case selectors use a corresponding top
rail. Only their caps move vertically: electronic count readouts and the
existing content layout retain their coordinates. Map and Journal already
have metal banks. A sheet reader now retains a metal selector strip with
passive etched breadcrumb/close legends. The floating tutorial CONTINUE action
becomes an electronic VFD choice and keeps its existing action region.

`machinePanelBezelRail()` is opt-in. It budgets for the native well rim's
7 CSS-pixel extension, then leaves 0.6 rows between the rim and the control.
The bottom rail also retains a 0.9-row inset from the panel edge. At the normal
20-pixel row size this gives 12 pixels beyond the rim and 18 pixels below the
control. At the tested 150% UI scale these become 18 and 27 pixels.

`bodyWithinAperture` is a separate opt-in setting. Existing custom-aperture
callers keep their virtual body geometry unless they request content fitting.

## Apply

Run from the repository root, with the downloaded patch in that directory:

```sh
git apply --check chunk-surfer-conversation-controls.patch
git apply chunk-surfer-conversation-controls.patch
```

The patch is based on the supplied 2026-10-31 source plus the earlier
counter/cabin-look/microphone patch. It contains the changes for this request;
it does not bundle that earlier patch again. The standard preflight command
checks compatibility with your current checkout before changing files.

## Focused verification

The patch includes dependency-free Node tests for the changed rendering and
interaction contracts. Run them from the repository root:

```sh
node --experimental-vm-modules --test \
  test/conversation-vfd-choices.test.mjs \
  test/conversation-bezel-controls.test.mjs \
  test/field-case-bezel-controls.test.mjs
```

The tests exercise production layout and scene code with platform/drawing
sinks isolated. They cover choice identity while scrolling, normal recorder
formatting, long-list wrapping, radio selection and hold semantics, native
well clearance, matching cap/hit rectangles, preparation save states, and
field-case navigation/continuation behavior.

Actual Canvas renders were also compared at 1280 x 800 / 100% UI scale and
960 x 600 / 150% UI scale. The existing recorder transport renders identically.
The earlier VFD consent and microphone recovery tests were rerun to check the
shared panel changes.

The supplied bundle contains source only, so a full packaged game build was
not available. The visual checks use the production VFD/material renderers;
missing Hardware Sans assets fall back to Liberation Sans for passive print,
and missing world/document assets use neutral or production fallback content.

For a final in-game smoke check, open a wrapped conversation, scroll through
its responses, then check a recorder guide, radio contact, preparation, the
field-case selectors, a sheet reader, and the tutorial continuation. Confirm
keyboard/controller selection and pointer actions at your preferred UI scale.
