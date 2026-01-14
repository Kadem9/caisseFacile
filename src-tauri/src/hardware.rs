// ===================================
// Hardware Module - Printer, Cash Drawer, TPE
// ===================================

use serde::{Deserialize, Serialize};
use serialport::{available_ports, SerialPortType};
use std::io::Write;
use std::time::Duration;
use printers::common::base::job::PrinterJobOptions;

// ===================================
// Types
// ===================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SerialPortInfo {
    pub name: String,
    pub port_type: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrinterConfig {
    pub port: String,
    pub baud_rate: u32,
    pub paper_width: u8, // 58mm or 80mm
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptData {
    pub header: String,
    pub items: Vec<ReceiptItem>,
    pub total: f64,
    pub payment_method: String,
    pub footer: Option<String>,
    pub transaction_id: i32,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReceiptItem {
    pub name: String,
    pub quantity: i32,
    pub unit_price: f64,
    pub subtotal: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareStatus {
    pub printer_connected: bool,
    pub printer_port: Option<String>,
    pub drawer_connected: bool,
    pub drawer_port: Option<String>,
}

// ===================================
// Serial Port Discovery
// ===================================

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    match available_ports() {
        Ok(ports) => {
            let port_info: Vec<SerialPortInfo> = ports
                .into_iter()
                .map(|p| {
                    let (port_type, manufacturer, product) = match p.port_type {
                        SerialPortType::UsbPort(info) => (
                            "USB".to_string(),
                            info.manufacturer,
                            info.product,
                        ),
                        SerialPortType::PciPort => ("PCI".to_string(), None, None),
                        SerialPortType::BluetoothPort => ("Bluetooth".to_string(), None, None),
                        SerialPortType::Unknown => ("Unknown".to_string(), None, None),
                    };
                    SerialPortInfo {
                        name: p.port_name,
                        port_type,
                        manufacturer,
                        product,
                    }
                })
                .collect();
            Ok(port_info)
        }
        Err(e) => Err(format!("Failed to list ports: {}", e)),
    }
}

// ===================================
// ESC/POS Commands
// ===================================

/// ESC/POS command constants
mod escpos {
    pub const ESC: u8 = 0x1B;
    pub const GS: u8 = 0x1D;
    pub const LF: u8 = 0x0A;
    
    // Initialize printer
    pub const INIT: [u8; 2] = [ESC, b'@'];
    
    // Text formatting
    pub const BOLD_ON: [u8; 3] = [ESC, b'E', 1];
    pub const BOLD_OFF: [u8; 3] = [ESC, b'E', 0];
    pub const DOUBLE_HEIGHT_ON: [u8; 3] = [GS, b'!', 0x10];
    pub const DOUBLE_WIDTH_ON: [u8; 3] = [GS, b'!', 0x20];
    pub const DOUBLE_SIZE_ON: [u8; 3] = [GS, b'!', 0x30];
    pub const NORMAL_SIZE: [u8; 3] = [GS, b'!', 0x00];
    
    // Alignment
    pub const ALIGN_LEFT: [u8; 3] = [ESC, b'a', 0];
    pub const ALIGN_CENTER: [u8; 3] = [ESC, b'a', 1];
    pub const ALIGN_RIGHT: [u8; 3] = [ESC, b'a', 2];
    
    // Cut paper
    pub const CUT_PARTIAL: [u8; 3] = [GS, b'V', 1];
    pub const CUT_FULL: [u8; 3] = [GS, b'V', 0];
    
    // Cash drawer
    pub const OPEN_DRAWER_PIN2: [u8; 5] = [ESC, b'p', 0, 0x19, 0xFA];
    pub const OPEN_DRAWER_PIN5: [u8; 5] = [ESC, b'p', 1, 0x19, 0xFA];
}

// ===================================
// Printer Functions
// ===================================

#[tauri::command]
pub fn print_receipt(config: PrinterConfig, receipt: ReceiptData) -> Result<String, String> {
    // Open serial port
    let port = serialport::new(&config.port, config.baud_rate)
        .timeout(Duration::from_secs(5))
        .open();

    let mut port = match port {
        Ok(p) => p,
        Err(e) => return Err(format!("Failed to open port: {}", e)),
    };

    // Build receipt content
    let mut data: Vec<u8> = Vec::new();

    // Initialize printer
    data.extend_from_slice(&escpos::INIT);

    // Header (centered, double size)
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(&escpos::DOUBLE_SIZE_ON);
    data.extend_from_slice(receipt.header.as_bytes());
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Reset to normal
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.extend_from_slice(&escpos::ALIGN_LEFT);

    // Date and transaction ID
    let info_line = format!("#{} - {}", receipt.transaction_id, receipt.date);
    data.extend_from_slice(info_line.as_bytes());
    data.push(escpos::LF);

    // Separator
    let separator = "-".repeat(if config.paper_width == 58 { 32 } else { 48 });
    data.extend_from_slice(separator.as_bytes());
    data.push(escpos::LF);

    // Items
    for item in &receipt.items {
        let item_line = format!(
            "{} x{} @ {:.2}€",
            item.name, item.quantity, item.unit_price
        );
        data.extend_from_slice(item_line.as_bytes());
        data.push(escpos::LF);

        // Subtotal aligned right
        data.extend_from_slice(&escpos::ALIGN_RIGHT);
        let subtotal_line = format!("{:.2}€", item.subtotal);
        data.extend_from_slice(subtotal_line.as_bytes());
        data.push(escpos::LF);
        data.extend_from_slice(&escpos::ALIGN_LEFT);
    }

    // Separator
    data.extend_from_slice(separator.as_bytes());
    data.push(escpos::LF);

    // Total (bold, larger)
    data.extend_from_slice(&escpos::BOLD_ON);
    data.extend_from_slice(&escpos::DOUBLE_HEIGHT_ON);
    data.extend_from_slice(&escpos::ALIGN_RIGHT);
    let total_line = format!("TOTAL: {:.2}€", receipt.total);
    data.extend_from_slice(total_line.as_bytes());
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.extend_from_slice(&escpos::BOLD_OFF);
    data.extend_from_slice(&escpos::ALIGN_LEFT);

    // Payment method
    let payment_line = format!("Paiement: {}", receipt.payment_method);
    data.extend_from_slice(payment_line.as_bytes());
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Footer
    if let Some(footer) = &receipt.footer {
        data.extend_from_slice(&escpos::ALIGN_CENTER);
        data.extend_from_slice(footer.as_bytes());
        data.push(escpos::LF);
    }

    // Thank you message
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(b"Merci de votre visite!");
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Cut paper
    data.extend_from_slice(&escpos::CUT_PARTIAL);

    // Send to printer
    match port.write_all(&data) {
        Ok(_) => Ok("Receipt printed successfully".to_string()),
        Err(e) => Err(format!("Failed to print: {}", e)),
    }
}

#[tauri::command]
pub fn test_printer(port_name: String, baud_rate: u32) -> Result<String, String> {
    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_secs(5))
        .open();

    let mut port = match port {
        Ok(p) => p,
        Err(e) => return Err(format!("Failed to open port: {}", e)),
    };

    // Build test receipt
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(&escpos::INIT);
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(&escpos::DOUBLE_SIZE_ON);
    data.extend_from_slice(b"MA CAISSE AG");
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.push(escpos::LF);
    data.extend_from_slice(b"Test d'impression");
    data.push(escpos::LF);
    data.extend_from_slice(b"Configuration OK!");
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::CUT_PARTIAL);

    match port.write_all(&data) {
        Ok(_) => Ok("Test print successful".to_string()),
        Err(e) => Err(format!("Failed to print: {}", e)),
    }
}

// ===================================
// Cash Drawer Functions
// ===================================

#[tauri::command]
pub fn open_cash_drawer(port_name: String, baud_rate: u32, pin: u8) -> Result<String, String> {
    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_secs(2))
        .open();

    let mut port = match port {
        Ok(p) => p,
        Err(e) => return Err(format!("Failed to open port: {}", e)),
    };

    // Select kick pulse command based on pin
    let drawer_cmd = if pin == 5 {
        escpos::OPEN_DRAWER_PIN5
    } else {
        escpos::OPEN_DRAWER_PIN2
    };

    match port.write_all(&drawer_cmd) {
        Ok(_) => Ok("Cash drawer opened".to_string()),
        Err(e) => Err(format!("Failed to open drawer: {}", e)),
    }
}

// ===================================
// Hardware Status
// ===================================

#[tauri::command]
pub fn check_hardware_status(printer_port: Option<String>, drawer_port: Option<String>) -> HardwareStatus {
    let printer_connected = printer_port
        .as_ref()
        .map(|p| {
            serialport::new(p, 9600)
                .timeout(Duration::from_millis(500))
                .open()
                .is_ok()
        })
        .unwrap_or(false);

    let drawer_connected = drawer_port
        .as_ref()
        .map(|p| {
            serialport::new(p, 9600)
                .timeout(Duration::from_millis(500))
                .open()
                .is_ok()
        })
        .unwrap_or(false);

    HardwareStatus {
        printer_connected,
        printer_port,
        drawer_connected,
        drawer_port,
    }
}

// ===================================
// Windows Driver Printing (via printers crate)
// ===================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemPrinterInfo {
    pub name: String,
    pub driver_name: String,
    pub is_default: bool,
}

/// List all system printers (installed via Windows drivers)
#[tauri::command]
pub fn list_system_printers() -> Result<Vec<SystemPrinterInfo>, String> {
    let printers_list = printers::get_printers();
    let default_printer = printers::get_default_printer();
    
    let result: Vec<SystemPrinterInfo> = printers_list
        .into_iter()
        .map(|p| {
            let is_default = default_printer.as_ref().map(|d| d.name == p.name).unwrap_or(false);
            SystemPrinterInfo {
                name: p.name.clone(),
                driver_name: p.driver_name.clone(),
                is_default,
            }
        })
        .collect();
    
    Ok(result)
}

/// Print a receipt via Windows driver (RAW ESC/POS data sent to driver)
#[tauri::command]
pub fn print_via_driver(printer_name: String, receipt: ReceiptData, paper_width: u8) -> Result<String, String> {
    // Find the printer
    let printer = printers::get_printer_by_name(&printer_name);
    let printer = match printer {
        Some(p) => p,
        None => return Err(format!("Printer '{}' not found", printer_name)),
    };

    // Build ESC/POS receipt data
    let mut data: Vec<u8> = Vec::new();

    // Initialize printer
    data.extend_from_slice(&escpos::INIT);

    // Header (centered, double size)
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(&escpos::DOUBLE_SIZE_ON);
    data.extend_from_slice(receipt.header.as_bytes());
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Reset to normal
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.extend_from_slice(&escpos::ALIGN_LEFT);

    // Date and transaction ID
    let info_line = format!("#{} - {}", receipt.transaction_id, receipt.date);
    data.extend_from_slice(info_line.as_bytes());
    data.push(escpos::LF);

    // Separator
    let separator = "-".repeat(if paper_width == 58 { 32 } else { 48 });
    data.extend_from_slice(separator.as_bytes());
    data.push(escpos::LF);

    // Items
    for item in &receipt.items {
        let item_line = format!(
            "{} x{} @ {:.2}€",
            item.name, item.quantity, item.unit_price
        );
        data.extend_from_slice(item_line.as_bytes());
        data.push(escpos::LF);

        // Subtotal aligned right
        data.extend_from_slice(&escpos::ALIGN_RIGHT);
        let subtotal_line = format!("{:.2}€", item.subtotal);
        data.extend_from_slice(subtotal_line.as_bytes());
        data.push(escpos::LF);
        data.extend_from_slice(&escpos::ALIGN_LEFT);
    }

    // Separator
    data.extend_from_slice(separator.as_bytes());
    data.push(escpos::LF);

    // Total (bold, larger)
    data.extend_from_slice(&escpos::BOLD_ON);
    data.extend_from_slice(&escpos::DOUBLE_HEIGHT_ON);
    data.extend_from_slice(&escpos::ALIGN_RIGHT);
    let total_line = format!("TOTAL: {:.2}€", receipt.total);
    data.extend_from_slice(total_line.as_bytes());
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.extend_from_slice(&escpos::BOLD_OFF);
    data.extend_from_slice(&escpos::ALIGN_LEFT);

    // Payment method
    let payment_line = format!("Paiement: {}", receipt.payment_method);
    data.extend_from_slice(payment_line.as_bytes());
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Footer
    if let Some(footer) = &receipt.footer {
        data.extend_from_slice(&escpos::ALIGN_CENTER);
        data.extend_from_slice(footer.as_bytes());
        data.push(escpos::LF);
    }

    // Thank you message
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(b"Merci de votre visite!");
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.push(escpos::LF);

    // Cut paper
    data.extend_from_slice(&escpos::CUT_PARTIAL);

    // Send to printer via driver
    match printer.print(&data, PrinterJobOptions::none()) {
        Ok(_) => Ok("Receipt printed successfully via driver".to_string()),
        Err(e) => Err(format!("Failed to print via driver: {:?}", e)),
    }
}

/// Open cash drawer via Windows driver (sends ESC/POS command to the printer)
#[tauri::command]
pub fn open_drawer_via_driver(printer_name: String, pin: u8) -> Result<String, String> {
    let printer = printers::get_printer_by_name(&printer_name);
    let printer = match printer {
        Some(p) => p,
        None => return Err(format!("Printer '{}' not found", printer_name)),
    };

    // Select kick pulse command based on pin
    let drawer_cmd = if pin == 5 {
        escpos::OPEN_DRAWER_PIN5
    } else {
        escpos::OPEN_DRAWER_PIN2
    };

    match printer.print(&drawer_cmd, PrinterJobOptions::none()) {
        Ok(_) => Ok("Cash drawer opened via driver".to_string()),
        Err(e) => Err(format!("Failed to open drawer via driver: {:?}", e)),
    }
}

/// Test print via Windows driver
#[tauri::command]
pub fn test_printer_driver(printer_name: String) -> Result<String, String> {
    let printer = printers::get_printer_by_name(&printer_name);
    let printer = match printer {
        Some(p) => p,
        None => return Err(format!("Printer '{}' not found", printer_name)),
    };

    // Build test receipt
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(&escpos::INIT);
    data.extend_from_slice(&escpos::ALIGN_CENTER);
    data.extend_from_slice(&escpos::DOUBLE_SIZE_ON);
    data.extend_from_slice(b"MA CAISSE AG");
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::NORMAL_SIZE);
    data.push(escpos::LF);
    data.extend_from_slice(b"Test d'impression");
    data.push(escpos::LF);
    data.extend_from_slice(b"Configuration OK!");
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.push(escpos::LF);
    data.extend_from_slice(&escpos::CUT_PARTIAL);

    match printer.print(&data, PrinterJobOptions::none()) {
        Ok(_) => Ok("Test print successful via driver".to_string()),
        Err(e) => Err(format!("Failed to test print via driver: {:?}", e)),
    }
}
