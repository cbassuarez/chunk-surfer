// Ordinary lamp technology and local faults. Emergency red, independent exits
// and the disconnected Hall chandelier retain their own presentation owners.
const profile = (lamp, fault = null, quiet = [18, 42]) => Object.freeze({ lamp, fault, quiet: Object.freeze(quiet) });
export const ELECTRICAL_FIXTURES = Object.freeze({
  'bay-canopy-bulkhead': profile('incandescent', 'contact', [20, 45]),
  'bay-booth-window': profile('incandescent'),
  'plant-service-live': profile('fluorescent', 'ballast', [18, 40]),
  'plant-switchgear-live': profile('led'),
  'plant-manifold-live': profile('fluorescent', 'contact', [25, 50]),
  'b3-work-live': profile('fluorescent', 'ballast', [25, 55]),
  'b3-control-work-live': profile('incandescent'),
  'dance-work-live': profile('fluorescent'),
  'foh-live-west': profile('incandescent', 'contact', [30, 65]),
  'foh-live-east': profile('incandescent'),
  'pool-service-live-a': profile('led'),
  'pool-service-live-b': profile('fluorescent', 'ballast', [24, 55]),
  'deadend-ground-chandelier': profile('incandescent', 'contact', [28, 60]),
  'landing-ground-bulkhead': profile('led'),
  'landing-b3-bulkhead': profile('incandescent'),
});
