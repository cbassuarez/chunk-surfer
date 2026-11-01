// Owner-applied paint. These two fits use the actual existing vehicle panels,
// not a replacement body, interaction, route, vehicle brand or company story.
export const VAN_BRAND_COPY = 'FIELD RECORDING SERVICES';
export const VAN_BRAND_PACK = 'assets/van-brand.glb';
export const VAN_BRAND_VIEWBOX = Object.freeze([0, 0, 1800, 540]);
export const VAN_BRAND_FITS = Object.freeze({
  yard: Object.freeze({ mesh: 'van_brand_yard', hostMeshes: Object.freeze(['yard_van']),
    surfaceX: 1.045, centerY: 1.68, centerZ: .25, widthM: 2.35, heightM: .705 }),
  drive: Object.freeze({ mesh: 'van_brand_drive', hostMeshes: Object.freeze(['opening_drive_vehicle_body', 'drive_vehicle_body']),
    surfaceX: .965, centerY: 1.62, centerZ: 1.425, widthM: 1.70, heightM: .510 }),
});
export const VAN_BRAND_PAINT = Object.freeze({
  frontOffsetM: .0026, thicknessM: .00020, pigmentLayerStepM: .00012,
  roughness: .79, metallic: 0,
  printedSurface: Object.freeze({ version: 1, coverage: 'solid', polarity: 'dark-on-light', process: 'owner-applied spray and brush paint' }),
  letteringFinish: Object.freeze({ version: 1, profile: 'apparatus-stencil', localSpecular: true }),
});
export function vanBrandFit(mesh) {
  return Object.values(VAN_BRAND_FITS).find(fit => fit.hostMeshes.includes(mesh)) || null;
}
