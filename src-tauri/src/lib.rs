use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::sync::atomic::{AtomicBool, Ordering};

static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![get_platform])
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
