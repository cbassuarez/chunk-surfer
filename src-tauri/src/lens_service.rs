use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const MAX_STARTS: usize = 3;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(45);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(150);
const HEALTH_CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const HEALTH_READ_TIMEOUT: Duration = Duration::from_millis(600);

#[derive(Clone, Default)]
pub struct LensServiceState(Arc<Mutex<ServiceInner>>);

#[derive(Default)]
struct ServiceInner {
    managed: Option<ManagedLens>,
    launch_session: Option<String>,
}

impl LensServiceState {
    pub fn stop(&self) {
        if let Ok(mut inner) = self.0.lock() {
            stop_locked(&mut inner);
        }
    }
}

struct ManagedLens {
    child: Child,
    config: Option<LensBootstrap>,
    spec: LaunchSpec,
    restarts: usize,
    session: String,
}

#[derive(Clone)]
struct LaunchTarget {
    path: PathBuf,
    args: Vec<OsString>,
    extra_env: Vec<(OsString, OsString)>,
}

#[derive(Clone)]
struct LaunchPaths {
    target: LaunchTarget,
    cache_dir: PathBuf,
    resource_dir: PathBuf,
    log_path: PathBuf,
}

#[derive(Clone)]
struct LaunchSpec {
    target: LaunchTarget,
    port: u16,
    token: String,
    cache_dir: PathBuf,
    resource_dir: PathBuf,
    log_path: PathBuf,
    backend: &'static str,
    session: String,
    attempt: usize,
    app_version: String,
}

#[derive(Clone, Copy)]
struct StartupTiming {
    health_timeout: Duration,
    poll_interval: Duration,
    connect_timeout: Duration,
    read_timeout: Duration,
}

impl Default for StartupTiming {
    fn default() -> Self {
        Self {
            health_timeout: HEALTH_TIMEOUT,
            poll_interval: HEALTH_POLL_INTERVAL,
            connect_timeout: HEALTH_CONNECT_TIMEOUT,
            read_timeout: HEALTH_READ_TIMEOUT,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum HealthState {
    Ready,
    Starting,
    UnsupportedHardware(String),
    InvalidResponse(String),
    Unreachable,
    Fatal(String),
}

#[derive(Deserialize)]
struct HealthPayload {
    ok: Option<bool>,
    supported: Option<bool>,
    ready: Option<bool>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct LensManifest {
    schema: u32,
    #[serde(rename = "serviceSchema")]
    service_schema: u32,
    #[serde(rename = "modelId")]
    model_id: String,
    files: BTreeMap<String, String>,
}

enum LaunchDecision {
    Existing(LensBootstrap),
    Start(String),
}

enum ChildPoll {
    Running,
    Exited(ExitStatus),
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RetryDisposition {
    Retry,
    Fatal,
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
    #[cfg(all(
        any(target_os = "windows", target_os = "linux"),
        target_arch = "x86_64"
    ))]
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

fn random_hex<const N: usize>() -> String {
    let mut bytes = [0_u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn launch_token() -> String {
    random_hex::<32>()
}

fn session_marker() -> String {
    random_hex::<8>()
}

fn executable_parent() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|_| "could not locate the Chunk Surfer executable".to_string())?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "could not locate the Chunk Surfer application folder".to_string())
}

fn sidecar_target(app: &AppHandle) -> Result<LaunchTarget, String> {
    if let Some(path) = std::env::var_os("CHUNK_LENS_SIDECAR") {
        return Ok(LaunchTarget {
            path: PathBuf::from(path),
            args: Vec::new(),
            extra_env: Vec::new(),
        });
    }

    let name = if cfg!(windows) {
        "chunk-lens.exe"
    } else {
        "chunk-lens"
    };
    let adjacent = executable_parent()?.join(name);
    if adjacent.is_file() {
        return Ok(LaunchTarget {
            path: adjacent,
            args: Vec::new(),
            extra_env: Vec::new(),
        });
    }

    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| "could not locate the Chunk Surfer resource folder".to_string())?
        .join(name);
    Ok(LaunchTarget {
        path: if resource.is_file() {
            resource
        } else {
            adjacent
        },
        args: Vec::new(),
        extra_env: Vec::new(),
    })
}

fn lens_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| "could not locate the Chunk Surfer resource folder".to_string())?
        .join("lens");
    if resource.is_dir() {
        return Ok(resource);
    }

    let portable = executable_parent()?.join("lens");
    Ok(if portable.is_dir() {
        portable
    } else {
        resource
    })
}

fn ensure_writable_directory(path: &Path, label: &str, session: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| format!("the {label} directory could not be created"))?;
    let probe = path.join(format!(".chunk-lens-write-test-{session}"));
    let result = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)
        .and_then(|mut file| file.write_all(b"ok"));
    let _ = fs::remove_file(&probe);
    result.map_err(|_| format!("the {label} directory is not writable"))
}

fn resolve_launch_paths(app: &AppHandle, session: &str) -> Result<LaunchPaths, String> {
    let target = sidecar_target(app)?;
    let resource_dir = lens_resource_dir(app)?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "could not locate the Chunk Surfer cache folder".to_string())?
        .join("lens-v2");
    let log_path = app
        .path()
        .app_log_dir()
        .map_err(|_| "could not locate the Chunk Surfer log folder".to_string())?
        .join("chunk-lens.log");
    let log_dir = log_path
        .parent()
        .ok_or_else(|| "could not locate the Chunk Surfer log folder".to_string())?;

    ensure_writable_directory(&cache_dir, "lens cache", session)?;
    ensure_writable_directory(log_dir, "lens log", session)?;

    Ok(LaunchPaths {
        target,
        cache_dir,
        resource_dir,
        log_path,
    })
}

fn payload_error(detail: &str) -> String {
    format!(
        "portable lens payload is incomplete: {detail}. Extract the complete Chunk Surfer folder before running"
    )
}

fn safe_manifest_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || relative.contains('\\') || relative.contains(':') {
        return Err(payload_error("lens manifest contains an unsafe path"));
    }
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(payload_error("lens manifest contains an unsafe path"));
    }
    Ok(root.join(relative_path))
}

fn validate_required_payload(target: &LaunchTarget, resource_dir: &Path) -> Result<(), String> {
    if !target.path.is_file() {
        return Err(payload_error("chunk-lens executable is missing"));
    }
    if !resource_dir.is_dir() {
        return Err(payload_error("lens resource directory is missing"));
    }
    let model_root = resource_dir.join("models");
    if !model_root.is_dir() {
        return Err(payload_error("lens model directory is missing"));
    }
    let manifest_path = resource_dir.join("manifest.json");
    if !manifest_path.is_file() {
        return Err(payload_error("lens/manifest.json is missing"));
    }
    let manifest_bytes =
        fs::read(&manifest_path).map_err(|_| payload_error("lens/manifest.json cannot be read"))?;
    let manifest: LensManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| payload_error("lens/manifest.json is malformed"))?;
    if manifest.schema != 1
        || manifest.service_schema != 2
        || manifest.model_id != "sd15-hyper4"
        || manifest.files.is_empty()
    {
        return Err(payload_error(
            "lens/manifest.json describes an incompatible payload",
        ));
    }
    for (relative, expected_hash) in manifest.files {
        if expected_hash.len() != 64
            || !expected_hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(payload_error("lens manifest contains an invalid checksum"));
        }
        let file = safe_manifest_path(resource_dir, &relative)?;
        let metadata = file
            .metadata()
            .map_err(|_| payload_error(&format!("required lens file is missing ({relative})")))?;
        if !metadata.is_file() || metadata.len() == 0 {
            return Err(payload_error(&format!(
                "required lens file is empty ({relative})"
            )));
        }
    }
    Ok(())
}

fn parse_health_response(response: &str) -> HealthState {
    let Some((headers, body)) = response.split_once("\r\n\r\n") else {
        return HealthState::InvalidResponse("health response has no HTTP body".into());
    };
    let status = headers.lines().next().unwrap_or_default();
    let mut status_parts = status.split_whitespace();
    if !status_parts.next().unwrap_or_default().starts_with("HTTP/") {
        return HealthState::InvalidResponse("health response has an invalid status line".into());
    }
    if status_parts.next() != Some("200") {
        return HealthState::InvalidResponse(format!("health endpoint returned {status}"));
    }
    let payload: HealthPayload = match serde_json::from_str(body.trim()) {
        Ok(payload) => payload,
        Err(error) => {
            return HealthState::InvalidResponse(format!("health JSON is malformed: {error}"));
        }
    };
    match (payload.ok, payload.supported, payload.ready) {
        (Some(false), _, _) => HealthState::Fatal(
            payload
                .error
                .unwrap_or_else(|| "diffusion service reported an internal startup failure".into()),
        ),
        (Some(true), Some(false), _) => {
            HealthState::UnsupportedHardware(payload.error.unwrap_or_else(|| {
                "NVIDIA CUDA hardware and a compatible driver are required on Windows".into()
            }))
        }
        (Some(true), Some(true), Some(true)) => HealthState::Ready,
        (Some(true), Some(true), Some(false)) => HealthState::Starting,
        _ => HealthState::InvalidResponse(
            "health response is missing ok, supported, or ready".into(),
        ),
    }
}

fn health_probe(port: u16, timing: StartupTiming) -> HealthState {
    let address = format!("127.0.0.1:{port}")
        .parse()
        .expect("literal loopback address");
    let Ok(mut stream) = TcpStream::connect_timeout(&address, timing.connect_timeout) else {
        return HealthState::Unreachable;
    };
    let _ = stream.set_read_timeout(Some(timing.read_timeout));
    if stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return HealthState::Unreachable;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return HealthState::Unreachable;
    }
    parse_health_response(&response)
}

fn health_label(state: &HealthState) -> &'static str {
    match state {
        HealthState::Ready => "ready",
        HealthState::Starting => "starting",
        HealthState::UnsupportedHardware(_) => "unsupported-hardware",
        HealthState::InvalidResponse(_) => "invalid-response",
        HealthState::Unreachable => "unreachable",
        HealthState::Fatal(_) => "fatal",
    }
}

fn stop_managed(inner: &mut ServiceInner) {
    if let Some(mut managed) = inner.managed.take() {
        let _ = managed.child.kill();
        let _ = managed.child.wait();
    }
}

fn stop_locked(inner: &mut ServiceInner) {
    inner.launch_session = None;
    stop_managed(inner);
}

fn begin_launch(state: &LensServiceState, replace: bool) -> Result<LaunchDecision, String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "lens service state poisoned".to_string())?;
    if inner.launch_session.is_some() {
        return Err("diffusion service startup is already in progress".into());
    }
    if !replace {
        if let Some(managed) = inner.managed.as_mut() {
            let running = managed
                .child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none();
            if running {
                if let Some(config) = &managed.config {
                    return Ok(LaunchDecision::Existing(config.clone()));
                }
            }
        }
    }
    stop_managed(&mut inner);
    let session = session_marker();
    inner.launch_session = Some(session.clone());
    Ok(LaunchDecision::Start(session))
}

fn finish_launch(state: &LensServiceState, session: &str, success: bool) {
    if let Ok(mut inner) = state.0.lock() {
        if inner.launch_session.as_deref() != Some(session) {
            return;
        }
        inner.launch_session = None;
        if !success
            && inner
                .managed
                .as_ref()
                .is_some_and(|managed| managed.session == session)
        {
            stop_managed(&mut inner);
        }
    }
}

fn register_starting_child(
    state: &LensServiceState,
    session: &str,
    child: Child,
    spec: LaunchSpec,
) -> Result<(), String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "lens service state poisoned".to_string())?;
    if inner.launch_session.as_deref() != Some(session) {
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        return Err("diffusion service startup was cancelled".into());
    }
    stop_managed(&mut inner);
    inner.managed = Some(ManagedLens {
        child,
        config: None,
        spec,
        restarts: 0,
        session: session.to_string(),
    });
    Ok(())
}

fn poll_starting_child(state: &LensServiceState, session: &str) -> Result<ChildPoll, String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "lens service state poisoned".to_string())?;
    if inner.launch_session.as_deref() != Some(session) {
        return Ok(ChildPoll::Cancelled);
    }
    let Some(managed) = inner.managed.as_mut() else {
        return Ok(ChildPoll::Cancelled);
    };
    if managed.session != session {
        return Ok(ChildPoll::Cancelled);
    }
    match managed
        .child
        .try_wait()
        .map_err(|error| error.to_string())?
    {
        None => Ok(ChildPoll::Running),
        Some(status) => {
            inner.managed.take();
            Ok(ChildPoll::Exited(status))
        }
    }
}

fn terminate_attempt(state: &LensServiceState, session: &str) {
    if let Ok(mut inner) = state.0.lock() {
        if inner
            .managed
            .as_ref()
            .is_some_and(|managed| managed.session == session)
        {
            stop_managed(&mut inner);
        }
    }
}

fn promote_running_child(
    state: &LensServiceState,
    session: &str,
    config: LensBootstrap,
) -> Result<(), String> {
    let mut inner = state
        .0
        .lock()
        .map_err(|_| "lens service state poisoned".to_string())?;
    if inner.launch_session.as_deref() != Some(session) {
        return Err("diffusion service startup was cancelled".into());
    }
    let Some(managed) = inner.managed.as_mut() else {
        return Err("diffusion service startup was cancelled".into());
    };
    if managed.session != session {
        return Err("diffusion service startup was cancelled".into());
    }
    managed.config = Some(config);
    Ok(())
}

fn redact_secret(message: &str, secret: &str) -> String {
    if secret.is_empty() {
        message.to_string()
    } else {
        message.replace(secret, "[REDACTED]")
    }
}

fn append_diagnostic(log_path: &Path, secret: &str, message: &str) {
    let safe = redact_secret(message, secret);
    tauri_plugin_log::log::info!(target: "lens_service", "{safe}");
    match OpenOptions::new().create(true).append(true).open(log_path) {
        Ok(mut file) => {
            let _ = writeln!(file, "[chunk-surfer-launch] {safe}");
        }
        Err(error) => {
            tauri_plugin_log::log::error!(target: "lens_service", "lens log append failed: {error}");
        }
    }
}

fn append_spec_diagnostic(spec: &LaunchSpec, message: &str) {
    append_diagnostic(&spec.log_path, &spec.token, message);
}

fn sidecar_creation_flags() -> u32 {
    #[cfg(windows)]
    {
        windows_sys::Win32::System::Threading::CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    {
        0
    }
}

fn configure_sidecar_command(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(sidecar_creation_flags());
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

fn spawn_child(spec: &LaunchSpec) -> Result<Child, String> {
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&spec.log_path)
        .map_err(|error| format!("lens log: {error}"))?;
    let stderr = stdout.try_clone().map_err(|error| error.to_string())?;
    let mut command = Command::new(&spec.target.path);
    command
        .args(&spec.target.args)
        .env("LENS_HOST", "127.0.0.1")
        .env("LENS_PORT", spec.port.to_string())
        .env("LENS_TOKEN", &spec.token)
        .env("LENS_CACHE_DIR", &spec.cache_dir)
        .env("LENS_RESOURCE_DIR", &spec.resource_dir)
        .env("LENS_MODEL_ROOT", spec.resource_dir.join("models"))
        .env("LENS_BUNDLED", "1")
        .env("LENS_EXPECT_BACKEND", spec.backend)
        .env("LENS_EAGER", "0")
        .env("CHUNK_LENS_ATTEMPT", spec.attempt.to_string())
        .envs(spec.target.extra_env.iter().cloned())
        // Material tiles are conditioned on the authored height atlas and
        // possession bursts on the marched depth of the frame being repainted.
        // Without ControlNet the lens paints over geometry instead of into it.
        .env("LENS_DEPTH", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    configure_sidecar_command(&mut command);
    command
        .spawn()
        .map_err(|error| format!("could not launch diffusion sidecar: {error}"))
}

fn windows_status_symbol(raw: u32) -> Option<&'static str> {
    match raw {
        0xC000_013A => Some(
            "STATUS_CONTROL_C_EXIT: the Windows sidecar was interrupted by a console control event",
        ),
        0xC000_0135 => Some("STATUS_DLL_NOT_FOUND: a required Windows DLL was not found"),
        0xC000_007B => {
            Some("STATUS_INVALID_IMAGE_FORMAT: a Windows binary or DLL has the wrong format")
        }
        _ => None,
    }
}

fn format_exit_code(code: i32) -> String {
    let raw = code as u32;
    let symbolic = windows_status_symbol(raw).unwrap_or("unclassified");
    format!(
        "exit_code_decimal={code} exit_code_raw={raw} exit_code_hex=0x{raw:08X} exit_status={symbolic}"
    )
}

fn exit_diagnostic(status: ExitStatus) -> String {
    status.code().map(format_exit_code).unwrap_or_else(|| {
        format!("exit_code_decimal=unavailable exit_code_hex=unavailable status={status}")
    })
}

fn retry_disposition(status: ExitStatus) -> RetryDisposition {
    match status.code() {
        // Exit 1 can represent Uvicorn losing the bind-after-reserve race or a
        // transient PyInstaller extraction/security scan failure. A fresh port
        // and extraction can recover, so keep the bounded retry for this case.
        Some(1) => RetryDisposition::Retry,
        // NTSTATUS crashes, normal success during startup, and other explicit
        // failures do not become healthier by immediately spawning the same
        // payload three times.
        Some(_) => RetryDisposition::Fatal,
        // Signals are platform-specific and can be transient outside Windows.
        None => RetryDisposition::Retry,
    }
}

fn user_exit_error(status: ExitStatus) -> String {
    let raw = status.code().map(|code| code as u32);
    match raw {
        Some(0xC000_013A) => {
            "diffusion service was interrupted by a Windows console control event (0xC000013A)"
                .into()
        }
        Some(code) => format!("diffusion service exited during startup (0x{code:08X})"),
        None => "diffusion service exited during startup".into(),
    }
}

fn with_log_hint(message: impl AsRef<str>) -> String {
    format!(
        "{}. See chunk-lens.log in the Chunk Surfer log folder",
        message.as_ref().trim_end_matches('.')
    )
}

fn supervise(state: LensServiceState, token: String) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let Ok(mut inner) = state.0.lock() else {
            return;
        };
        let Some(managed) = inner.managed.as_mut() else {
            return;
        };
        let Some(config) = managed.config.as_ref() else {
            return;
        };
        if config.token != token {
            return;
        }
        let status = match managed.child.try_wait() {
            Ok(None) => continue,
            Ok(Some(status)) => status,
            Err(error) => {
                append_spec_diagnostic(
                    &managed.spec,
                    &format!("supervisor_state=lost-child-status error={error} retry=false"),
                );
                return;
            }
        };
        let retry = retry_disposition(status) == RetryDisposition::Retry
            && managed.restarts + 1 < MAX_STARTS;
        append_spec_diagnostic(
            &managed.spec,
            &format!(
                "supervisor_state=child-exited {} retry={retry}",
                exit_diagnostic(status)
            ),
        );
        if !retry {
            inner.managed.take();
            return;
        }
        managed.restarts += 1;
        let mut next_spec = managed.spec.clone();
        next_spec.attempt = managed.restarts + 1;
        match spawn_child(&next_spec) {
            Ok(child) => {
                append_spec_diagnostic(
                    &next_spec,
                    &format!(
                        "supervisor_state=restarted attempt={} child_pid={} retry=true",
                        next_spec.attempt,
                        child.id()
                    ),
                );
                managed.child = child;
                managed.spec = next_spec;
            }
            Err(error) => append_spec_diagnostic(
                &next_spec,
                &format!(
                    "supervisor_state=restart-failed attempt={} error={error} retry={}",
                    next_spec.attempt,
                    managed.restarts + 1 < MAX_STARTS
                ),
            ),
        }
    });
}

fn launch_attempts(
    state: &LensServiceState,
    session: &str,
    paths: LaunchPaths,
    backend: &'static str,
    app_version: &str,
    timing: StartupTiming,
) -> Result<LensBootstrap, String> {
    append_diagnostic(
        &paths.log_path,
        "",
        &format!(
            "startup_session={session} app_version={app_version} os={} architecture={} sidecar_path=\"{}\" resource_directory=\"{}\" cache_directory=\"{}\" log_path=\"{}\" sidecar_exists={} resource_exists={} manifest_exists={} model_root_exists={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            paths.target.path.display(),
            paths.resource_dir.display(),
            paths.cache_dir.display(),
            paths.log_path.display(),
            paths.target.path.is_file(),
            paths.resource_dir.is_dir(),
            paths.resource_dir.join("manifest.json").is_file(),
            paths.resource_dir.join("models").is_dir(),
        ),
    );
    if let Err(error) = validate_required_payload(&paths.target, &paths.resource_dir) {
        append_diagnostic(
            &paths.log_path,
            "",
            &format!(
                "startup_session={session} payload_validation=failed error={error} retry=false"
            ),
        );
        return Err(with_log_hint(error));
    }
    append_diagnostic(
        &paths.log_path,
        "",
        &format!("startup_session={session} payload_validation=passed"),
    );

    let mut last_error = String::from("diffusion service did not become healthy");
    for attempt in 1..=MAX_STARTS {
        let port = reserve_port()?;
        let token = launch_token();
        let spec = LaunchSpec {
            target: paths.target.clone(),
            port,
            token: token.clone(),
            cache_dir: paths.cache_dir.clone(),
            resource_dir: paths.resource_dir.clone(),
            log_path: paths.log_path.clone(),
            backend,
            session: session.to_string(),
            attempt,
            app_version: app_version.to_string(),
        };
        append_spec_diagnostic(
            &spec,
            &format!(
                "startup_session={} attempt={attempt}/{MAX_STARTS} spawn_policy_flags=0x{:08X} backend={} app_version={} health_timeout_ms={} retry=pending",
                spec.session,
                sidecar_creation_flags(),
                spec.backend,
                spec.app_version,
                timing.health_timeout.as_millis(),
            ),
        );

        let launch_started = Instant::now();
        let child = spawn_child(&spec)?;
        let child_pid = child.id();
        register_starting_child(state, session, child, spec.clone())?;
        append_spec_diagnostic(
            &spec,
            &format!(
                "startup_session={} attempt={attempt}/{MAX_STARTS} child_pid={child_pid} launch_elapsed_ms={}",
                spec.session,
                launch_started.elapsed().as_millis(),
            ),
        );

        let started = Instant::now();
        let mut last_health = None;
        let retry = loop {
            match poll_starting_child(state, session)? {
                ChildPoll::Running => {}
                ChildPoll::Cancelled => {
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=cancelled retry=false",
                            spec.session
                        ),
                    );
                    return Err("diffusion service startup was cancelled".into());
                }
                ChildPoll::Exited(status) => {
                    let disposition = retry_disposition(status);
                    let should_retry =
                        disposition == RetryDisposition::Retry && attempt < MAX_STARTS;
                    last_error = user_exit_error(status);
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=child-exited elapsed_ms={} {} retry={should_retry}",
                            spec.session,
                            started.elapsed().as_millis(),
                            exit_diagnostic(status),
                        ),
                    );
                    break should_retry;
                }
            }

            let health = health_probe(port, timing);
            let label = health_label(&health);
            if last_health != Some(label) {
                append_spec_diagnostic(
                    &spec,
                    &format!(
                        "startup_session={} attempt={attempt}/{MAX_STARTS} health_probe={label} elapsed_ms={}",
                        spec.session,
                        started.elapsed().as_millis(),
                    ),
                );
                last_health = Some(label);
            }
            match health {
                HealthState::Ready | HealthState::Starting => {
                    let config = LensBootstrap {
                        url: format!("ws://127.0.0.1:{port}/"),
                        token,
                        port,
                        cache_dir: paths.cache_dir.to_string_lossy().into_owned(),
                        backend,
                    };
                    promote_running_child(state, session, config.clone())?;
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=accepted health_probe={label} model_loading=lazy elapsed_ms={} retry=false",
                            spec.session,
                            started.elapsed().as_millis(),
                        ),
                    );
                    return Ok(config);
                }
                HealthState::UnsupportedHardware(reason) => {
                    terminate_attempt(state, session);
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=unsupported-hardware reason={reason} retry=false",
                            spec.session,
                        ),
                    );
                    return Err(with_log_hint(reason));
                }
                HealthState::InvalidResponse(reason) => {
                    terminate_attempt(state, session);
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=invalid-health-response reason={reason} retry=false",
                            spec.session,
                        ),
                    );
                    return Err(with_log_hint(format!(
                        "diffusion service returned an invalid health response ({reason})"
                    )));
                }
                HealthState::Fatal(reason) => {
                    terminate_attempt(state, session);
                    append_spec_diagnostic(
                        &spec,
                        &format!(
                            "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=fatal reason={reason} retry=false",
                            spec.session,
                        ),
                    );
                    return Err(with_log_hint(reason));
                }
                HealthState::Unreachable => {}
            }

            if started.elapsed() >= timing.health_timeout {
                terminate_attempt(state, session);
                last_error = format!(
                    "diffusion service did not open its health endpoint within {} seconds",
                    timing.health_timeout.as_secs_f32()
                );
                let should_retry = attempt < MAX_STARTS;
                append_spec_diagnostic(
                    &spec,
                    &format!(
                        "startup_session={} attempt={attempt}/{MAX_STARTS} startup_state=health-timeout elapsed_ms={} retry={should_retry}",
                        spec.session,
                        started.elapsed().as_millis(),
                    ),
                );
                break should_retry;
            }
            thread::sleep(timing.poll_interval);
        };

        if !retry {
            return Err(with_log_hint(last_error));
        }
    }
    Err(with_log_hint(format!(
        "{last_error} (attempt {MAX_STARTS}/{MAX_STARTS})"
    )))
}

fn launch_with_paths(
    state: &LensServiceState,
    paths: LaunchPaths,
    backend: &'static str,
    app_version: &str,
    replace: bool,
    timing: StartupTiming,
) -> Result<LensBootstrap, String> {
    let session = match begin_launch(state, replace)? {
        LaunchDecision::Existing(config) => return Ok(config),
        LaunchDecision::Start(session) => session,
    };
    let result = launch_attempts(state, &session, paths, backend, app_version, timing);
    finish_launch(state, &session, result.is_ok());
    if let Ok(config) = &result {
        supervise(state.clone(), config.token.clone());
    }
    result
}

fn launch(
    app: &AppHandle,
    state: &LensServiceState,
    replace: bool,
) -> Result<LensBootstrap, String> {
    let backend = supported_backend()?;
    let app_version = app.package_info().version.to_string();
    let session = session_marker();
    let paths = resolve_launch_paths(app, &session).map_err(with_log_hint)?;
    launch_with_paths(
        state,
        paths,
        backend,
        &app_version,
        replace,
        StartupTiming::default(),
    )
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
    state.stop();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        io::{Read, Write},
        process,
        sync::atomic::{AtomicUsize, Ordering},
    };

    static FIXTURE_ID: AtomicUsize = AtomicUsize::new(0);

    fn http_response(body: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn healthy_body(ready: bool) -> String {
        format!(r#"{{"ok":true,"supported":true,"ready":{ready},"error":null}}"#)
    }

    fn unique_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "chunk-surfer-{label}-{}-{}",
            process::id(),
            FIXTURE_ID.fetch_add(1, Ordering::Relaxed)
        ))
    }

    fn fixture_paths(mode: &str) -> (PathBuf, LaunchPaths) {
        let root = unique_root(mode);
        let resource_dir = root.join("lens");
        let models = resource_dir.join("models");
        fs::create_dir_all(&models).unwrap();
        fs::write(models.join("fixture.bin"), b"fixture").unwrap();
        fs::write(
            resource_dir.join("manifest.json"),
            format!(
                "{{\"schema\":1,\"serviceSchema\":2,\"modelId\":\"sd15-hyper4\",\"files\":{{\"models/fixture.bin\":\"{}\"}}}}",
                "0".repeat(64)
            ),
        )
        .unwrap();
        let target = LaunchTarget {
            path: env::current_exe().unwrap(),
            args: vec![
                "--exact".into(),
                "lens_service::tests::fake_health_sidecar_child".into(),
                "--nocapture".into(),
            ],
            extra_env: vec![("CHUNK_LENS_FIXTURE_MODE".into(), mode.into())],
        };
        let paths = LaunchPaths {
            target,
            cache_dir: root.join("cache"),
            resource_dir,
            log_path: root.join("logs/chunk-lens.log"),
        };
        fs::create_dir_all(&paths.cache_dir).unwrap();
        fs::create_dir_all(paths.log_path.parent().unwrap()).unwrap();
        (root, paths)
    }

    fn fast_timing() -> StartupTiming {
        StartupTiming {
            health_timeout: Duration::from_millis(450),
            poll_interval: Duration::from_millis(10),
            connect_timeout: Duration::from_millis(20),
            read_timeout: Duration::from_millis(100),
        }
    }

    fn run_fixture(mode: &str) -> (PathBuf, LensServiceState, Result<LensBootstrap, String>) {
        let (root, paths) = fixture_paths(mode);
        let state = LensServiceState::default();
        let result = launch_with_paths(&state, paths, "cuda", "test", false, fast_timing());
        (root, state, result)
    }

    #[test]
    fn fake_health_sidecar_child() {
        let Ok(mode) = env::var("CHUNK_LENS_FIXTURE_MODE") else {
            return;
        };
        let attempt = env::var("CHUNK_LENS_ATTEMPT")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1);
        if mode == "early-exit" || (mode == "retry-success" && attempt == 1) {
            process::exit(1);
        }
        if mode == "timeout" {
            thread::sleep(Duration::from_secs(60));
            return;
        }
        if mode == "delayed" {
            thread::sleep(Duration::from_millis(80));
        }
        let port = env::var("LENS_PORT").unwrap().parse::<u16>().unwrap();
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 512];
        let _ = stream.read(&mut request);
        let response = match mode.as_str() {
            "ready" => http_response(&healthy_body(true)),
            "unsupported" => http_response(
                r#"{"ok":true,"supported":false,"ready":false,"error":"NVIDIA CUDA GPU and compatible driver required"}"#,
            ),
            "malformed" => "HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nnope".into(),
            _ => http_response(&healthy_body(false)),
        };
        stream.write_all(response.as_bytes()).unwrap();
        drop(stream);
        thread::sleep(Duration::from_secs(60));
    }

    #[test]
    fn launch_tokens_are_random_256_bit_hex_values() {
        let first = launch_token();
        let second = launch_token();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|value| value.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn health_parser_accepts_ready_and_supported_but_lazy_responses() {
        assert_eq!(
            parse_health_response(&http_response(&healthy_body(true))),
            HealthState::Ready
        );
        assert_eq!(
            parse_health_response(&http_response(&healthy_body(false))),
            HealthState::Starting
        );
    }

    #[test]
    fn health_parser_classifies_unsupported_and_malformed_responses() {
        assert_eq!(
            parse_health_response(&http_response(
                r#"{"ok":true,"supported":false,"ready":false,"error":"CUDA required"}"#
            )),
            HealthState::UnsupportedHardware("CUDA required".into())
        );
        assert!(matches!(
            parse_health_response("HTTP/1.1 200 OK\r\n\r\nnot-json"),
            HealthState::InvalidResponse(_)
        ));
    }

    #[test]
    fn immediate_ready_lazy_and_delayed_fake_sidecars_start() {
        for mode in ["ready", "healthy", "delayed"] {
            let (root, state, result) = run_fixture(mode);
            let config = result.unwrap_or_else(|error| panic!("{mode}: {error}"));
            assert_eq!(config.backend, "cuda");
            state.stop();
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn unsupported_and_malformed_fake_sidecars_fail_once_without_retrying() {
        for (mode, expected) in [
            ("unsupported", "NVIDIA CUDA GPU"),
            ("malformed", "invalid health response"),
        ] {
            let (root, state, result) = run_fixture(mode);
            let error = result.unwrap_err();
            assert!(error.contains(expected), "{mode}: {error}");
            let log = fs::read_to_string(root.join("logs/chunk-lens.log")).unwrap();
            assert!(log.contains("attempt=1/3"));
            assert!(!log.contains("attempt=2/3"));
            state.stop();
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn fake_sidecar_retries_once_then_succeeds() {
        let (root, state, result) = run_fixture("retry-success");
        assert!(result.is_ok(), "{:?}", result.err());
        let log = fs::read_to_string(root.join("logs/chunk-lens.log")).unwrap();
        assert!(log.contains("attempt=1/3"));
        assert!(log.contains("attempt=2/3"));
        assert!(log.contains("startup_state=accepted"));
        state.stop();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn early_exit_and_timeout_are_bounded_to_three_attempts_and_clean_up() {
        for mode in ["early-exit", "timeout"] {
            let (root, state, result) = run_fixture(mode);
            assert!(result.is_err());
            let log = fs::read_to_string(root.join("logs/chunk-lens.log")).unwrap();
            assert!(log.contains("attempt=1/3"));
            assert!(log.contains("attempt=2/3"));
            assert!(log.contains("attempt=3/3"));
            assert!(state.0.lock().unwrap().managed.is_none());
            state.stop();
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn cleanup_during_startup_kills_the_registered_child() {
        let (root, paths) = fixture_paths("timeout");
        let state = LensServiceState::default();
        let launched_state = state.clone();
        let handle = thread::spawn(move || {
            launch_with_paths(
                &launched_state,
                paths,
                "cuda",
                "test",
                false,
                StartupTiming {
                    health_timeout: Duration::from_secs(10),
                    ..fast_timing()
                },
            )
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if state.0.lock().unwrap().managed.is_some() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(state.0.lock().unwrap().managed.is_some());
        state.stop();
        let error = handle.join().unwrap().unwrap_err();
        assert!(error.contains("cancelled"), "{error}");
        assert!(state.0.lock().unwrap().managed.is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_retry_cannot_start_an_overlapping_launch_session() {
        let state = LensServiceState::default();
        let session = match begin_launch(&state, false).unwrap() {
            LaunchDecision::Start(session) => session,
            LaunchDecision::Existing(_) => panic!("unexpected existing sidecar"),
        };
        let error = match begin_launch(&state, true) {
            Err(error) => error,
            Ok(_) => panic!("overlapping launch was accepted"),
        };
        assert!(error.contains("already in progress"));
        finish_launch(&state, &session, false);
        assert!(matches!(
            begin_launch(&state, true).unwrap(),
            LaunchDecision::Start(_)
        ));
        state.stop();
    }

    #[test]
    fn payload_validation_requires_sidecar_manifest_models_and_nonempty_files() {
        let (root, paths) = fixture_paths("payload");
        assert!(validate_required_payload(&paths.target, &paths.resource_dir).is_ok());

        fs::remove_file(paths.resource_dir.join("models/fixture.bin")).unwrap();
        assert!(
            validate_required_payload(&paths.target, &paths.resource_dir)
                .unwrap_err()
                .contains("required lens file is missing")
        );
        fs::write(paths.resource_dir.join("models/fixture.bin"), b"").unwrap();
        assert!(
            validate_required_payload(&paths.target, &paths.resource_dir)
                .unwrap_err()
                .contains("required lens file is empty")
        );
        fs::remove_file(paths.resource_dir.join("manifest.json")).unwrap();
        assert!(
            validate_required_payload(&paths.target, &paths.resource_dir)
                .unwrap_err()
                .contains("manifest.json is missing")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cache_and_log_paths_support_fresh_existing_and_append_only_launches() {
        let root = unique_root("writable-paths");
        let cache = root.join("cache");
        ensure_writable_directory(&cache, "lens cache", "first").unwrap();
        fs::write(cache.join("preserved.bin"), b"existing cache").unwrap();
        ensure_writable_directory(&cache, "lens cache", "second").unwrap();
        assert_eq!(
            fs::read(cache.join("preserved.bin")).unwrap(),
            b"existing cache"
        );

        let log = root.join("logs/chunk-lens.log");
        fs::create_dir_all(log.parent().unwrap()).unwrap();
        append_diagnostic(
            &log,
            "secret-token",
            "startup_session=one token=secret-token",
        );
        append_diagnostic(&log, "secret-token", "startup_session=two");
        let contents = fs::read_to_string(&log).unwrap();
        assert!(contents.contains("startup_session=one token=[REDACTED]"));
        assert!(contents.contains("startup_session=two"));
        assert!(!contents.contains("secret-token"));

        let blocker = root.join("not-a-directory");
        fs::write(&blocker, b"file").unwrap();
        let error = ensure_writable_directory(&blocker.join("nested"), "lens cache", "blocked")
            .unwrap_err();
        assert!(error.contains("could not be created"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn windows_exit_codes_are_zero_padded_and_symbolic() {
        let detail = format_exit_code(0xC000_013A_u32 as i32);
        assert!(detail.contains("exit_code_decimal=-1073741510"));
        assert!(detail.contains("exit_code_raw=3221225786"));
        assert!(detail.contains("exit_code_hex=0xC000013A"));
        assert!(detail.contains("STATUS_CONTROL_C_EXIT"));
    }

    #[test]
    fn retry_classification_retries_only_recoverable_early_exits() {
        #[cfg(unix)]
        use std::os::unix::process::ExitStatusExt;
        #[cfg(windows)]
        use std::os::windows::process::ExitStatusExt;

        #[cfg(unix)]
        let exit_one = ExitStatus::from_raw(1 << 8);
        #[cfg(windows)]
        let exit_one = ExitStatus::from_raw(1);
        #[cfg(unix)]
        let control_exit = ExitStatus::from_raw(2 << 8);
        #[cfg(windows)]
        let control_exit = ExitStatus::from_raw(0xC000_013A);

        assert_eq!(retry_disposition(exit_one), RetryDisposition::Retry);
        assert_eq!(retry_disposition(control_exit), RetryDisposition::Fatal);
    }

    #[test]
    fn log_redaction_never_emits_the_lens_token() {
        let token = "secret-lens-token";
        let redacted = redact_secret(
            &format!("url=ws://127.0.0.1/?token={token} token={token}"),
            token,
        );
        assert!(!redacted.contains(token));
        assert_eq!(redacted.matches("[REDACTED]").count(), 2);
    }

    #[cfg(windows)]
    #[test]
    fn windows_process_fixture_child() {
        let Ok(mode) = env::var("CHUNK_LENS_PROCESS_FIXTURE") else {
            return;
        };
        let has_console =
            unsafe { !windows_sys::Win32::System::Console::GetConsoleWindow().is_null() };
        writeln!(std::io::stdout(), "fixture_stdout console={has_console}").unwrap();
        writeln!(std::io::stderr(), "fixture_stderr").unwrap();
        if mode == "exit" {
            process::exit(23);
        }
        thread::sleep(Duration::from_secs(60));
    }

    #[cfg(windows)]
    #[test]
    fn production_windows_spawn_policy_has_no_console_and_preserves_logs_and_cleanup() {
        assert_eq!(
            sidecar_creation_flags(),
            windows_sys::Win32::System::Threading::CREATE_NO_WINDOW
        );
        let root = unique_root("windows-process");
        fs::create_dir_all(&root).unwrap();
        let make_spec = |mode: &str| LaunchSpec {
            target: LaunchTarget {
                path: env::current_exe().unwrap(),
                args: vec![
                    "--exact".into(),
                    "lens_service::tests::windows_process_fixture_child".into(),
                    "--nocapture".into(),
                ],
                extra_env: vec![("CHUNK_LENS_PROCESS_FIXTURE".into(), mode.into())],
            },
            port: 1,
            token: launch_token(),
            cache_dir: root.clone(),
            resource_dir: root.clone(),
            log_path: root.join(format!("{mode}.log")),
            backend: "cuda",
            session: session_marker(),
            attempt: 1,
            app_version: "test".into(),
        };

        let stay_spec = make_spec("stay");
        let mut child = spawn_child(&stay_spec).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut log = String::new();
        while Instant::now() < deadline {
            log = fs::read_to_string(&stay_spec.log_path).unwrap_or_default();
            if log.contains("fixture_stderr") {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(log.contains("fixture_stdout console=false"), "{log}");
        assert!(log.contains("fixture_stderr"), "{log}");
        assert!(child.try_wait().unwrap().is_none());
        child.kill().unwrap();
        let killed = child.wait().unwrap();
        assert!(!killed.success());
        assert!(child.try_wait().unwrap().is_some());

        let exit_spec = make_spec("exit");
        let status = spawn_child(&exit_spec).unwrap().wait().unwrap();
        assert_eq!(status.code(), Some(23));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_spawn_policy_is_a_no_op() {
        assert_eq!(sidecar_creation_flags(), 0);
    }
}
