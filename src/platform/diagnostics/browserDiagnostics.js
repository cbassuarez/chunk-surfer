export async function revealSaveFolder() {
  return { ok: false, unsupported: true, reason: 'Browser mode has no save folder. Saves use localStorage.' };
}

export async function revealLogFolder() {
  return { ok: false, unsupported: true, reason: 'Browser mode has no log folder. Diagnostics use the browser console.' };
}
