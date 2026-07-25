export function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export function normalizeStoryArtTransform(transform = null) {
  const focal = transform?.focalPoint || {};
  return {
    fit: transform?.fit === 'contain' ? 'contain' : 'cover',
    focalPoint: {
      x: clamp01(focal.x, 0.5),
      y: clamp01(focal.y, 0.5),
    },
  };
}

export function storyArtImageRect({ srcW, srcH, dstW, dstH, transform = null } = {}) {
  const safeSrcW = Math.max(1, Number(srcW) || 1);
  const safeSrcH = Math.max(1, Number(srcH) || 1);
  const safeDstW = Math.max(1, Number(dstW) || 1);
  const safeDstH = Math.max(1, Number(dstH) || 1);
  const tx = normalizeStoryArtTransform(transform);

  if (tx.fit === 'contain') {
    const scale = Math.min(safeDstW / safeSrcW, safeDstH / safeSrcH);
    const dw = safeSrcW * scale;
    const dh = safeSrcH * scale;
    return {
      sx: 0,
      sy: 0,
      sw: safeSrcW,
      sh: safeSrcH,
      dx: (safeDstW - dw) / 2,
      dy: (safeDstH - dh) / 2,
      dw,
      dh,
      fit: 'contain',
    };
  }

  const srcRatio = safeSrcW / safeSrcH;
  const dstRatio = safeDstW / safeDstH;
  if (srcRatio > dstRatio) {
    const sw = safeSrcH * dstRatio;
    const maxSx = Math.max(0, safeSrcW - sw);
    return {
      sx: maxSx * tx.focalPoint.x,
      sy: 0,
      sw,
      sh: safeSrcH,
      dx: 0,
      dy: 0,
      dw: safeDstW,
      dh: safeDstH,
      fit: 'cover',
    };
  }

  const sh = safeSrcW / dstRatio;
  const maxSy = Math.max(0, safeSrcH - sh);
  return {
    sx: 0,
    sy: maxSy * tx.focalPoint.y,
    sw: safeSrcW,
    sh,
    dx: 0,
    dy: 0,
    dw: safeDstW,
    dh: safeDstH,
    fit: 'cover',
  };
}

export function storyArtLoadState(art, imgRec) {
  if (!art) return 'none';
  if (art.missing || !art.src) return 'missing';
  if (!imgRec) return 'loading';
  if (imgRec.error) return 'error';
  if (imgRec.loaded && imgRec.image?.naturalWidth && imgRec.image?.naturalHeight) return 'ready';
  return 'loading';
}

export function storyArtLoadLabel(state) {
  if (state === 'loading') return 'LOADING STILL';
  if (state === 'missing') return 'MISSING STILL';
  if (state === 'error') return 'DECODE FAILED';
  return '';
}
