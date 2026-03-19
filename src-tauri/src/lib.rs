use tauri::{Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            x: 100,
            y: 100,
            maximized: false,
        }
    }
}

#[tauri::command]
fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    #[cfg(target_os = "linux")]
    return "linux".to_string();
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown".to_string();
}

#[tauri::command]
fn reload_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.eval("location.reload()").map_err(|e| e.to_string())
}

fn get_window_state_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let mut path = app_handle.path().app_data_dir()
        .expect("Failed to get app data directory");
    path.push("window_state.json");
    path
}

fn save_window_state(app_handle: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let state = match (
        window.inner_size(),
        window.outer_position(),
        window.is_maximized()
    ) {
        (Ok(size), Ok(position), Ok(maximized)) => WindowState {
            width: size.width,
            height: size.height,
            x: position.x,
            y: position.y,
            maximized,
        },
        _ => return,
    };

    let path = get_window_state_path(app_handle);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if let Ok(json) = serde_json::to_string_pretty(&state) {
        let _ = std::fs::write(&path, json);
        println!("Window state saved: {:?}", state);
    }
}

fn load_window_state(app_handle: &tauri::AppHandle) -> Option<WindowState> {
    let path = get_window_state_path(app_handle);
    if !path.exists() {
        return None;
    }

    match std::fs::read_to_string(&path) {
        Ok(json) => {
            match serde_json::from_str::<WindowState>(&json) {
                Ok(state) => {
                    println!("Window state loaded: {:?}", state);
                    return Some(state);
                }
                Err(e) => println!("Failed to parse window state: {}", e),
            }
        }
        Err(e) => println!("Failed to read window state: {}", e),
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_platform, reload_page])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 只在第一次启动时运行后端服务器
            if !SERVER_STARTED.swap(true, Ordering::SeqCst) {
                // 获取资源目录
                let resource_path = app.path().resource_dir()
                    .expect("Failed to get resource directory");

                println!("Resource path: {:?}", resource_path);

                let server_path = resource_path.join("dist").join("index.js");
                println!("Starting server from: {:?}", server_path);

                // 使用 sidecar 或直接运行 node
                tauri::async_runtime::spawn(async move {
                    #[cfg(target_os = "windows")]
                    let node_cmd = "node.exe";
                    #[cfg(not(target_os = "windows"))]
                    let node_cmd = "node";

                    let shell = app_handle.shell();
                    let result = shell.command(node_cmd)
                        .args([server_path.to_string_lossy().to_string()])
                        .current_dir(resource_path)
                        .spawn();

                    match result {
                        Ok(_) => println!("Server started successfully"),
                        Err(e) => eprintln!("Failed to start server: {}", e),
                    }
                });
            }

            // 获取主窗口
            if let Some(window) = app.get_webview_window("main") {
                // 恢复窗口状态
                if let Some(state) = load_window_state(app.handle()) {
                    if !state.maximized {
                        use tauri::Position;
                        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                            width: state.width,
                            height: state.height,
                        }));
                        let _ = window.set_position(Position::Physical(tauri::PhysicalPosition {
                            x: state.x,
                            y: state.y,
                        }));
                    } else {
                        let _ = window.maximize();
                    }
                }

                // 监听窗口关闭事件，保存状态
                let app_handle_close = app.handle().clone();
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            save_window_state(&app_handle_close, &window_clone);
                        }
                        tauri::WindowEvent::DragDrop(drag_event) => {
                            match drag_event {
                                tauri::DragDropEvent::Drop { paths, .. } => {
                                    println!("[Tauri] Files dropped: {:?}", paths);
                                    let _ = window_clone.emit("file-drop", paths);
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}