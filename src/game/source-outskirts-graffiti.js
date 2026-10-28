// Paint follows the rendered support, including its loop and folding matrix.
// It has no collision, interaction or life independent of the parent.
export function sourceOutskirtsGraffitiInstances(renderedParents = []) {
  const result = [];
  for (const parent of renderedParents) {
    if (!parent?.matrix || parent.sourceStructure !== 'outskirts') continue;
    const isBus = parent.mesh === 'outskirts_bus' || parent.mesh === 'outskirts_bus_passage';
    const isWall = parent.mesh === 'outskirts_boundary_wall_6'
      && (parent.id === 'apron-boundary-west' || /-boundary-west-(?:1|4)$/.test(parent.id));
    if (!isBus && !isWall) continue;
    result.push({
      id: `${parent.id}:paint`,
      mesh: isBus ? 'source_outskirts_bus_graffiti' : 'source_outskirts_wall_graffiti',
      matrix: parent.matrix,
      zone: parent.zone,
      structural: false,
      sourceStructure: 'outskirts',
      noShadow: true,
      ...(parent.outskirtsFoldVisibility == null ? {} : { outskirtsFoldVisibility: parent.outskirtsFoldVisibility }),
    });
  }
  return result;
}
