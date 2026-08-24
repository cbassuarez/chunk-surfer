// Stable gameplay footprints for the authored vegetation pack. These are
// deliberately conservative: rendering may swap silhouettes and LODs, while
// navigation and interaction continue to use the same authored geometry.

const freeze = (value) => Object.freeze(value);

export const VEGETATION_MESHES = freeze({
  yard_hedge_dense:freeze({w:2.0,d:11.6,h:2.05,blocks:false}),
  yard_hedge_corner:freeze({w:2.0,d:11.6,h:2.35,blocks:false}),
  opening_park_laurel:freeze({w:3.2,d:2.8,h:2.1,blocks:false}),
  opening_street_tree_small_b:freeze({w:4.8,d:4.8,h:4.6,blocks:false}),
  opening_street_tree_small_c:freeze({w:4.8,d:4.8,h:4.6,blocks:false}),
  vegetation_nettle_cluster:freeze({w:1.6,d:1.4,h:1.0,blocks:false}),
  vegetation_weed_cluster:freeze({w:1.5,d:1.3,h:.8,blocks:false}),
  vegetation_grass_edge:freeze({w:2.9,d:.9,h:.45,blocks:false}),
  vegetation_leaf_scatter:freeze({w:2.9,d:1.4,h:.12,blocks:false}),
  academic_dead_tree_b:freeze({w:2.8,d:1.2,h:4.0,blocks:false}),
});

export const VEGETATION_FALLBACKS = freeze({
  yard_hedge_dense:'yard_hedge_run',
  yard_hedge_corner:'yard_hedge_run',
  opening_park_laurel:'yard_hedge_run',
  opening_street_tree_small_b:'opening_street_tree_small',
  opening_street_tree_small_c:'opening_street_tree_small',
  academic_dead_tree_b:'academic_dead_tree',
});
