// Accessibility settings never enter this contract. Only explicit developer
// intervention makes a run ineligible for profile awards and platform writes.
export const achievementRunEligible = run => run?.integrity?.achievements?.eligible !== false;
export function unrankRun(run, reason = 'DEVELOPER_STAGING') {
  if (!run || !achievementRunEligible(run)) return run;
  return { ...run, integrity: { ...run.integrity,
    achievements: { eligible: false, reason: String(reason).slice(0, 80) },
    deadAir: { ...run.integrity?.deadAir, eligible: false,
      invalidations: [...(run.integrity?.deadAir?.invalidations || []), { reason, at: Date.now() }] },
  } };
}
