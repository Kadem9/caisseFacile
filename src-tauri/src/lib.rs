// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod hardware;

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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

