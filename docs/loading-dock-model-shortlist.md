# Loading Dock model shortlist

Status: **approval required — nothing new has been downloaded or imported.**  
Reviewed: 2026-07-25

The selection rule is contour first. A candidate has to remain identifiable as a black silhouette from eight metres away; handles, latches, wheels, flanges, feet, transport locks, and cable tails must be geometry rather than painted detail. The source-hosted preview links below are the visual review surface, so no third-party renders are copied into the repository.

The recommended combination targets **39,000 triangles**, leaving 6,000 triangles of the 45,000-triangle pack ceiling for authored locks, stands, collision proxies, the disconnected tail, and the intact/spent swap. It also replaces the two weakest current proxies—the worklight and cable reel—with profiles that read across the dock.

## Recommended pass

| Category | Candidate | Why it reads | Intake target | License / attribution | Download |
| --- | --- | --- | ---: | --- | --- |
| Hand truck | [Poly Haven Hand Truck — preview and source](https://polyhaven.com/a/hand_truck) | Curved handles, deep toe plate, large wheels; unmistakable warehouse profile. | 6,500 tris, 1K | CC0, none required; Mutanzom3D | Not downloaded |
| Crates | [Poly Haven Plastic Crate 02 — preview and source](https://polyhaven.com/a/plastic_crate_02) | Vented wall, stacking ribs, and cutout handles survive repetition and backlight. | 3,200 tris, 1K | CC0, none required; Fabi_G | Not downloaded |
| Cable reel | [YodhaGameStudio Cable Drum — interactive preview](https://sketchfab.com/3d-models/cable-drum-366b9959f9d54cfb9ceb8a9d06a53b28) | Clean flange profile; best base for the authored portable stand, handle, and ratchet the probe needs. | 4,800 tris, 1K | CC BY 4.0; credit required | Not downloaded |
| Road case | [Sousinho Transport Case — interactive preview](https://sketchfab.com/3d-models/transport-case-812e6f81a90e4e1a9d28ae3831f2b44b) | Butterfly hardware and lid/corner silhouette support a close acoustic inspection. | 4,800 tris, 2K | CC BY 4.0; credit required | Not downloaded |
| Worklight | [HippoStance Work Light — interactive preview](https://sketchfab.com/3d-models/work-light-278dd26f90d544a8941d347bef0ebf40) | The feet and carrying handle are much stronger than the retained searchlight's low contour. | 6,200 tris, 1K | CC BY 4.0; credit required | Not downloaded |
| Chandelier + frame | [Poly Haven Chandelier 03](https://polyhaven.com/a/Chandelier_03) + [modular industrial pipes](https://polyhaven.com/a/modular_industrial_pipes_01) | Strong shade clusters and open centre let the reflection and grouped rupture remain legible; pipes become a purpose-built wheeled freight cage. | 13,500 tris, 2K | CC0, none required; Kirill Sannikov and Jorge Camacho | Not downloaded |

## Alternates

| Category | Candidate | Use / rejection question | Source size | License / attribution | Download |
| --- | --- | --- | ---: | --- | --- |
| Hand truck | [HippoStance Hand Truck](https://sketchfab.com/3d-models/hand-truck-f539455450ca40df8843a602aafbda91) | Heavier, older chassis. Prefer it only if its extra structure survives a 6.5K-triangle reduction. | 24.1K tris | CC BY 4.0; credit required | Not downloaded |
| Crates | [Denisse Rodriguez Plastic Crate](https://sketchfab.com/3d-models/plastic-crate-5f7103bfb5974eab85bb1a4ab8a8595e) | Better nearest hero crate, but expensive for a repeated object. | 19.1K tris | CC BY 4.0; credit required | Not downloaded |
| Cable reel | [Aparicio Silva Wooden Cable Drum](https://sketchfab.com/3d-models/wooden-cable-drum-90120b2f0348407b8071577e85766827) | Broader silhouette; needs an authored stand and may read as construction equipment rather than theatre freight. | 11.6K tris | CC BY 4.0; credit required | Not downloaded |
| Road case | [iradmir777 Case OBJ](https://sketchfab.com/3d-models/case-obj-a0241d73816242d0b0de4469dfa2ad07) | Contour reference only unless latch and caster assemblies survive aggressive decimation. | 390.3K tris | CC BY 4.0; credit required | Not downloaded |
| Worklight | [Poly Haven Portable Searchlight](https://polyhaven.com/a/portable_searchlight) | Already in the approved acquisition pack, but its profile is the current low-contour problem. Retain only if a material/scale pass is enough. | 18.8K source / 6.9K processed | CC0, none required | Existing approved pack |
| Chandelier + frame | [Poly Haven Chandelier 01](https://polyhaven.com/a/Chandelier_01) + [modular metal gutter](https://polyhaven.com/a/modular_metal_gutter) | Broader six-shade alternate. Reject if the shades hide bulb-by-bulb rupture or the square cage reads too domestic. | 43K source | CC0, none required; Kirill Sannikov and Maxim Domnin | Not downloaded |

## Intake contract after approval

- Build a separate `public/assets/conservatory-dock.glb`, at most 8 MB and 45,000 triangles.
- Use metre scale, Y-up, floor-centred origins, OPAQUE/MASK materials, 2K hero textures, and 1K repeated textures.
- Reject animation, skinning, sparse accessors, required extensions, unverifiable licenses, and detailed mesh collision.
- Author simple collision primitives and keep intact chandelier, spent chandelier, reflection, and literal HUSH meshes separately addressable.
- Record source URL, author, license, download date, original hash, processed hash, and every transformation in the provenance manifest.

The machine-readable review record is [`tools/chunk_surfer/loading-dock-model-shortlist.json`](../tools/chunk_surfer/loading-dock-model-shortlist.json).
