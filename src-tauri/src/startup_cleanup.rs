//! Retire only recognisable, orphaned helpers from this installation.
//! A slow or live game is not evidence that it is safe to terminate it.
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Clone, Debug, PartialEq, Eq)]
struct ProcessRecord {
    pid: u32,
    parent: u32,
    command: String,
}

fn executable_command(command: &str, path: &Path) -> bool {
    let expected = path.to_string_lossy();
    let command = command.trim();
    let (command, expected) = if cfg!(windows) {
        (command.to_ascii_lowercase(), expected.to_ascii_lowercase())
    } else {
        (command.to_string(), expected.to_string())
    };
    command == expected
        || command
            .strip_prefix(&expected)
            .is_some_and(|suffix| suffix.starts_with(char::is_whitespace))
}

fn candidates<'a>(
    records: &'a [ProcessRecord],
    helpers: &[PathBuf],
    own: u32,
) -> Vec<&'a ProcessRecord> {
    let alive: HashSet<_> = records.iter().map(|record| record.pid).collect();
    records.iter().filter(|record| {
        record.pid > 1 && record.pid != own && record.parent != own
            // launchd/init adopts orphans on Unix. Elsewhere an absent parent
            // is required; a reused/live parent PID deliberately fails closed.
            && ((cfg!(unix) && record.parent == 1) || (record.parent > 1 && !alive.contains(&record.parent)))
            && helpers.iter().any(|path| executable_command(&record.command, path))
    }).collect()
}

#[cfg(unix)]
fn process_snapshot() -> Vec<ProcessRecord> {
    let Ok(output) = std::process::Command::new("ps")
        .args(["-axo", "pid=,ppid=,command="])
        .output()
    else {
        return vec![];
    };
    if !output.status.success() {
        return vec![];
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (pid, rest) = line.split_once(char::is_whitespace)?;
            let (parent, command) = rest.trim_start().split_once(char::is_whitespace)?;
            Some(ProcessRecord {
                pid: pid.parse().ok()?,
                parent: parent.parse().ok()?,
                command: command.trim().to_string(),
            })
        })
        .collect()
}

#[cfg(windows)]
fn process_snapshot() -> Vec<ProcessRecord> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };
    let mut records = vec![];
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return records;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut valid = Process32FirstW(snapshot, &mut entry) != 0;
        while valid {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
            let mut buffer = [0u16; 32768];
            let mut length = buffer.len() as u32;
            let command = if !handle.is_null()
                && QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length) != 0
            {
                String::from_utf16_lossy(&buffer[..length as usize])
            } else {
                String::new()
            };
            if !handle.is_null() {
                CloseHandle(handle);
            }
            // Keep inaccessible processes too: an unreadable live parent must
            // never be mistaken for a dead one.
            records.push(ProcessRecord {
                pid: entry.th32ProcessID,
                parent: entry.th32ParentProcessID,
                command,
            });
            valid = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }
    records
}

#[cfg(not(any(unix, windows)))]
fn process_snapshot() -> Vec<ProcessRecord> {
    vec![]
}

#[cfg(unix)]
fn terminate(record: &ProcessRecord) -> bool {
    if unsafe { libc::kill(record.pid as libc::pid_t, libc::SIGTERM) } != 0 {
        return false;
    }
    for _ in 0..8 {
        std::thread::sleep(std::time::Duration::from_millis(100));
        if !process_snapshot().iter().any(|current| current == record) {
            return true;
        }
    }
    // A dead parent's helper can itself be hung. Escalate only if its identity
    // and orphaned parent relation still match the exact pre-signal record.
    if process_snapshot().iter().any(|current| current == record) {
        return unsafe { libc::kill(record.pid as libc::pid_t, libc::SIGKILL) == 0 };
    }
    true
}

#[cfg(windows)]
fn terminate(record: &ProcessRecord) -> bool {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
            PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
        },
    };
    unsafe {
        let handle = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
            0,
            record.pid,
        );
        if handle.is_null() {
            return false;
        }
        let mut buffer = [0u16; 32768];
        let mut length = buffer.len() as u32;
        let same = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length) != 0
            && String::from_utf16_lossy(&buffer[..length as usize])
                .eq_ignore_ascii_case(&record.command);
        let stopped = same && TerminateProcess(handle, 0) != 0;
        CloseHandle(handle);
        stopped
    }
}

#[cfg(not(any(unix, windows)))]
fn terminate(_: &ProcessRecord) -> bool {
    false
}

pub fn recover_orphaned_helpers(app: &tauri::AppHandle) {
    let mut helpers = vec![];
    let name = if cfg!(windows) {
        "chunk-lens.exe"
    } else {
        "chunk-lens"
    };
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            helpers.push(parent.join(name));
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        helpers.push(resources.join(name));
    }
    if let Some(path) = std::env::var_os("CHUNK_LENS_SIDECAR").map(PathBuf::from) {
        if path.file_name().is_some_and(|file| file == name) {
            helpers.push(path);
        }
    }
    // Scanning a machine does not delay the window or the first game frame.
    std::thread::spawn(move || {
        let records = process_snapshot();
        for record in candidates(&records, &helpers, std::process::id()) {
            // Recheck immediately before signalling: a live/reparented helper
            // or a reused PID is left alone.
            let fresh = process_snapshot();
            if candidates(&fresh, &helpers, std::process::id())
                .iter()
                .any(|current| *current == record)
                && terminate(record)
            {
                tauri_plugin_log::log::info!("retired orphaned game helper pid={}", record.pid);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn record(pid: u32, parent: u32, command: &str) -> ProcessRecord {
        ProcessRecord {
            pid,
            parent,
            command: command.into(),
        }
    }
    #[test]
    fn only_exact_orphaned_helpers_are_selected() {
        let helper = PathBuf::from("/Applications/Chunk Surfer.app/Contents/MacOS/chunk-lens");
        let name = helper.to_str().unwrap();
        let records = vec![
            record(
                90,
                1,
                "/Applications/Chunk Surfer.app/Contents/MacOS/chunk-surfer",
            ),
            record(91, 90, name),
            record(92, 700, name),
            record(93, 1, "/Other.app/chunk-lens"),
            record(94, 1, "/usr/bin/node vite"),
            record(
                95,
                1,
                "/Applications/Chunk Surfer.app/Contents/MacOS/chunk-lens-copy",
            ),
            record(96, 90, name),
        ];
        assert_eq!(
            candidates(&records, &[helper], 90)
                .iter()
                .map(|p| p.pid)
                .collect::<Vec<_>>(),
            vec![92]
        );
    }
    #[test]
    fn live_or_unreadable_parent_means_leave_it_alone() {
        let helper = PathBuf::from("/game/chunk-lens");
        let records = vec![record(8, 2, ""), record(20, 8, "/game/chunk-lens")];
        assert!(candidates(&records, &[helper], 50).is_empty());
    }
    #[test]
    fn command_boundary_excludes_similarly_named_binaries_and_shell_arguments() {
        let path = Path::new("/game with spaces/chunk-lens");
        assert!(executable_command(
            "/game with spaces/chunk-lens --port 8",
            path
        ));
        assert!(!executable_command(
            "/game with spaces/chunk-lens-backup",
            path
        ));
        assert!(!executable_command(
            "sh -c /game with spaces/chunk-lens",
            path
        ));
    }
}
