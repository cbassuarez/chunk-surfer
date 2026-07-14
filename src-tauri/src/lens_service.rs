use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const MAX_STARTS: usize = 3;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Default)]
pub struct LensServiceState(Arc<Mutex<Option<ManagedLens>>>);

impl LensServiceState {
    pub fn stop(&self) {
        if let Ok(mut slot) = self.0.lock() {
            stop_locked(&mut slot);
        }
    }
}

struct ManagedLens {
    child: Child,
    config: LensBootstrap,
    spec: LaunchSpec,
    restarts: usize,
}

#[derive(Clone)]
struct LaunchSpec {
    sidecar: PathBuf,
    port: u16,
    token: String,
    cache_dir: PathBuf,
    resource_dir: PathBuf,
    log_path: PathBuf,
    backend: &'static str,
}

impl Drop for ManagedLens {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LensBootstrap {
    pub url: String,
    pub token: String,
    pub port: u16,
    pub cache_dir: String,
    pub backend: &'static str,
}

fn supported_backend() -> Result<&'static str, String> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return Ok("mps");
    }
    #[cfg(all(any(target_os = "windows", target_os = "linux"), target_arch = "x86_64"))]
    {
        return Ok("cuda");
    }
    #[allow(unreachable_code)]
    Err(format!(
        "unsupported hardware target {}-{}; Chunk Surfer requires macOS Apple Silicon (MPS) or Windows/Linux x64 with NVIDIA CUDA",
        std::env::consts::OS,
        std::env::consts::ARCH
    ))
}

fn reserve_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("could not reserve a loopback port: {error}"))
}

fn launch_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("CHUNK_LENS_SIDECAR") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("CHUNK_LENS_SIDECAR does not exist: {}", path.display()));
    }

    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let bundled = executable
        .parent()
        .unwrap_or(Path::new("."))
        .join(if cfg!(windows) { "chunk-lens.exe" } else { "chunk-lens" });
    if bundled.is_file() {
        return Ok(bundled);
    }

    // Tauri development can opt into the exact packaged executable through
    // CHUNK_LENS_SIDECAR. Browser development intentionally launches it
    // separately and never reaches this command.
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join(if cfg!(windows) { "chunk-lens.exe" } else { "chunk-lens" });
    if resource.is_file() {
        return Ok(resource);
    }
    Err("bundled diffusion sidecar is missing; rebuild with tauri.lens.conf.json".into())
}

fn health_ready(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().expect("literal loopback address"),
        Duration::from_millis(300),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    if stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.contains("200 OK")
        && response.contains("\"ok\":true")
        && response.contains("\"supported\":true")
}

fn stop_locked(slot: &mut Option<ManagedLens>) {
    if let Some(mut managed) = slot.take() {
        let _ = managed.child.kill();
        let _ = managed.child.wait();
    }
}

fn spawn_child(spec: &LaunchSpec) -> Result<Child, String> {
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&spec.log_path)
        .map_err(|error| format!("lens log: {error}"))?;
    let stderr = stdout.try_clone().map_err(|error| error.to_string())?;
    Command::new(&spec.sidecar)
        .env("LENS_HOST", "127.0.0.1")
        .env("LENS_PORT", spec.port.to_string())
        .env("LENS_TOKEN", &spec.token)
        .env("LENS_CACHE_DIR", &spec.cache_dir)
        .env("LENS_RESOURCE_DIR", &spec.resource_dir)
        .env("LENS_MODEL_ROOT", spec.resource_dir.join("models"))
        .env("LENS_BUNDLED", "1")
        .env("LENS_EXPECT_BACKEND", spec.backend)
        .env("LENS_EAGER", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| format!("could not launch {}: {error}", spec.sidecar.display()))
}

fn supervise(state: LensServiceState, token: String) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let Ok(mut slot) = state.0.lock() else { return };
        let Some(managed) = slot.as_mut() else { return };
        if managed.config.token != token { return; }
        match managed.child.try_wait() {
            Ok(None) => continue,
            Ok(Some(_)) if managed.restarts + 1 < MAX_STARTS => {
                managed.restarts += 1;
                match spawn_child(&managed.spec) {
                    Ok(child) => managed.child = child,
                    Err(error) => eprintln!("lens restart {}/{} failed: {error}", managed.restarts, MAX_STARTS - 1),
                }
            }
            Ok(Some(status)) => {
                eprintln!("lens sidecar exhausted bounded restarts after exit {status}");
                return;
            }
            Err(error) => {
                eprintln!("lens supervisor lost child status: {error}");
                return;
            }
        }
    });
}

fn launch(app: &AppHandle, state: &LensServiceState, replace: bool) -> Result<LensBootstrap, String> {
    let backend = supported_backend()?;
    {
        let mut slot = state.0.lock().map_err(|_| "lens service state poisoned")?;
        if !replace {
            if let Some(managed) = slot.as_mut() {
                if managed.child.try_wait().map_err(|error| error.to_string())?.is_none() {
                    return Ok(managed.config.clone());
                }
            }
        }
        stop_locked(&mut slot);
    }

    let sidecar = sidecar_path(app)?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("lens-v2");
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?
        .join("lens");
    fs::create_dir_all(&cache_dir).map_err(|error| format!("lens cache: {error}"))?;
    let log_path = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?
        .join("chunk-lens.log");
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut last_error = String::from("sidecar did not become healthy");
    for attempt in 1..=MAX_STARTS {
        let port = reserve_port()?;
        let token = launch_token();
        let spec = LaunchSpec {
            sidecar: sidecar.clone(), port, token: token.clone(),
            cache_dir: cache_dir.clone(), resource_dir: resource_dir.clone(),
            log_path: log_path.clone(), backend,
        };
        let mut child = spawn_child(&spec)?;

        let started = Instant::now();
        while started.elapsed() < HEALTH_TIMEOUT {
            if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                last_error = format!("diffusion sidecar exited during startup with {status}");
                break;
            }
            if health_ready(port) {
                let config = LensBootstrap {
                    url: format!("ws://127.0.0.1:{port}/"),
                    token,
                    port,
                    cache_dir: cache_dir.to_string_lossy().into_owned(),
                    backend,
                };
                let mut slot = state.0.lock().map_err(|_| "lens service state poisoned")?;
                *slot = Some(ManagedLens { child, config: config.clone(), spec, restarts: 0 });
                drop(slot);
                supervise(state.clone(), config.token.clone());
                return Ok(config);
            }
            thread::sleep(Duration::from_millis(150));
        }
        let _ = child.kill();
        let _ = child.wait();
        last_error = format!("{last_error} (attempt {attempt}/{MAX_STARTS})");
    }
    Err(last_error)
}

#[tauri::command]
pub async fn chunk_lens_bootstrap(
    app: AppHandle,
    state: State<'_, LensServiceState>,
) -> Result<LensBootstrap, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || launch(&app, &state, false))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn chunk_lens_retry(
    app: AppHandle,
    state: State<'_, LensServiceState>,
) -> Result<LensBootstrap, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || launch(&app, &state, true))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn chunk_lens_stop(state: State<'_, LensServiceState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "lens service state poisoned")?;
    stop_locked(&mut slot);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::launch_token;

    #[test]
    fn launch_tokens_are_random_256_bit_hex_values() {
        let first = launch_token();
        let second = launch_token();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|value| value.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }
}
