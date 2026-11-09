import {B3_CONSOLE_REFERENCE} from './b3-console-layout.js';
import B3_STUDIO_SOURCE_MANIFEST from '../../assets/third-party/b3-studio/sources.json' with {type:'json'};

// B3-only replacement pack. Prop IDs and collision remain owned by the room.
export const B3_STUDIO_PROPS_ASSET='assets/b3-studio-props.glb';
export const B3_STUDIO_PROPS_MESHES=Object.freeze({
  b3_mixing_console:{w:2.30,d:.96,h:1.31,blocks:true},
  b3_fader_cap:{w:.055,d:.036,h:.026,blocks:false},
  b3_engineer_chair:{w:.66,d:.68,h:1.16,blocks:false},
  b3_patchbay:{w:1.18,d:.36,h:1.74,blocks:true,mount:'floor'},
  // Retain the original equipment-rack collision envelope around its controls.
  b3_outboard_rack:{w:.72,d:.70,h:1.60,blocks:true},
  b3_window_surround:{w:1.02,d:5.32,h:3.22,blocks:false},
  b3_window_south_surround:{w:1.02,d:3.32,h:3.22,blocks:false},
});
export const B3_STUDIO_WINDOW_PLACEMENT=Object.freeze({x:18.5,z:10.5,yaw:0,
  // Geometry is floor-relative to the unchanged -4m basement.
  aperture:{x:18.5,z0:8,z1:13,bottom:-2.95,top:-.95},
});

// The small attribution manifest contains metadata only, never model bytes or
// builder dependencies. Credits follow the same public originals as the pack.
export function b3StudioPropCreditLines(){
  const sources=B3_STUDIO_SOURCE_MANIFEST.sources.filter(source=>source.id!=='console-timber');
  return[
    ...new Set(sources.map(source=>`${source.creator} (${source.licence})`)),
    'Console: project-authored adaptation after the Soundcraft Series 600 (documented in 1985). Existing furniture dimensions and larger controls are game adaptations.',
    B3_CONSOLE_REFERENCE.manualUrl,B3_CONSOLE_REFERENCE.datedManufacturerAdUrl,
    'Public source parts: five-caster chair base, outboard frame and patch-panel supports.',
    'Creator reports AI-assisted procedural modeling.',
    ...sources.map(source=>source.sourceUrl),
    ...new Set(sources.map(source=>source.licenceUrl)),
    'Adapted: physical scale and orientation; new channel controls, separate moving faders, mechanical meters, chair upholstery, empty jack wells and acoustic window surrounds.',
  ];
}
