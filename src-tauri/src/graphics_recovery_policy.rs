//! Process-local recovery order; environment changes and restarts live elsewhere.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GraphicsMode {
    Default,
    Vulkan,
    D3d11,
    NoDmabuf,
    X11,
}

impl GraphicsMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Vulkan => "vulkan",
            Self::D3d11 => "d3d11",
            Self::NoDmabuf => "no-dmabuf",
            Self::X11 => "x11",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [
            Self::Default,
            Self::Vulkan,
            Self::D3d11,
            Self::NoDmabuf,
            Self::X11,
        ]
        .into_iter()
        .find(|mode| mode.as_str().eq_ignore_ascii_case(value.trim()))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    Windows,
    Linux,
    Other,
}

/// X11 is available only when a display exists and no explicit backend forbids it.
/// Linux recovery never selects a Windows ANGLE backend.
pub fn recovery_modes(
    platform: Platform,
    display_available: bool,
    x11_allowed: bool,
) -> Vec<GraphicsMode> {
    use GraphicsMode::*;
    match platform {
        Platform::Windows => vec![Default, Vulkan, D3d11],
        Platform::Linux => {
            let mut modes = vec![Default, NoDmabuf];
            if display_available && x11_allowed {
                modes.push(X11);
            }
            modes
        }
        Platform::Other => vec![Default],
    }
}

/// Try every eligible alternative at most once, including earlier candidates
/// when a previously cached backend was the first attempt of this launch.
pub fn next_mode(
    current: GraphicsMode,
    attempted: &[GraphicsMode],
    candidates: &[GraphicsMode],
) -> Option<GraphicsMode> {
    candidates
        .iter()
        .copied()
        .find(|mode| *mode != current && !attempted.contains(mode))
}

/// Unknown values from an older build cannot create new modes or retry loops.
/// The enum bounds the result to five unique entries, regardless of input size.
pub fn parse_attempts(value: &str) -> Vec<GraphicsMode> {
    let mut attempts = Vec::new();
    for mode in value.split(',').filter_map(GraphicsMode::parse) {
        if !attempts.contains(&mode) {
            attempts.push(mode);
        }
        if attempts.len() == 5 {
            break;
        }
    }
    attempts
}

#[cfg(test)]
mod tests {
    use super::*;
    use GraphicsMode::*;

    #[test]
    fn modes_round_trip_and_allow_environment_whitespace_and_case() {
        for mode in [Default, Vulkan, D3d11, NoDmabuf, X11] {
            assert_eq!(GraphicsMode::parse(mode.as_str()), Some(mode));
            assert_eq!(
                GraphicsMode::parse(&format!(" {} ", mode.as_str().to_uppercase())),
                Some(mode)
            );
        }
        for invalid in ["", "obsolete", "vulkan --extra-switch", "no_dmabuf"] {
            assert_eq!(GraphicsMode::parse(invalid), None);
        }
    }

    #[test]
    fn windows_order_is_independent_of_linux_display_configuration() {
        for display in [false, true] {
            for allowed in [false, true] {
                assert_eq!(
                    recovery_modes(Platform::Windows, display, allowed),
                    [Default, Vulkan, D3d11]
                );
            }
        }
    }

    #[test]
    fn linux_requires_both_display_and_permission_before_trying_x11() {
        for (display, allowed) in [(false, false), (false, true), (true, false)] {
            assert_eq!(
                recovery_modes(Platform::Linux, display, allowed),
                [Default, NoDmabuf]
            );
        }
        assert_eq!(
            recovery_modes(Platform::Linux, true, true),
            [Default, NoDmabuf, X11]
        );
        assert_eq!(recovery_modes(Platform::Other, true, true), [Default]);
    }

    #[test]
    fn a_cached_backend_failure_can_fall_back_to_the_default() {
        let candidates = recovery_modes(Platform::Windows, false, false);
        assert_eq!(next_mode(Vulkan, &[], &candidates), Some(Default));
        assert_eq!(next_mode(Default, &[Vulkan], &candidates), Some(D3d11));
        assert_eq!(next_mode(D3d11, &[Vulkan, Default], &candidates), None);
    }

    #[test]
    fn repeated_failure_exhausts_each_platform_without_a_restart_loop() {
        for platform in [Platform::Windows, Platform::Linux, Platform::Other] {
            let candidates = recovery_modes(platform, true, true);
            for first in candidates.iter().copied() {
                let mut current = first;
                let mut attempted = vec![];
                for _ in 0..candidates.len() {
                    assert!(!attempted.contains(&current));
                    attempted.push(current);
                    match next_mode(current, &attempted, &candidates) {
                        Some(next) => current = next,
                        None => break,
                    }
                }
                assert_eq!(attempted.len(), candidates.len());
                assert_eq!(next_mode(current, &attempted, &candidates), None);
            }
        }
    }

    #[test]
    fn unknown_current_and_attempts_cannot_add_candidates() {
        let candidates = recovery_modes(Platform::Linux, false, true);
        assert_eq!(next_mode(Vulkan, &[D3d11, X11], &candidates), Some(Default));
        assert_eq!(
            next_mode(Default, &[D3d11, X11, NoDmabuf], &candidates),
            None
        );
        assert_eq!(next_mode(Default, &[], &[]), None);
    }

    #[test]
    fn attempts_ignore_obsolete_modes_empty_entries_and_duplicates() {
        assert_eq!(
            parse_attempts(" , obsolete, VULKAN,default,vulkan,, D3D11 "),
            [Vulkan, Default, D3d11]
        );
        assert_eq!(parse_attempts("unknown,--use-angle=vulkan"), []);
        let repeated = "default,vulkan,d3d11,no-dmabuf,x11,obsolete,".repeat(100);
        assert_eq!(
            parse_attempts(&repeated),
            [Default, Vulkan, D3d11, NoDmabuf, X11]
        );
    }
}
