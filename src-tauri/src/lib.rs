// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod hardware;
mod tpe;
mod http_proxy;

use hardware::{
    list_serial_ports,
    print_receipt,
    test_printer,
    open_cash_drawer,
    check_hardware_status,
    list_system_printers,
    print_via_driver,
    open_drawer_via_driver,
    test_printer_driver,
};

use tpe::{
    test_tpe_connection,
    send_tpe_payment,
    cancel_tpe_transaction,
    get_tpe_logs,
    clear_tpe_logs,
};

use http_proxy::http_request;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn shutdown_system() -> Result<(), String> {
    match system_shutdown::shutdown() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to shutdown: {}", e)),
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_serial_ports,
            print_receipt,
            test_printer,
            open_cash_drawer,
            check_hardware_status,
            list_system_printers,
            print_via_driver,
            open_drawer_via_driver,
            test_printer_driver,
            shutdown_system,
            // TPE commands
            test_tpe_connection,
            send_tpe_payment,
            cancel_tpe_transaction,
            get_tpe_logs,
            clear_tpe_logs,
            quit_app,
            // HTTP Proxy for Windows compatibility
            http_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
