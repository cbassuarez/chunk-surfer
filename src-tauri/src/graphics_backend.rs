// No backend is forced in a packaged build. This explicit process-local
// override also reaches side windows through WebView2's shared environment.
pub fn configured_browser_arguments(
    existing: &str,
    requested: &str,
) -> Result<Option<String>, &'static str> {
    let explicit = existing.split_whitespace().any(|token| {
        let token = token.trim_matches('"');
        token == "--use-angle" || token.starts_with("--use-angle=")
    });
    if explicit {
        return Ok(None);
    }
    let backend = match requested.trim().to_ascii_lowercase().as_str() {
        "" | "default" => return Ok(None),
        "d3d11" => "d3d11",
        "vulkan" => "vulkan",
        _ => return Err("CHUNK_SURFER_ANGLE_BACKEND must be default, d3d11, or vulkan"),
    };
    Ok(Some(
        format!(
            "{} --use-angle={backend} --force-high-performance-gpu",
            existing.trim()
        )
        .trim()
        .to_string(),
    ))
}

#[cfg(target_os = "windows")]
pub fn configure_from_environment() {
    let requested = std::env::var("CHUNK_SURFER_ANGLE_BACKEND").unwrap_or_default();
    let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    match configured_browser_arguments(&existing, &requested) {
        Ok(Some(arguments)) => {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", arguments)
        }
        Ok(None) => {}
        Err(message) => eprintln!("Ignoring graphics override: {message}"),
    }
}

#[cfg(test)]
mod tests {
    use super::configured_browser_arguments;

    #[test]
    fn automatic_default_is_unchanged() {
        for backend in ["", "default", " DEFAULT "] {
            assert_eq!(
                configured_browser_arguments("--existing-switch", backend),
                Ok(None)
            );
        }
    }

    #[test]
    fn explicit_browser_backend_wins() {
        for existing in [
            "--use-angle=d3d11",
            "--foo --use-angle=vulkan",
            "\"--use-angle=d3d11\"",
            "--use-angle d3d11",
        ] {
            assert_eq!(configured_browser_arguments(existing, "vulkan"), Ok(None));
        }
    }

    #[test]
    fn supported_override_preserves_other_arguments() {
        assert_eq!(
            configured_browser_arguments("--existing-switch", " Vulkan "),
            Ok(Some(
                "--existing-switch --use-angle=vulkan --force-high-performance-gpu".into()
            ))
        );
        assert_eq!(
            configured_browser_arguments("", "d3d11"),
            Ok(Some(
                "--use-angle=d3d11 --force-high-performance-gpu".into()
            ))
        );
        assert!(configured_browser_arguments("", "vulkan --untrusted-switch").is_err());
    }
}
