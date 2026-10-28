fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_dock_tile_plugin();
        build_dock_assembly();
    }
    tauri_build::build()
}

// The Dock tile plug-in (macos/DockTile) is an AppKit bundle, so it is built
// here rather than by cargo, into a fixed path under target/ that
// tauri.conf.json's bundle.macOS.files copies into Contents/PlugIns. The
// path is fixed on purpose: the config cannot see OUT_DIR.
fn build_dock_tile_plugin() {
    use std::path::PathBuf;
    use std::process::Command;

    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest.join("macos/DockTile");
    for file in ["ChunkSurferDockTile.m", "Info.plist", "DockTile.icns"] {
        println!("cargo:rerun-if-changed={}", source.join(file).display());
    }
    println!("cargo:rerun-if-env-changed=APPLE_SIGNING_IDENTITY");

    let bundle = manifest.join("target/dock-tile/ChunkSurferDockTile.docktileplugin");
    let _ = std::fs::remove_dir_all(&bundle);
    let contents = bundle.join("Contents");
    std::fs::create_dir_all(contents.join("MacOS")).unwrap();
    std::fs::create_dir_all(contents.join("Resources")).unwrap();
    std::fs::copy(source.join("Info.plist"), contents.join("Info.plist")).unwrap();
    std::fs::copy(source.join("DockTile.icns"), contents.join("Resources/DockTile.icns")).unwrap();

    // Universal, because the Dock loads it into its own helper whatever the
    // game itself was built for.
    let status = Command::new("xcrun")
        .args(["clang", "-bundle", "-fobjc-arc", "-framework", "AppKit"])
        .args(["-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=10.13"])
        .arg("-o")
        .arg(contents.join("MacOS/ChunkSurferDockTile"))
        .arg(source.join("ChunkSurferDockTile.m"))
        .status()
        .expect("xcrun clang is needed to build the Dock tile plug-in");
    assert!(status.success(), "the Dock tile plug-in did not compile");

    // Nested code is sealed with the app's identity when there is one, so a
    // signed and notarised build stays valid; ad hoc otherwise.
    let identity = std::env::var("APPLE_SIGNING_IDENTITY").unwrap_or_else(|_| "-".into());
    let mut codesign = Command::new("codesign");
    codesign.args(["--force", "--sign", &identity]);
    if identity != "-" {
        codesign.args(["--options", "runtime", "--timestamp"]);
    }
    let status = codesign
        .arg(&bundle)
        .status()
        .expect("codesign is needed to seal the Dock tile plug-in");
    assert!(status.success(), "the Dock tile plug-in could not be signed");
}

// AppKit owns the finite launch animation and its main-run-loop timer. Build a
// target-architecture static helper; the separate closed-app plug-in remains
// universal and static.
fn build_dock_assembly() {
    use std::path::PathBuf;
    use std::process::Command;

    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let source = manifest.join("macos/DockTile/DockAssembly.m");
    let output = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let object = output.join("DockAssembly.o");
    let library = output.join("libchunk_surfer_dock_assembly.a");
    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
    let architecture = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        other => panic!("unsupported macOS Dock assembly target: {other:?}"),
    };
    let deployment = std::env::var("MACOSX_DEPLOYMENT_TARGET").unwrap_or_else(|_| {
        if architecture == "arm64" {
            "11.0"
        } else {
            "10.13"
        }
        .into()
    });
    let status = Command::new("xcrun")
        .args(["clang", "-c", "-fobjc-arc", "-arch", architecture])
        .arg(format!("-mmacosx-version-min={deployment}"))
        .args(["-o"])
        .arg(&object)
        .arg(&source)
        .status()
        .expect("xcrun clang is needed to build the Dock assembly helper");
    assert!(status.success(), "the Dock assembly helper did not compile");
    let status = Command::new("xcrun")
        .args(["ar", "crs"])
        .arg(&library)
        .arg(&object)
        .status()
        .expect("xcrun ar is needed to archive the Dock assembly helper");
    assert!(
        status.success(),
        "the Dock assembly helper could not be archived"
    );
    println!("cargo:rustc-link-search=native={}", output.display());
    println!("cargo:rustc-link-lib=static=chunk_surfer_dock_assembly");
    println!("cargo:rustc-link-lib=framework=AppKit");
}
