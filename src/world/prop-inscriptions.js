// Overlay geometry is authored in the host's local coordinates. The host owns
// placement, visibility and interaction; this only adds its physical ink.
export function propInscriptionAttachments(hosts, inscriptions) {
  const byHost = new Map();
  for (const inscription of inscriptions) {
    const list = byHost.get(inscription.hostId) || [];
    list.push(inscription); byHost.set(inscription.hostId, list);
  }
  return hosts.flatMap((host) => [host, ...(byHost.get(host.id) || [])
    .filter((inscription) => inscription.hostMesh === host.mesh)
    .map((inscription) => ({ ...host,
      id: `${host.id}:lettering:${inscription.id}`,
      mesh: inscription.mesh, fallbackMesh: null,
      letteringHostId: host.id, letteringId: inscription.id,
      blocks: false, interactive: false,
    }))]);
}
