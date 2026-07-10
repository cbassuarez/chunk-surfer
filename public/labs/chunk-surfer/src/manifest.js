// ── Manifest (worlds → samples) ── extracted verbatim from index.html ──────
// Add worlds here and the engine auto-builds World > Biome > Sample hierarchy.
// { id, label, files: [{label, url}, ...] }. The engine reads worldId off each
// sample and routes audio + topology through the World > Biome > Sample stack.
export const TUB_ULTRACHUNK_FILES = [
  'S0001.wav','S0004.wav','S0006.wav','S0008.wav','S0009.wav','S0012.wav',
  'S0014.wav','S0016.wav','S0017.wav','S0020.wav','S0022.wav','S0024.wav',
  'S0025.wav','S0028.wav','S0030.wav','S0032.wav','S0033.wav','S0036.wav',
  'S0038.wav','S0040.wav','S0041.wav','S0044.wav','S0046.wav','S0048.wav'
];
export const AMPLIFICATIONS_FILES = Array.from({length: 64}, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return { label: `amp-${n}`, url: `/audio/amplifications/amp_${n}.mp3` };
});
export const SOUNDNOISEMUSIC_FILES = Array.from({length: 64}, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return { label: `snm-${n}`, url: `/audio/soundnoisemusic/snm_${n}.mp3` };
});
export const LUX_NOVA_FILES = Array.from({length: 64}, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return { label: `lux-${n}`, url: `/audio/lux_nova/lux_${n}.mp3` };
});

export const MANIFEST = {
  worlds: [
    {
      id: 'main_b3',
      label: 'main b3',
      files: Array.from({length: 64}, (_, i) => {
        const n = String(i+1).padStart(2,'0');
        return { label: n, url: `/audio/main_b3/main_b3_${n}.mp3` };
      })
    },
    {
      id: 'the_tub',
      label: 'THE TUB',
      files: [
        ...Array.from({length: 20}, (_, i) => {
          const n = String(i).padStart(2, '0');
          const names = [
            'xither_forge','wetair_veil','trillion_hull','acharia_arc','xemf_mass',
            'xither_glass','wetair_core','trillion_air','acharia_depth','xemf_sheen',
            'xither_floor','wetair_shine','trillion_low','acharia_spark','xemf_grain',
            'xither_lift','wetair_drift','trillion_fog','acharia_haze','xemf_bloom'
          ];
          return {
            label: `tub-${n}`,
            url: `/audio/the_tub/${n}_${names[i]}.wav`
          };
        }),
        ...TUB_ULTRACHUNK_FILES.map((name) => ({
          label: `tub-${name.replace('.wav', '').toLowerCase()}`,
          url: `/audio/the_tub/${name}`
        }))
      ]
    },
    {
      id: 'amplifications',
      label: 'AMPLIFICATIONS',
      files: AMPLIFICATIONS_FILES
    },
    {
      id: 'soundnoisemusic',
      label: 'soundnoisemusic',
      files: SOUNDNOISEMUSIC_FILES
    },
    {
      id: 'lux_nova',
      label: 'lux_nova',
      files: LUX_NOVA_FILES
    }
  ]
};

export const PIECE_CATALOG = {
  main_b3: {
    title: 'main_b3',
    year: '2026',
    description: 'A field of resonant fragments mapped into shifting biomes. Walking changes perspective, and perspective changes what you hear.'
  },
  the_tub: {
    title: 'THE TUB',
    year: '2026',
    description: 'A harness-derived landscape of wet-air, trillion, acharia, xemf, and ultrachunk materials: procedural, bounded, and performative in its constraints.'
  },
  amplifications: {
    title: 'AMPLIFICATIONS',
    year: '2026',
    description: 'Movement I (MARIMBAideefixe) exploded into 64 stratified clips: transient cuts, silence seams, and long resonant holds mapped as a walkable amplified field.'
  },
  soundnoisemusic: {
    title: 'String Quartet No. 2 \"soundnoisemusic\"',
    year: '—',
    description: 'Quartet-dense segmentation of String Quartet No. 2: shorter cuts, frequent transient pivots, and tactile micro-events distributed across the entire movement.'
  },
  lux_nova: {
    title: 'Organum quadruplum \"lux nova\"',
    year: '—',
    description: 'Longer stackable fragments tuned for monophonic-friendly layering: sustained fields, silence-edge seams, and wide-form temporal spread.'
  }
};

// Flatten manifest into the load queue + remember each world's file indices.
export const files = [];
export const worldsConfig = MANIFEST.worlds.map(w => {
  const fileIdxs = w.files.map(f => {
    const i = files.length;
    files.push({ idx:i, label:f.label, url:f.url, worldId:w.id,
                 status:'queued', recv:0, total:0, buffer:null, analysis:null });
    return i;
  });
  return { id:w.id, label:w.label, fileIdxs };
});

export const SAMPLE_COUNT = files.length;
