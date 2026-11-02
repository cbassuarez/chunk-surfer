//! Steam's flat C ABI is loaded only from the packaged/runtime search paths.
//! One worker owns initialization, callback dispatch, writes and shutdown. No
//! SDK library or AppID is bundled by this module; ordinary desktop play works
//! without Steam. ABI references: Valve's public source-sdk-2013 steam_api.h,
//! steam_api_internal.h, steam_api_flat.h and isteamuserstats.h.
use libloading::Library;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    ffi::{CStr, CString},
    os::raw::{c_char, c_void},
    path::PathBuf,
    sync::{mpsc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

#[derive(Deserialize)]
struct Schema {
    #[serde(rename = "appId")]
    app_id: Option<u32>,
    achievements: Vec<String>,
    stats: Vec<String>,
}
fn schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        serde_json::from_str(include_str!("../steam-achievements-v1.json"))
            .expect("generated Steam schema")
    })
}
fn allowed(id: &str, achievement: bool) -> bool {
    id.len() < 128
        && if achievement {
            schema().achievements.iter()
        } else {
            schema().stats.iter()
        }
        .any(|known| known == id)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    ready: bool,
    reason: Option<String>,
    app_id: Option<u32>,
    interface_version: Option<String>,
    achievements: Vec<String>,
    unlock_times: BTreeMap<String, u32>,
    stats: BTreeMap<String, i32>,
}
impl Snapshot {
    fn unavailable(reason: &str) -> Self {
        Self {
            ready: false,
            reason: Some(reason.into()),
            app_id: None,
            interface_version: None,
            achievements: vec![],
            unlock_times: BTreeMap::new(),
            stats: BTreeMap::new(),
        }
    }
}
#[derive(Clone)]
enum Operation {
    Initialize,
    Achievement(String),
    Stat(String, i32),
    Flush,
    Persona,
    Shutdown,
}
struct Request {
    operation: Operation,
    reply: mpsc::Sender<serde_json::Value>,
}
#[derive(Default)]
pub struct SteamAchievementsState {
    sender: Mutex<Option<mpsc::Sender<Request>>>,
}

#[cfg(target_os = "windows")]
const LIBRARY: &str = "steam_api64.dll";
#[cfg(target_os = "macos")]
const LIBRARY: &str = "libsteam_api.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const LIBRARY: &str = "libsteam_api.so";
fn candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut paths = vec![];
    if let Ok(root) = app.path().resource_dir() {
        paths.push(root.join("steamworks").join(LIBRARY));
        paths.push(root.join(LIBRARY));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(root) = exe.parent() {
            paths.push(root.join("steamworks").join(LIBRARY));
            paths.push(root.join(LIBRARY));
        }
    }
    // A local SDK may be staged here; only an existing file is considered.
    paths.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("steamworks-runtime")
            .join(LIBRARY),
    );
    paths
}
impl SteamAchievementsState {
    fn request(
        &self,
        app: &tauri::AppHandle,
        operation: Operation,
    ) -> Result<serde_json::Value, String> {
        let sender = {
            let mut owner = self.sender.lock().map_err(|_| "Steam owner unavailable")?;
            if owner.is_none() {
                let (tx, rx) = mpsc::channel();
                let paths = candidates(app);
                thread::Builder::new()
                    .name("steam-achievements".into())
                    .spawn(move || worker(rx, paths))
                    .map_err(|_| "Steam worker unavailable")?;
                *owner = Some(tx);
            }
            owner.as_ref().unwrap().clone()
        };
        let (tx, rx) = mpsc::channel();
        sender
            .send(Request {
                operation,
                reply: tx,
            })
            .map_err(|_| "Steam worker closed")?;
        rx.recv_timeout(Duration::from_secs(12))
            .map_err(|_| "Steam response timed out".into())
    }
    pub fn stop(&self) {
        if let Ok(mut owner) = self.sender.lock() {
            if let Some(sender) = owner.take() {
                let (tx, rx) = mpsc::channel();
                let _ = sender.send(Request {
                    operation: Operation::Shutdown,
                    reply: tx,
                });
                let _ = rx.recv_timeout(Duration::from_secs(2));
            }
        }
    }
}

#[repr(C)]
struct Callback {
    user: i32,
    kind: i32,
    data: *mut u8,
    bytes: i32,
}
type Init = unsafe extern "C" fn() -> bool;
type Shutdown = unsafe extern "C" fn();
type Accessor = unsafe extern "C" fn() -> *mut c_void;
type GetPipe = unsafe extern "C" fn() -> i32;
type DispatchInit = unsafe extern "C" fn();
type RunFrame = unsafe extern "C" fn(i32);
type NextCallback = unsafe extern "C" fn(i32, *mut Callback) -> bool;
type FreeCallback = unsafe extern "C" fn(i32);
type GetAppId = unsafe extern "C" fn(*mut c_void) -> u32;
type GetAchievement = unsafe extern "C" fn(*mut c_void, *const c_char, *mut bool, *mut u32) -> bool;
type SetAchievement = unsafe extern "C" fn(*mut c_void, *const c_char) -> bool;
type GetStat = unsafe extern "C" fn(*mut c_void, *const c_char, *mut i32) -> bool;
type SetStat = unsafe extern "C" fn(*mut c_void, *const c_char, i32) -> bool;
type Store = unsafe extern "C" fn(*mut c_void) -> bool;
type RequestStats = unsafe extern "C" fn(*mut c_void) -> bool;
type Persona = unsafe extern "C" fn(*mut c_void) -> *const c_char;
unsafe fn symbol<T: Copy>(lib: &Library, name: &[u8]) -> Result<T, String> {
    lib.get::<T>(name)
        .map(|p| *p)
        .map_err(|_| "STEAM_SYMBOLS_UNAVAILABLE".into())
}
fn stored_result(kind: i32, bytes: &[u8], app_id: u32) -> Option<bool> {
    if kind != 1102 || bytes.len() < 12 {
        return None;
    }
    let game = u64::from_ne_bytes(bytes[0..8].try_into().ok()?);
    let result = i32::from_ne_bytes(bytes[8..12].try_into().ok()?);
    (game == app_id as u64).then_some(result == 1)
}
struct Client {
    _library: Library,
    shutdown: Shutdown,
    stats: *mut c_void,
    app_id: u32,
    expected_app_id: Option<u32>,
    version: String,
    pipe: i32,
    run_frame: RunFrame,
    next: NextCallback,
    free: FreeCallback,
    get_achievement: GetAchievement,
    set_achievement: SetAchievement,
    get_stat: GetStat,
    set_stat: SetStat,
    store: Store,
    request_stats: Option<RequestStats>,
    friends: Option<*mut c_void>,
    persona: Option<Persona>,
    confirmed: Snapshot,
    dirty: bool,
    in_flight: bool,
    store_result: Option<bool>,
    initialized: bool,
}
impl Drop for Client {
    fn drop(&mut self) {
        unsafe {
            (self.shutdown)();
        }
    }
}
impl Client {
    unsafe fn load(path: &PathBuf, expected_app_id: Option<u32>) -> Result<Self, String> {
        let library = Library::new(path).map_err(|_| "STEAM_RUNTIME_UNAVAILABLE")?;
        let init: Init = symbol(&library, b"SteamAPI_Init\0")?;
        let shutdown: Shutdown = symbol(&library, b"SteamAPI_Shutdown\0")?;
        // Resolve every required symbol before initializing, so failed ABI
        // discovery cannot leave an initialized Steam client without an owner.
        let dispatch_init: DispatchInit = symbol(&library, b"SteamAPI_ManualDispatch_Init\0")?;
        let get_pipe: GetPipe = symbol(&library, b"SteamAPI_GetHSteamPipe\0")?;
        let run_frame = symbol(&library, b"SteamAPI_ManualDispatch_RunFrame\0")?;
        let next = symbol(&library, b"SteamAPI_ManualDispatch_GetNextCallback\0")?;
        let free = symbol(&library, b"SteamAPI_ManualDispatch_FreeLastCallback\0")?;
        let (access, version) =
            if let Ok(access) = symbol::<Accessor>(&library, b"SteamAPI_SteamUserStats_v013\0") {
                (access, "013")
            } else {
                (
                    symbol::<Accessor>(&library, b"SteamAPI_SteamUserStats_v012\0")?,
                    "012",
                )
            };
        let utils: Accessor = symbol(&library, b"SteamAPI_SteamUtils_v010\0")?;
        let get_app: GetAppId = symbol(&library, b"SteamAPI_ISteamUtils_GetAppID\0")?;
        let get_achievement = symbol(
            &library,
            b"SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime\0",
        )?;
        let set_achievement = symbol(&library, b"SteamAPI_ISteamUserStats_SetAchievement\0")?;
        let get_stat = symbol(&library, b"SteamAPI_ISteamUserStats_GetStatInt32\0")?;
        let set_stat = symbol(&library, b"SteamAPI_ISteamUserStats_SetStatInt32\0")?;
        let store = symbol(&library, b"SteamAPI_ISteamUserStats_StoreStats\0")?;
        let request_stats = if version == "012" {
            Some(symbol(
                &library,
                b"SteamAPI_ISteamUserStats_RequestCurrentStats\0",
            )?)
        } else {
            None
        };
        let friends = symbol::<Accessor>(&library, b"SteamAPI_SteamFriends_v017\0").ok();
        let persona = symbol::<Persona>(&library, b"SteamAPI_ISteamFriends_GetPersonaName\0").ok();
        if !init() {
            return Err("STEAM_CLIENT_UNAVAILABLE".into());
        }
        let stats = access();
        let utils = utils();
        if stats.is_null() || utils.is_null() {
            shutdown();
            return Err("STEAM_INTERFACES_UNAVAILABLE".into());
        }
        let app_id = get_app(utils);
        // Never use the public SDK sample application as a fallback target.
        if app_id == 0 || app_id == 480 {
            shutdown();
            return Err("STEAM_APP_NOT_CONFIGURED".into());
        }
        dispatch_init();
        let pipe = get_pipe();
        if pipe == 0 {
            shutdown();
            return Err("STEAM_PIPE_UNAVAILABLE".into());
        }
        let mut confirmed = Snapshot::unavailable("STEAM_STATS_NOT_READY");
        confirmed.app_id = Some(app_id);
        confirmed.interface_version = Some(version.into());
        Ok(Self {
            _library: library,
            shutdown,
            stats,
            app_id,
            expected_app_id,
            version: version.into(),
            pipe,
            run_frame,
            next,
            free,
            get_achievement,
            set_achievement,
            get_stat,
            set_stat,
            store,
            request_stats,
            friends: friends.map(|f| f()),
            persona,
            confirmed,
            dirty: false,
            in_flight: false,
            store_result: None,
            initialized: false,
        })
    }
    fn pump(&mut self) {
        unsafe {
            (self.run_frame)(self.pipe);
            let mut callback = Callback {
                user: 0,
                kind: 0,
                data: std::ptr::null_mut(),
                bytes: 0,
            };
            for _ in 0..256 {
                if !(self.next)(self.pipe, &mut callback) {
                    break;
                }
                if !callback.data.is_null() && callback.bytes >= 0 && callback.bytes <= 65536 {
                    let bytes = std::slice::from_raw_parts(callback.data, callback.bytes as usize);
                    if let Some(ok) = stored_result(callback.kind, bytes, self.app_id) {
                        if self.in_flight {
                            self.in_flight = false;
                            self.store_result = Some(ok);
                            if ok {
                                self.dirty = false;
                                self.refresh();
                            } else {
                                self.dirty = true;
                            }
                        }
                    }
                }
                (self.free)(self.pipe);
            }
        }
    }
    fn refresh(&mut self) -> bool {
        let mut snapshot = Snapshot::unavailable("STEAM_DEFINITIONS_NOT_READY");
        snapshot.app_id = Some(self.app_id);
        snapshot.interface_version = Some(self.version.clone());
        for id in &schema().achievements {
            let name = CString::new(id.as_str()).unwrap();
            let mut unlocked = false;
            let mut at = 0;
            if !unsafe { (self.get_achievement)(self.stats, name.as_ptr(), &mut unlocked, &mut at) }
            {
                return false;
            }
            if unlocked {
                snapshot.achievements.push(id.clone());
                snapshot.unlock_times.insert(id.clone(), at);
            }
        }
        for id in &schema().stats {
            let name = CString::new(id.as_str()).unwrap();
            let mut value = 0;
            if !unsafe { (self.get_stat)(self.stats, name.as_ptr(), &mut value) } {
                return false;
            }
            snapshot.stats.insert(id.clone(), value.max(0));
        }
        snapshot.ready = true;
        snapshot.reason = None;
        self.confirmed = snapshot;
        true
    }
    fn initialize(&mut self) -> Snapshot {
        if self.expected_app_id != Some(self.app_id) {
            let mut snapshot = self.confirmed.clone();
            snapshot.ready = false;
            snapshot.reason = Some(
                if self.expected_app_id.is_none() {
                    "STEAM_APP_NOT_CONFIGURED"
                } else {
                    "STEAM_APP_ID_MISMATCH"
                }
                .into(),
            );
            return snapshot;
        }
        if self.initialized {
            let available = if self.dirty || self.in_flight {
                // Check availability without promoting unconfirmed cache
                // writes into the snapshot used as remote evidence.
                schema()
                    .stats
                    .first()
                    .map(|id| {
                        let name = CString::new(id.as_str()).unwrap();
                        let mut value = 0;
                        unsafe { (self.get_stat)(self.stats, name.as_ptr(), &mut value) }
                    })
                    .unwrap_or(true)
            } else {
                self.refresh()
            };
            if !available {
                if let Some(request) = self.request_stats {
                    unsafe {
                        request(self.stats);
                    }
                }
                let mut snapshot = self.confirmed.clone();
                snapshot.ready = false;
                snapshot.reason = Some("STEAM_STATS_UNAVAILABLE".into());
                return snapshot;
            }
            return self.confirmed.clone();
        }
        if let Some(request) = self.request_stats {
            unsafe {
                request(self.stats);
            }
        }
        let until = Instant::now() + Duration::from_secs(3);
        loop {
            self.pump();
            if self.refresh() {
                self.initialized = true;
                break;
            }
            if Instant::now() >= until {
                break;
            }
            thread::sleep(Duration::from_millis(25));
        }
        self.confirmed.clone()
    }
    fn achievement(&mut self, id: &str) -> bool {
        if !allowed(id, true) || !self.initialized || self.in_flight {
            return false;
        }
        let name = CString::new(id).unwrap();
        let ok = unsafe { (self.set_achievement)(self.stats, name.as_ptr()) };
        self.dirty |= ok;
        ok
    }
    fn stat(&mut self, id: &str, value: i32) -> bool {
        if !allowed(id, false) || value < 0 || !self.initialized || self.in_flight {
            return false;
        }
        let name = CString::new(id).unwrap();
        let mut current = 0;
        if !unsafe { (self.get_stat)(self.stats, name.as_ptr(), &mut current) } {
            return false;
        }
        let ok = unsafe { (self.set_stat)(self.stats, name.as_ptr(), value.max(current)) };
        self.dirty |= ok;
        ok
    }
    fn flush(&mut self) -> bool {
        self.pump();
        if !self.initialized {
            return false;
        }
        if !self.in_flight {
            if !self.dirty {
                return true;
            }
            self.store_result = None;
            if !unsafe { (self.store)(self.stats) } {
                return false;
            }
            self.in_flight = true;
        }
        let until = Instant::now() + Duration::from_secs(8);
        while self.in_flight && Instant::now() < until {
            self.pump();
            thread::sleep(Duration::from_millis(20));
        }
        // A timeout leaves the outstanding transaction owned by the worker;
        // subsequent writes are rejected until its callback resolves. This
        // prevents a late old acknowledgement from clearing a newer batch.
        self.store_result == Some(true) && !self.in_flight
    }
    fn persona_name(&self) -> Option<String> {
        let (Some(friends), Some(persona)) = (self.friends, self.persona) else {
            return None;
        };
        if friends.is_null() {
            return None;
        }
        let p = unsafe { persona(friends) };
        if p.is_null() {
            return None;
        }
        Some(unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned())
    }
}
fn worker(receiver: mpsc::Receiver<Request>, paths: Vec<PathBuf>) {
    let mut client: Option<Client> = None;
    let mut retry_at = Instant::now();
    let mut failure = "STEAM_RUNTIME_UNAVAILABLE".to_string();
    loop {
        if let Some(client) = client.as_mut() {
            client.pump();
        }
        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(request) => {
                if matches!(request.operation, Operation::Shutdown) {
                    drop(client.take());
                    let _ = request.reply.send(serde_json::json!(true));
                    break;
                }
                if client.is_none() && Instant::now() >= retry_at {
                    for path in paths.iter().filter(|p| p.is_file()) {
                        match unsafe { Client::load(path, schema().app_id) } {
                            Ok(value) => {
                                client = Some(value);
                                break;
                            }
                            Err(reason) => failure = reason,
                        }
                    }
                    retry_at = Instant::now() + Duration::from_secs(5);
                }
                let value = if let Some(client) = client.as_mut() {
                    match request.operation {
                        Operation::Initialize => serde_json::to_value(client.initialize()).unwrap(),
                        Operation::Achievement(id) => serde_json::json!(client.achievement(&id)),
                        Operation::Stat(id, value) => serde_json::json!(client.stat(&id, value)),
                        Operation::Flush => serde_json::json!(client.flush()),
                        Operation::Persona => serde_json::json!(client.persona_name()),
                        Operation::Shutdown => unreachable!(),
                    }
                } else {
                    match request.operation {
                        Operation::Initialize => {
                            serde_json::to_value(Snapshot::unavailable(&failure)).unwrap()
                        }
                        Operation::Persona => serde_json::Value::Null,
                        _ => serde_json::json!(false),
                    }
                };
                let _ = request.reply.send(value);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => break,
        }
    }
}
async fn command(app: tauri::AppHandle, operation: Operation) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SteamAchievementsState>()
            .request(&app, operation)
    })
    .await
    .map_err(|_| "Steam command unavailable".to_string())?
}
#[tauri::command]
pub async fn chunk_steam_initialize(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    command(app, Operation::Initialize).await
}
#[tauri::command]
pub async fn chunk_steam_unlock(
    app: tauri::AppHandle,
    id: String,
) -> Result<serde_json::Value, String> {
    if !allowed(&id, true) {
        return Ok(serde_json::json!(false));
    }
    command(app, Operation::Achievement(id)).await
}
#[tauri::command]
pub async fn chunk_steam_set_stat(
    app: tauri::AppHandle,
    id: String,
    value: i32,
) -> Result<serde_json::Value, String> {
    if !allowed(&id, false) || value < 0 {
        return Ok(serde_json::json!(false));
    }
    command(app, Operation::Stat(id, value)).await
}
#[tauri::command]
pub async fn chunk_steam_flush(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    command(app, Operation::Flush).await
}
pub fn persona_name(app: &tauri::AppHandle) -> Option<String> {
    app.state::<SteamAchievementsState>()
        .request(app, Operation::Persona)
        .ok()?
        .as_str()
        .map(str::to_owned)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    fn fixture(flags: &[&str]) -> PathBuf {
        static SERIAL: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = SERIAL.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("chunk-steam-abi-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let source =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/steam_api_fixture.c");
        let path = dir.join(if cfg!(target_os = "macos") {
            "fixture.dylib"
        } else {
            "fixture.so"
        });
        let result = std::process::Command::new("cc")
            .arg(if cfg!(target_os = "macos") {
                "-dynamiclib"
            } else {
                "-shared"
            })
            .arg("-fPIC")
            .args(flags)
            .arg(source)
            .arg("-o")
            .arg(&path)
            .status()
            .unwrap();
        assert!(result.success());
        path
    }
    #[test]
    fn allowlist_rejects_unknowns_and_cross_kind() {
        assert!(allowed("ACH_FIRST_TAKE", true));
        assert!(!allowed("ACH_NOT_REAL", true));
        assert!(!allowed("STAT_RUNS_STARTED", true));
        assert!(allowed("STAT_RUNS_STARTED", false));
        assert!(!allowed("ACH_FIRST_TAKE\0OTHER", true));
    }
    #[test]
    fn acknowledgements_require_exact_callback_app_and_success() {
        let mut data = vec![];
        data.extend(123456u64.to_ne_bytes());
        data.extend(1i32.to_ne_bytes());
        assert_eq!(stored_result(1102, &data, 123456), Some(true));
        assert_eq!(stored_result(1102, &data, 480), None);
        assert_eq!(stored_result(1103, &data, 123456), None);
        assert_eq!(stored_result(1102, &data[..8], 123456), None);
        data[8..12].copy_from_slice(&8i32.to_ne_bytes());
        assert_eq!(stored_result(1102, &data, 123456), Some(false));
    }
    #[test]
    fn callback_offsets_match_flat_abi() {
        let c = Callback {
            user: 0,
            kind: 0,
            data: std::ptr::null_mut(),
            bytes: 0,
        };
        let start = &c as *const _ as usize;
        assert_eq!(&c.kind as *const _ as usize - start, 4);
        assert_eq!(&c.data as *const _ as usize - start, 8);
        assert_eq!(
            &c.bytes as *const _ as usize - start,
            8 + std::mem::size_of::<*mut u8>()
        );
    }
    #[test]
    fn no_runtime_is_an_honest_unavailable_snapshot() {
        let (tx, rx) = mpsc::channel();
        let worker = thread::spawn(move || super::worker(rx, vec![]));
        let (reply, received) = mpsc::channel();
        tx.send(Request {
            operation: Operation::Initialize,
            reply,
        })
        .unwrap();
        let value = received.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(value["ready"], false);
        assert_eq!(value["reason"], "STEAM_RUNTIME_UNAVAILABLE");
        drop(tx);
        worker.join().unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn real_flat_abi_dispatch_confirms_only_success_and_preserves_failed_store_work() {
        let path = fixture(&[]);
        unsafe {
            let probe = Library::new(&path).unwrap();
            let set_mode: unsafe extern "C" fn(i32) = symbol(&probe, b"FixtureSetMode\0").unwrap();
            let requests: unsafe extern "C" fn() -> i32 =
                symbol(&probe, b"FixtureRequests\0").unwrap();
            let frees: unsafe extern "C" fn() -> i32 = symbol(&probe, b"FixtureFrees\0").unwrap();
            let initializations: unsafe extern "C" fn() -> i32 =
                symbol(&probe, b"FixtureInitializations\0").unwrap();
            let shutdowns: unsafe extern "C" fn() -> i32 =
                symbol(&probe, b"FixtureShutdowns\0").unwrap();
            let mut client = Client::load(&path, Some(123456)).unwrap();
            assert!(client.initialize().ready);
            assert_eq!(client.version, "013");
            assert_eq!(requests(), 0);
            assert_eq!(client.persona_name().as_deref(), Some("Fixture User"));
            assert!(!client.achievement("ACH_NOT_REAL"));
            assert!(!client.dirty);
            assert!(client.achievement("ACH_FIRST_TAKE"));
            assert!(
                !client
                    .initialize()
                    .achievements
                    .contains(&"ACH_FIRST_TAKE".into()),
                "unconfirmed cache write leaked as remote truth"
            );
            assert!(client.flush());
            assert_eq!(frees(), 1);
            assert!(client
                .initialize()
                .achievements
                .contains(&"ACH_FIRST_TAKE".into()));
            assert_eq!(client.confirmed.unlock_times["ACH_FIRST_TAKE"], 12345);
            assert!(client.stat("STAT_TAKES_COMPLETED", 5));
            set_mode(1);
            assert!(!client.flush());
            assert!(client.dirty);
            assert_eq!(client.confirmed.stats["STAT_TAKES_COMPLETED"], 0);
            set_mode(2);
            assert!(!client.flush());
            assert!(client.dirty);
            assert_eq!(client.confirmed.stats["STAT_TAKES_COMPLETED"], 0);
            set_mode(0);
            assert!(client.flush());
            assert_eq!(client.confirmed.stats["STAT_TAKES_COMPLETED"], 5);
            assert!(client.stat("STAT_TAKES_COMPLETED", 3));
            assert!(client.flush());
            assert_eq!(client.confirmed.stats["STAT_TAKES_COMPLETED"], 5);
            client.in_flight = true;
            assert!(!client.achievement("ACH_COFFEE"));
            assert!(!client.stat("STAT_TAKES_COMPLETED", 6));
            client.in_flight = false;
            assert_eq!(initializations(), 1);
            drop(client);
            assert_eq!(shutdowns(), 1);
            drop(probe);
        }
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn legacy_interface_requests_stats_and_sample_application_is_refused() {
        let path = fixture(&["-DMOCK_LEGACY"]);
        unsafe {
            let mut client = Client::load(&path, Some(123456)).unwrap();
            assert!(client.initialize().ready);
            assert_eq!(client.version, "012");
            let requests: unsafe extern "C" fn() -> i32 =
                symbol(&client._library, b"FixtureRequests\0").unwrap();
            assert_eq!(requests(), 1);
        }
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
        let path = fixture(&["-DMOCK_APP_ID=480"]);
        assert!(
            matches!(unsafe{Client::load(&path,Some(480))},Err(reason) if reason=="STEAM_APP_NOT_CONFIGURED")
        );
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn unconfigured_or_foreign_app_cannot_initialize_writes_but_persona_remains_read_only() {
        for expected in [None, Some(999999)] {
            let path = fixture(&[]);
            unsafe {
                let mut client = Client::load(&path, expected).unwrap();
                let snapshot = client.initialize();
                assert!(!snapshot.ready);
                assert_eq!(
                    snapshot.reason.as_deref(),
                    Some(if expected.is_none() {
                        "STEAM_APP_NOT_CONFIGURED"
                    } else {
                        "STEAM_APP_ID_MISMATCH"
                    })
                );
                assert!(!client.achievement("ACH_FIRST_TAKE"));
                assert!(!client.stat("STAT_TAKES_COMPLETED", 1));
                assert!(!client.flush());
                assert_eq!(client.persona_name().as_deref(), Some("Fixture User"));
                let requests: unsafe extern "C" fn() -> i32 =
                    symbol(&client._library, b"FixtureRequests\0").unwrap();
                assert_eq!(requests(), 0);
            }
            std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
        }
    }
    #[cfg(unix)]
    #[test]
    fn clean_snapshots_refresh_cached_progress_and_lost_readiness_does_not_claim_steam() {
        let path = fixture(&[]);
        unsafe {
            let mut client = Client::load(&path, Some(123456)).unwrap();
            assert!(client.initialize().ready);
            let grant: unsafe extern "C" fn() =
                symbol(&client._library, b"FixtureGrantCachedProgress\0").unwrap();
            let set_mode: unsafe extern "C" fn(i32) =
                symbol(&client._library, b"FixtureSetMode\0").unwrap();
            grant();
            let snapshot = client.initialize();
            assert!(snapshot.achievements.contains(&"ACH_FIRST_TAKE".into()));
            assert_eq!(snapshot.stats["STAT_TAKES_COMPLETED"], 8);
            set_mode(5);
            let unavailable = client.initialize();
            assert!(!unavailable.ready);
            assert_eq!(
                unavailable.reason.as_deref(),
                Some("STEAM_STATS_UNAVAILABLE")
            );
            set_mode(0);
            assert!(client.initialize().ready);
        }
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
