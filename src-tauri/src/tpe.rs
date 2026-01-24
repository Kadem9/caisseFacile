// ===================================
// TPE Module - Ingenico & PAX Handler
// ===================================
// Supports:
// 1. Serial Port (USB/Serial adapter)
// 2. TCP/IP (WiFi/Ethernet)
// Protocol: Concert Standard (8 digits)

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};

// Global cancellation flag to interrupt blocking TPE operations
static TPE_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
// ===================================
// Types
// ===================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TpeConfig {
    pub name: String,
    pub port: String, // Can be "COM3" or "192.168.1.50:8888"
    pub baud_rate: u32,
    pub pos_number: String,
    pub protocol_version: u8, // 2 = Concert V2 (8 digits), 3 = Concert V3 (10 digits)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpePaymentRequest {
    pub amount_cents: u32,
    pub payment_mode: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpePaymentResponse {
    pub success: bool,
    pub transaction_result: String,
    pub amount_cents: u32,
    pub authorization_number: Option<String>,
    pub error_message: Option<String>,
    pub raw_response: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpeTestResult {
    pub connected: bool,
    pub message: String,
    pub raw_data: Option<String>,
}

// ===================================
// Protocol Constants
// ===================================

const STX: u8 = 0x02;
const ETX: u8 = 0x03;
const ACK: u8 = 0x06;
const NAK: u8 = 0x15;
const ENQ: u8 = 0x05;
const EOT: u8 = 0x04;
const CAN: u8 = 0x18;

// ===================================
// Abstraction Layer (Serial vs TCP)
// ===================================

// Trait object to handle both SerialPort and TcpStream
trait TpeStream: Read + Write + Send {}
impl<T: Read + Write + Send> TpeStream for T {}

fn connect(connection_str: &str, baud_rate: u32) -> Result<Box<dyn TpeStream>, String> {
    let clean_str = connection_str.trim_end_matches("+ASCII");
    // Check if it's an IP address (contains ':')
    if clean_str.contains(':') {
        connect_tcp(clean_str)
    } else {
        connect_serial(clean_str, baud_rate)
    }
}

fn connect_tcp(address: &str) -> Result<Box<dyn TpeStream>, String> {
    log_to_file(&format!("Connecting TCP to {}", address));
    // Standard connection timeout increased to 10s for slow terminals/wakeup
    match TcpStream::connect_timeout(&address.parse().map_err(|e| format!("Invalid IP: {}", e))?, Duration::from_secs(10)) {
        Ok(stream) => {
            stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
            stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
            // OPTIMIZATION: Disable Nagle's algorithm for lower latency
            stream.set_nodelay(true).ok();
            Ok(Box::new(stream))
        },
        Err(e) => {
            let msg = format!("TCP Error {}: {}", address, e);
            log_to_file(&msg);
            Err(msg)
        }
    }
}

fn connect_serial(port_name: &str, baud_rate: u32) -> Result<Box<dyn TpeStream>, String> {
    log_to_file(&format!("Opening Serial {} at {}", port_name, baud_rate));
    serialport::new(port_name, baud_rate)
        .timeout(Duration::from_secs(3))
        .data_bits(serialport::DataBits::Seven)
        .parity(serialport::Parity::Even)
        .stop_bits(serialport::StopBits::One)
        .open()
        .map_err(|e| {
            let msg = format!("Serial Error {}: {}", port_name, e);
            log_to_file(&msg);
            msg
        })
        .map(|p| Box::new(p) as Box<dyn TpeStream>)
}


// ===================================
// Logging Helper - Robust TPE Debug Logs
// ===================================

use std::sync::Mutex;
use once_cell::sync::Lazy;

// In-memory log buffer (thread-safe)
static TPE_LOG_BUFFER: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Get the TPE log file path in user's Documents folder
fn get_log_file_path() -> Option<std::path::PathBuf> {
    // Try multiple locations for cross-platform compatibility
    if let Some(docs) = dirs::document_dir() {
        return Some(docs.join("ma-caisse-tpe-debug.log"));
    }
    if let Some(home) = dirs::home_dir() {
        return Some(home.join("ma-caisse-tpe-debug.log"));
    }
    // Fallback to current directory
    Some(std::path::PathBuf::from("ma-caisse-tpe-debug.log"))
}

fn log_to_file(message: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let log_entry = format!("[{}] {}", timestamp, message);
    
    // Always log to memory buffer
    if let Ok(mut buffer) = TPE_LOG_BUFFER.lock() {
        buffer.push(log_entry.clone());
        // Keep only last 500 entries to avoid memory issues
        if buffer.len() > 500 {
            buffer.remove(0);
        }
    }
    
    // Also try to log to file
    if let Some(log_path) = get_log_file_path() {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(file, "{}", log_entry);
        }
    }
    
    // Also print to console for dev mode
    println!("[TPE] {}", message);
}

/// Tauri command to get all TPE logs
#[tauri::command]
pub fn get_tpe_logs() -> Result<String, String> {
    let mut result = String::new();
    
    // Add header with log file location
    if let Some(log_path) = get_log_file_path() {
        result.push_str(&format!("=== TPE Debug Logs ===\n"));
        result.push_str(&format!("Log file: {}\n", log_path.display()));
        result.push_str(&format!("Generated: {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
        result.push_str("===========================\n\n");
    }
    
    // First try to read from file (more complete)
    if let Some(log_path) = get_log_file_path() {
        if let Ok(contents) = std::fs::read_to_string(&log_path) {
            result.push_str(&contents);
            return Ok(result);
        }
    }
    
    // Fallback to memory buffer
    if let Ok(buffer) = TPE_LOG_BUFFER.lock() {
        for entry in buffer.iter() {
            result.push_str(entry);
            result.push('\n');
        }
    }
    
    if result.trim().is_empty() {
        result.push_str("Aucun log TPE disponible. Effectuez un test de connexion ou paiement d'abord.\n");
    }
    
    Ok(result)
}

/// Tauri command to clear TPE logs
#[tauri::command]
pub fn clear_tpe_logs() -> Result<String, String> {
    // Clear memory buffer
    if let Ok(mut buffer) = TPE_LOG_BUFFER.lock() {
        buffer.clear();
    }
    
    // Clear log file
    if let Some(log_path) = get_log_file_path() {
        let _ = std::fs::remove_file(&log_path);
    }
    
    log_to_file("=== Logs cleared ===");
    Ok("Logs cleared".to_string())
}

fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

// ===================================
// TPE Commands
// ===================================

#[tauri::command]
pub async fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    log_to_file(&format!("=== TEST CONNECTION {} ===", port_name));
    
    let result = tokio::task::spawn_blocking(move || {
        let clean_str = port_name.trim_end_matches("+ASCII");
        let is_tcp = clean_str.contains(':');
        
        let stream_res = connect(&port_name, baud_rate);
        
        match stream_res {
            Ok(mut stream) => {
                log_to_file("Connection opened");
                
                // For TCP (Nepting), just verify connection works
                // The TPE may not respond to ENQ as it uses TLV protocol
                if is_tcp {
                    log_to_file("TCP connection successful (Nepting mode)");
                    return TpeTestResult {
                        connected: true,
                        message: "Connected to TPE via TCP ✓".to_string(),
                        raw_data: None,
                    };
                }
                
                // For Serial (Concert), send ENQ and expect ACK
                if let Err(e) = stream.write_all(&[ENQ]) {
                    return TpeTestResult {
                        connected: false,
                        message: format!("Write Error: {}", e),
                        raw_data: None,
                    };
                }
                let _ = stream.flush();
                
                std::thread::sleep(Duration::from_millis(300));
                
                let mut buffer = [0u8; 64];
                match stream.read(&mut buffer) {
                    Ok(n) if n > 0 => {
                        let hex = bytes_to_hex(&buffer[..n]);
                        log_to_file(&format!("Response: {}", hex));
                        
                        TpeTestResult {
                            connected: true,
                            message: if buffer[0] == ACK {
                                "Connected - ACK Received ✓".to_string()
                            } else {
                                format!("Connected - Response: {}", hex)
                            },
                            raw_data: Some(hex),
                        }
                    }
                    Ok(_) => TpeTestResult {
                        connected: true,
                        message: "Connected, no data received".to_string(),
                        raw_data: None,
                    },
                    Err(e) => {
                        log_to_file(&format!("Read error: {}", e));
                        TpeTestResult {
                            connected: false,
                            message: format!("Error: {}", e),
                            raw_data: None,
                        }
                    }
                }
            }
            Err(e) => TpeTestResult {
                connected: false,
                message: e,
                raw_data: None,
            },
        }
    }).await;

    match result {
        Ok(res) => res,
        Err(e) => TpeTestResult {
            connected: false,
            message: format!("Thread error: {}", e),
            raw_data: None,
        }
    }
}

fn build_payment_message(amount_cents: u32, pos_number: &str, protocol_version: u8) -> Vec<u8> {
    // Safely handle pos_number to be exactly 2 digits
    let pos_num = if pos_number.len() >= 2 { 
        pos_number[..2].to_string() 
    } else if pos_number.len() == 1 { 
        format!("0{}", pos_number) 
    } else { 
        "01".to_string() 
    };
    
    let data = if protocol_version == 2 {
        // Concert V2 binary format (14 chars total):
        //   Type: 1 char ("0" = debit)
        //   N° caisse: 2 chars
        //   Amount: 8 chars (centimes)
        //   Currency: 3 chars
        let tx_type = "0";
        let amount = format!("{:08}", amount_cents);
        format!("{}{}{}{}", tx_type, pos_num, amount, "978")
    } else if protocol_version == 3 {
        // Concert V3 binary format (19 chars total):
        // THIS FORMAT SHOWS AMOUNT ON TPE (unlike TLV which fails with AF=09)
        //   Type: 2 chars ("00" = debit)
        //   N° caisse: 2 chars  
        //   Amount: 12 chars (centimes)
        //   Currency: 3 chars
        let tx_type = "00";
        let amount = format!("{:012}", amount_cents);
        format!("{}{}{}{}", tx_type, pos_num, amount, "978")
    } else if protocol_version == 4 {
        // Concert V3 TLV format (Caisse-AP style)
        // WARNING: Returns AF=09 on Indigo Move/500
        fn tlv(tag: &str, value: &str) -> String {
            format!("{}{:03}{}", tag, value.len(), value)
        }
        
        let mut msg = String::new();
        msg.push_str(&tlv("CZ", "0320"));
        msg.push_str(&tlv("CA", &pos_num));
        msg.push_str(&tlv("CE", "978"));
        msg.push_str(&tlv("CD", "0"));
        msg.push_str(&tlv("CB", &format!("{:012}", amount_cents)));
        msg.push_str(&tlv("TI", &format!("{:06}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() % 1000000)));
        
        msg
    } else {
        // Default: SmilePay or other - use V3 binary
        let tx_type = "00";
        let amount = format!("{:012}", amount_cents);
        format!("{}{}{}{}", tx_type, pos_num, amount, "978")
    };
    
    println!("Building Concert V{} message ({}chars): {}", protocol_version, data.len(), data);
    log_to_file(&format!("Concert V{} message ({}chars): {}", protocol_version, data.len(), data));
    
    let mut lrc_input: Vec<u8> = data.as_bytes().to_vec();
    lrc_input.push(ETX);
    let lrc = calculate_lrc(&lrc_input);
    
    let mut msg: Vec<u8> = Vec::new();
    msg.push(STX);
    msg.extend_from_slice(data.as_bytes());
    msg.push(ETX);
    msg.push(lrc);
    
    msg
}

/// Build a Caisse-AP over IP message (Concert V3 on TCP)
/// Based on official protocol: https://github.com/akretion/caisse-ap-ip
/// Format: TAG(2 letters) + LENGTH(3 digits) + VALUE
/// Wrapped in STX ... ETX+LRC
fn build_caisse_ap_ip_message(amount_cents: u32, pos_id: &str) -> Vec<u8> {
    // Helper to create a TLV field
    fn tlv(tag: &str, value: &str) -> String {
        format!("{}{:03}{}", tag, value.len(), value)
    }
    
    let mut msg = String::new();
    
    // CZ = Protocol version (must be first!) - "0320" for version 3.2 (was 0300)
    msg.push_str(&tlv("CZ", "0320"));
    
    // CJ = Concert Protocol Identifier (Standard)
    // REMOVED: Sending a specific CJ might cause timeouts if it doesn't match the TPE's expected ID.
    // Let the TPE use its default.
    // msg.push_str(&tlv("CJ", "012345678901"));
    
    // CA = POS number (caisse number)
    // Reverted to standard "01" after testing "1".
    let ca = if pos_id.is_empty() { "01" } else { pos_id };
    msg.push_str(&tlv("CA", ca));
    
    // CE = Currency ISO number (978 = EUR)
    msg.push_str(&tlv("CE", "978"));
    
    // BA = Answer mode: "0" = answer at end of transaction
    // "1" failed (timeout/no response). Reverting to "0".
    msg.push_str(&tlv("BA", "0"));
    
    // CD = Transaction type: "0" = debit
    msg.push_str(&tlv("CD", "0"));
    
    // CB = Amount in cents (12 digits padded)
    let amount_str = format!("{:012}", amount_cents);
    msg.push_str(&tlv("CB", &amount_str));
    
    // TI = Transaction ID (Numeric only - 6 digits)
    let tx_id = format!("{:06}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() % 1000000);
    msg.push_str(&tlv("TI", &tx_id));
    
    // LB = Label on ticket (Optional)
    msg.push_str(&tlv("LB", "CAISSE"));
    
    println!("Built Caisse-AP IP message Data ({}bytes): {}", msg.len(), msg);
    
    // Calculate LRC (XOR of all bytes in Data + ETX)
    let mut lrc_input: Vec<u8> = msg.as_bytes().to_vec();
    lrc_input.push(ETX);
    let lrc = calculate_lrc(&lrc_input);
    
    let mut framed_msg: Vec<u8> = Vec::new();
    framed_msg.push(STX);
    framed_msg.extend_from_slice(msg.as_bytes());
    framed_msg.push(ETX);
    framed_msg.push(lrc);
    
    framed_msg
}

#[tauri::command]
pub fn cancel_tpe_transaction() -> Result<String, String> {
    println!("Requesting TPE cancellation...");
    log_to_file("Requesting TPE cancellation...");
    TPE_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok("Cancellation requested".to_string())
}

#[tauri::command]
pub async fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    protocol_version: u8,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    // Reset cancellation flag at start of new transaction
    TPE_CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    log_to_file(&format!("=== PAY {} cents on {} ===", amount_cents, port_name));
    
    // Explicit ASCII mode requested (legacy fallback)
    if port_name.ends_with("+ASCII") {
        let clean_port = port_name.replace("+ASCII", "");
        return tokio::task::spawn_blocking(move || {
             let mut stream = connect(&clean_port, baud_rate)?;
             try_alternate_format(&mut stream, amount_cents)
         }).await.map_err(|e| format!("Thread error: {}", e))?;
    }
    
    // Check if TCP connection (IP:port format)
    // Strip legacy +ASCII suffix if present
    let clean_str = port_name.trim_end_matches("+ASCII").trim();
    let is_tcp = clean_str.contains(':');
    
    // TCP connections use Caisse-AP over IP (ASCII TLV format)
    if is_tcp {
        println!("--- CAISSE-AP IP MODE ---");
        let pos_number_clone = pos_number.clone();
        let connection_addr = clean_str.to_string();
        
        // Debug: Log exact bytes of address to catch hidden chars
        println!("Connecting to address: '{}' (Bytes: {:?})", connection_addr, connection_addr.as_bytes());
        log_to_file(&format!("Connecting to address: '{}'", connection_addr));
        
        return tokio::task::spawn_blocking(move || {
            // Use the CLEAN address for connection
            let mut stream = connect(&connection_addr, 0)?; // baud_rate ignored for TCP
            
            // Always use standard Caisse-AP (Concert V3)
            println!("--- CAISSE-AP (CONCERT) MODE ---");
            let message_bytes = build_caisse_ap_ip_message(amount_cents, &pos_number_clone);
            
            println!("Sending Payment Request ({} bytes)", message_bytes.len());
            // Log hex for debugging
            log_to_file(&format!("Sending Hex: {}", bytes_to_hex(&message_bytes)));
            
            stream.write_all(&message_bytes).map_err(|e| format!("Send failed: {}", e))?;
            let _ = stream.flush();
            
            // Wait for response (up to 150 seconds for payment to allow user interaction)
            println!("Waiting for Caisse-AP response...");
            log_to_file("Waiting for Caisse-AP response...");
            
            let mut response_buf = [0u8; 1024];
            let mut total_read = 0;
            let start = std::time::Instant::now();
            let timeout = Duration::from_secs(150);
            
            while start.elapsed() < timeout {
                if TPE_CANCEL_FLAG.load(Ordering::SeqCst) {
                     println!("!!! CANCELLATION REQUESTED !!!");
                     log_to_file("!!! CANCELLATION REQUESTED !!! - Sending CAN sequence");
                     // Send CAN (0x18) x 3 + EOT (0x04) to force cancel
                     let _ = stream.write_all(&[CAN, CAN, CAN, EOT]); 
                     let _ = stream.flush();
                     return Ok(TpePaymentResponse {
                         success: false,
                         transaction_result: "CANCELLED".to_string(),
                         amount_cents,
                         authorization_number: None,
                         error_message: Some("Transaction cancelled by user".to_string()),
                         raw_response: None,
                     });
                }

                match stream.read(&mut response_buf[total_read..]) {
                    Ok(0) => {
                        if total_read > 0 {
                            break; // Got data and connection closed
                        }
                        std::thread::sleep(Duration::from_millis(10)); // Reduced from 100ms
                    }
                    Ok(n) => {
                        total_read += n;
                        println!("Received {} bytes: {}", n, String::from_utf8_lossy(&response_buf[..total_read]));
                        
                        // Check if we have a complete message (ETX=0x03)
                        if response_buf[..total_read].contains(&0x03) {
                             // Give a bit of time for LRC
                             std::thread::sleep(Duration::from_millis(10)); // Reduced from 200ms
                             // Try one more read just in case
                             if let Ok(n2) = stream.read(&mut response_buf[total_read..]) {
                                 if n2 > 0 { total_read += n2; }
                             }
                             break;
                        }
                        
                        // Otherwise continue reading immediately or small sleep if fragmentation likely
                        // std::thread::sleep(Duration::from_millis(50)); Removed to speed up
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10)); // Reduced from 100ms
                        continue;
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                        std::thread::sleep(Duration::from_millis(10)); // Reduced from 100ms
                        continue;
                    }
                    Err(e) => {
                        log_to_file(&format!("Read error: {}", e));
                        return Err(format!("Read error: {}", e));
                    }
                }
            }
            
            if total_read > 0 {
                // IMPORTANT: Some terminals expect an ACK after sending their response
                // otherwise they might consider the transaction as failed/refused.
                println!("Sending ACK (+EOT) to confirm receipt...");
                let _ = stream.write_all(&[0x06, 0x04]); // ACK + EOT
                let _ = stream.flush();
                std::thread::sleep(Duration::from_millis(100)); // Reduced from 500ms
                
                let response_str = String::from_utf8_lossy(&response_buf[..total_read]).to_string();
                let response_hex = bytes_to_hex(&response_buf[..total_read]);
                
                println!("Caisse-AP RAW HEX: {}", response_hex);
                println!("Caisse-AP RAW STR: {}", response_str);
                log_to_file(&format!("RAW HEX: {}", response_hex));
                log_to_file(&format!("RAW STR: {}", response_str));
                
                // Parse Caisse-AP response manually and robustly
                let mut response_tags = Vec::new();
                let mut p = 0;
                let bytes = response_str.as_bytes();
                let len = bytes.len();
                
                // Basic TLV parser: Tag(2) + Len(3) + Value(Len)
                while p + 5 <= len {
                    // Try to parse length at p+2
                    let len_slice = &bytes[p+2..p+5];
                    if let Ok(len_str) = std::str::from_utf8(len_slice) {
                        if let Ok(value_len) = len_str.parse::<usize>() {
                            if p + 5 + value_len <= len {
                                let tag = String::from_utf8_lossy(&bytes[p..p+2]).to_string();
                                let value = String::from_utf8_lossy(&bytes[p+5..p+5+value_len]).to_string();
                                response_tags.push((tag, value));
                                p += 5 + value_len;
                                continue;
                            }
                        }
                    }
                    // If parsing failed, advance by 1 byte to try finding sync
                    p += 1;
                }
                
                println!("Parsed tags: {:?}", response_tags);
                log_to_file(&format!("Parsed tags: {:?}", response_tags));
                
                // Determine success
                // CV = Code Validation (00 = OK)
                // CO = Code Reponse (00 = OK)
                // AC = Authorization Code (If returned, usually means success)
                // AL = Autorisation Logiciel (Often 1 but can be ignored if AC is present)
                let cv = response_tags.iter().find(|(t, _)| t == "CV").map(|(_, v)| v.as_str());
                let co = response_tags.iter().find(|(t, _)| t == "CO").map(|(_, v)| v.as_str());
                let ac = response_tags.iter().find(|(t, _)| t == "AC").map(|(_, v)| v.as_str());
                let al = response_tags.iter().find(|(t, _)| t == "AL").map(|(_, v)| v.as_str());
                
                // Logic: 
                // 1. Classic success: CV=00 or CO=00
                // 2. Auth success: AC exists and is not empty (ignoring AL=1 in this case)
                let has_auth_code = ac.map_or(false, |v| !v.is_empty());
                let is_approved_classic = matches!(cv, Some("00")) || matches!(co, Some("00"));
                
                // Success if Classic OK OR Has Auth Code
                let result_success = is_approved_classic || has_auth_code;
                
                println!("DECISION: Success={}, Classic={}, HasAuthCode={}, TagAL={:?}", 
                    result_success, is_approved_classic, has_auth_code, al);
                log_to_file(&format!("DECISION: Success={}, AC={:?}, CV={:?}, CO={:?}", result_success, ac, cv, co));
                
                let error_msg = if !result_success {
                    // Cleaner error message for user
                    log_to_file(&format!("Transaction Refused DETAILS: {:?}", response_tags));
                    
                    // Try to find a meaningful error cause
                    if let Some(co_val) = co {
                        Some(format!("Paiement refusé (Code: {})", co_val))
                    } else if let Some(cv_val) = cv {
                        Some(format!("Paiement refusé (Validation: {})", cv_val))
                    } else {
                        Some("Paiement refusé".to_string())
                    }
                } else {
                    None
                };
                
                let auth_num = ac.map(|v| v.to_string());
                
                Ok(TpePaymentResponse {
                    success: result_success,
                    transaction_result: if result_success { "APPROVED".to_string() } else { "REFUSED".to_string() },
                    amount_cents,
                    authorization_number: None,
                    error_message: error_msg,
                    raw_response: Some(response_str),
                })
            } else {
                log_to_file("No response from TPE");
                Err("No response from TPE (timeout)".to_string())
            }
        }).await.map_err(|e| format!("Thread error: {}", e))?;
    }
    
    // Serial connections use Concert V3 binary protocol
    println!("--- CONCERT V3 MODE (Serial) ---");

    let result = tokio::task::spawn_blocking(move || {
        let mut stream = connect(&port_name, baud_rate)?;
        
        // Step 1: ENQ
        stream.write_all(&[ENQ]).map_err(|e| format!("ENQ failed: {}", e))?;
        let _ = stream.flush();
        std::thread::sleep(Duration::from_millis(200));
        
        let mut buf = [0u8; 64];
        let handshake_res = match stream.read(&mut buf) {
            Ok(n) if n > 0 => {
                let hex = bytes_to_hex(&buf[..n]);
                println!("Handshake received: {}", hex);
                Some(buf[0])
            },
            _ => None
        };
        
        if handshake_res != Some(ACK) {
            println!("Handshake NOT ACK (expected 06, got {:?})", handshake_res);
            if handshake_res == Some(ENQ) {
                println!("TPE sent ENQ, replying with ACK...");
                let _ = stream.write_all(&[ACK]);
                let _ = stream.flush();
                std::thread::sleep(Duration::from_millis(200));
            }
        } else {
            println!("Handshake OK (ACK received)");
        }
        
        // Step 2: Send Message
        let message = build_payment_message(amount_cents, &pos_number, protocol_version);
        println!("Sending standard message: {}", bytes_to_hex(&message));
        stream.write_all(&message).map_err(|e| format!("Send failed: {}", e))?;
        let _ = stream.flush();
        
        // Step 3: Wait for ACK
        std::thread::sleep(Duration::from_millis(500));
        let mut ack_buf = [0u8; 64];
        match stream.read(&mut ack_buf) {
            Ok(n) if n > 0 => {
                 let raw = bytes_to_hex(&ack_buf[..n]);
                 println!("ACK step received: {}", raw);
                 
                 // If TPE sends ENQ, it might expect an ACK from POS
                 if ack_buf[0] == ENQ && n == 1 {
                    println!("TPE sent ENQ, replying with ACK...");
                    let _ = stream.write_all(&[ACK]);
                    let _ = stream.flush();
                    // Optionally wait a bit more for a real ACK or proceed to Step 4
                 }

                 // If format rejected (ENQ EOT or NAK), try alternate format
                 if (ack_buf[0] == ENQ || ack_buf[0] == EOT || ack_buf[0] == NAK) && !port_name.ends_with("+ASCII") {
                    log_to_file("Standard format rejected, trying simple ASCII");
                    println!("Standard format rejected ({}). Attempting ASCII fallback...", raw);
                    return try_alternate_format(&mut stream, amount_cents);
                }
            }
            _ => {
                log_to_file("No ACK received");
                println!("No ACK received after message");
            }
        }
        
        // Step 4: Wait for Response (120s)
        log_to_file("Waiting for payment...");
        
        // Since we are in a blocking thread with a trait object, we can't easily set timeout on the trait directly
        // But the connect_tcp/connect_serial sets internal timeouts.
        // We will loop with reads.
        
        let mut response = [0u8; 256];
        let mut total = 0;
        let start = std::time::Instant::now();
        
        loop {
            if start.elapsed().as_secs() > 120 {
                println!("Timeout waiting for payment response (120s)");
                return Err("Timeout (120s)".to_string());
            }
            
            match stream.read(&mut response[total..]) {
                Ok(n) if n > 0 => {
                    let chunk = &response[total..total+n];
                    let current_raw = bytes_to_hex(chunk);
                    println!("Received data chunk: {}", current_raw);
                    
                    // CRITICAL: If TPE sends ENQ, it's asking if we are ready to receive the response.
                    // We must reply with ACK (06).
                    if chunk.contains(&ENQ) {
                        println!("TPE sent ENQ in response loop, replying with ACK...");
                        let _ = stream.write_all(&[ACK]).ok();
                        let _ = stream.flush().ok();
                        // Don't break, wait for the actual STX...ETX data
                    }

                    total += n;
                    
                    // Stop if we have a full message or terminal aborts
                    if response[..total].contains(&ETX) {
                        println!("End of response message detected (ETX)");
                        break;
                    }
                    
                    if response[..total].contains(&EOT) && !response[..total].contains(&STX) {
                        println!("Terminal sent EOT (Abort/End) without data.");
                        break;
                    }
                }
                Ok(_) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => {
                     if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock {
                         continue;
                     }
                     println!("Read error during payment: {}", e);
                     return Err(format!("Read error: {}", e));
                }
            }
        }
        
        let _ = stream.write_all(&[ACK]);
        
        let raw = bytes_to_hex(&response[..total]);
        println!("Final raw response from TPE: {}", raw);
        log_to_file(&format!("Data: {}", raw));
        parse_response(&response[..total], amount_cents, &raw)
    }).await;

      match result {
        Ok(res) => res,
        Err(e) => Err(format!("Thread error: {}", e))
    }
}

fn parse_response(data: &[u8], amount_cents: u32, raw: &str) -> Result<TpePaymentResponse, String> {
    let stx = data.iter().position(|&b| b == STX);
    let etx = data.iter().position(|&b| b == ETX);
    
    if let (Some(s), Some(e)) = (stx, etx) {
        if e > s {
            let body = &data[s+1..e];
            let body_str = String::from_utf8_lossy(body);
            log_to_file(&format!("Response body: {} ({}chars)", body_str, body_str.len()));
            
            // Check if this is a TLV response (contains AE tag)
            if body_str.contains("AE") {
                // TLV format response - parse AE and AF tags
                // Format: AE002XX where XX is the status code
                // AE values: 00=pending, 01=not performed, 10=performed (success!)
                // AF values: 09=format error, 11=abandoned, etc.
                
                let ae_code = extract_tlv_value(&body_str, "AE");
                let af_code = extract_tlv_value(&body_str, "AF");
                
                log_to_file(&format!("TLV Response - AE='{}', AF='{}'", ae_code, af_code));
                
                // AE=10 means SUCCESS in Caisse-AP!
                // AE=01 means NOT PERFORMED (failure)
                if ae_code == "10" {
                    return Ok(TpePaymentResponse {
                        success: true,
                        transaction_result: "10".to_string(),
                        amount_cents,
                        authorization_number: None,
                        error_message: None,
                        raw_response: Some(raw.to_string()),
                    });
                } else {
                    // Transaction failed - map AF error codes
                    let error_msg = match af_code.as_str() {
                        "01" => "Transaction annulée",
                        "02" => "Carte refusée",
                        "03" => "Erreur communication",
                        "09" => "Erreur format message (protocole incompatible)",
                        "10" => "Fonction impossible",
                        "11" => "Transaction abandonnée",
                        _ => "Transaction non effectuée",
                    };
                    
                    return Ok(TpePaymentResponse {
                        success: false,
                        transaction_result: format!("AE={},AF={}", ae_code, af_code),
                        amount_cents,
                        authorization_number: None,
                        error_message: Some(format!("{} (AE={}, AF={})", error_msg, ae_code, af_code)),
                        raw_response: Some(raw.to_string()),
                    });
                }
            }
            
            // Binary format response (V2/V3)
            // V2: TYPE(1) + RESULT(2) + ...
            // V3: TYPE(2) + RESULT(2) + ...
            let result_code = if body_str.len() >= 3 {
                let v2_code = &body_str[1..3.min(body_str.len())];
                let v3_code = if body_str.len() >= 4 { &body_str[2..4] } else { "" };
                
                log_to_file(&format!("Binary Response - V2='{}', V3='{}'", v2_code, v3_code));
                
                if v2_code == "00" || v3_code == "00" {
                    "00".to_string()
                } else if v2_code == "10" || v3_code == "10" {
                    "10".to_string()
                } else if v2_code == "01" || v3_code == "01" {
                    "01".to_string()
                } else {
                    v2_code.to_string()
                }
            } else {
                "??".to_string()
            };
            
            log_to_file(&format!("Parsed result code: {}", result_code));
            
            if result_code == "00" {
                return Ok(TpePaymentResponse {
                    success: true,
                    transaction_result: "00".to_string(),
                    amount_cents,
                    authorization_number: None,
                    error_message: None,
                    raw_response: Some(raw.to_string()),
                });
            } else {
                let error_msg = match result_code.as_str() {
                    "01" => "Transaction annulée",
                    "02" => "Carte refusée",
                    "03" => "Erreur communication",
                    "10" => "Fonction impossible",
                    "11" => "Timeout",
                    _ => "Transaction échouée",
                };
                
                return Ok(TpePaymentResponse {
                    success: false,
                    transaction_result: result_code.clone(),
                    amount_cents,
                    authorization_number: None,
                    error_message: Some(format!("{} (code: {})", error_msg, result_code)),
                    raw_response: Some(raw.to_string()),
                });
            }
        }
    }
    
    log_to_file("No valid framing found in response");
    Ok(TpePaymentResponse {
        success: false,
        transaction_result: "??".to_string(),
        amount_cents,
        authorization_number: None,
        error_message: Some(format!("Format de réponse invalide: {}", raw)),
        raw_response: Some(raw.to_string()),
    })
}

/// Extract value from TLV format: TAG(2) + LENGTH(3) + VALUE
fn extract_tlv_value(data: &str, tag: &str) -> String {
    if let Some(pos) = data.find(tag) {
        let start = pos + 2; // Skip tag
        if start + 3 <= data.len() {
            if let Ok(len) = data[start..start+3].parse::<usize>() {
                let value_start = start + 3;
                if value_start + len <= data.len() {
                    return data[value_start..value_start+len].to_string();
                }
            }
        }
    }
    String::new()
}

// function build_nepting_message removed

/// Send payment using Caisse-AP protocol (for TCP connections) - UNUSED, kept for reference
fn send_nepting_payment(address: &str, amount_cents: u32, pos_id: &str) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("Caisse-AP payment: {} cents to {}", amount_cents, address));
    
    // Build Caisse-AP message
    let tlv_message = build_caisse_ap_ip_message(amount_cents, pos_id);
    
    // Connect to terminal
    let clean_addr = address.trim_end_matches("+ASCII");
    let mut stream = TcpStream::connect_timeout(
        &clean_addr.parse().map_err(|e| format!("Invalid IP: {}", e))?,
        Duration::from_secs(3)
    ).map_err(|e| format!("TCP connection failed: {}", e))?;
    
    stream.set_read_timeout(Some(Duration::from_secs(120))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    
    // Send TLV message (no ENQ/ACK handshake needed)
    println!("Sending TLV (hex): {}", bytes_to_hex(&tlv_message));
    stream.write_all(&tlv_message)
        .map_err(|e| format!("Send TLV failed: {}", e))?;
    stream.flush().ok();
    
    // Wait for response
    println!("Waiting for Nepting response...");
    let mut response_buf = [0u8; 1024];
    let mut total = 0;
    let start = std::time::Instant::now();
    
    // Give the terminal time to process the request
    std::thread::sleep(Duration::from_millis(500));
    
    loop {
        if start.elapsed().as_secs() > 120 {
            println!("Timeout! Total bytes received: {}", total);
            return Err("Timeout waiting for Nepting response (120s)".to_string());
        }
        
        match stream.read(&mut response_buf[total..]) {
            Ok(n) if n > 0 => {
                let raw_hex = bytes_to_hex(&response_buf[total..total+n]);
                total += n;
                let current = String::from_utf8_lossy(&response_buf[..total]);
                println!("Nepting chunk ({} bytes): HEX={} TEXT={}", n, raw_hex, current.trim());
                
                // Check if we have a complete response (contains RC = Response Code)
                if current.contains("RC") {
                    println!("Complete response received");
                    break;
                }
            }
            Ok(_) => {
                // Empty read - wait a bit and continue
                if total > 0 {
                    println!("Empty read after {} bytes total", total);
                    break;
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock {
                    if total > 0 { 
                        println!("Timeout/WouldBlock after {} bytes - assuming complete", total);
                        break; 
                    }
                    continue;
                }
                println!("Read error: {} (total received: {})", e, total);
                return Err(format!("Read error: {}", e));
            }
        }
    }
    
    let response_str = String::from_utf8_lossy(&response_buf[..total]).to_string();
    println!("Final Nepting response: {}", response_str);
    log_to_file(&format!("Nepting response: {}", response_str));
    
    // Parse TLV response - look for RC (Response Code)
    // RC003000 = Success (code "000")
    // RC003007 = Error 007
    if let Some(rc_pos) = response_str.find("RC") {
        let after_rc = &response_str[rc_pos + 2..];
        if after_rc.len() >= 6 {
            let len_str = &after_rc[0..3];
            if let Ok(len) = len_str.parse::<usize>() {
                if after_rc.len() >= 3 + len {
                    let code = &after_rc[3..3+len];
                    println!("Nepting Response Code: {}", code);
                    
                    if code == "000" || code == "00" || code == "0" {
                        return Ok(TpePaymentResponse {
                            success: true,
                            transaction_result: "0".to_string(),
                            amount_cents,
                            authorization_number: None,
                            error_message: None,
                            raw_response: Some(response_str),
                        });
                    } else {
                        return Ok(TpePaymentResponse {
                            success: false,
                            transaction_result: code.to_string(),
                            amount_cents,
                            authorization_number: None,
                            error_message: Some(format!("Nepting error code: {}", code)),
                            raw_response: Some(response_str),
                        });
                    }
                }
            }
        }
    }
    
    // If no RC found, check for simple OK/KO
    if response_str.contains("OK") {
        return Ok(TpePaymentResponse {
            success: true,
            transaction_result: "OK".to_string(),
            amount_cents,
            authorization_number: None,
            error_message: None,
            raw_response: Some(response_str),
        });
    }
    
    Ok(TpePaymentResponse {
        success: false,
        transaction_result: "?".to_string(),
        amount_cents,
        authorization_number: None,
        error_message: Some(format!("Nepting response: {}", response_str)),
        raw_response: Some(response_str),
    })
}



/// Try alternate ASCII format (Simple "DEBIT X.XX EUR")
fn try_alternate_format(stream: &mut Box<dyn TpeStream>, amount_cents: u32) -> Result<TpePaymentResponse, String> {
    log_to_file("Trying ASCII format: amount in plain text");
    println!("--- FALLBACK ASCII MODE ---");
    
    // Some TPEs accept plain: "DEBIT 10.00 EUR\r\n"
    let amount_euros = amount_cents as f64 / 100.0;
    // Using \r (CR) is standard for line ending in serial
    let message = format!("DEBIT {:.2} EUR\r", amount_euros); 
    
    log_to_file(&format!("Sending fallback: {}", message.trim()));
    println!("Sending ASCII: \"{}\"", message.escape_debug());
    if let Err(e) = stream.write_all(message.as_bytes()) {
        println!("Error sending ASCII: {}", e);
        return Ok(TpePaymentResponse {
            success: false,
            transaction_result: "?".to_string(),
            amount_cents,
            authorization_number: None,
            error_message: Some(format!("Send fallback failed: {}", e)),
            raw_response: None,
        });
    }
    let _ = stream.flush();
    
    println!("Waiting for ASCII response...");
    std::thread::sleep(Duration::from_millis(500));
    
    // Wait for response to ASCII command
    let mut buf = [0u8; 256];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => {
            let hex = bytes_to_hex(&buf[..n]);
            let text = String::from_utf8_lossy(&buf[..n]);
            log_to_file(&format!("Alternate response: {} ({})", text.trim(), hex));
            println!("Received ASCII response: {} ({})", text.trim(), hex);
            
            // If we get simple "OK" or similar, consider generic success or just return raw for user to see
            // Usually returns status
            
            Ok(TpePaymentResponse {
                success: false, // Assume false unless we parse specific success char, let user decide based on display
                transaction_result: "?".to_string(),
                amount_cents,
                authorization_number: None,
                error_message: Some(format!("Mode ASCII utilisé. Réponse: {}", text.trim())),
                raw_response: Some(format!("ASCII: {} | HEX: {}", text.trim(), hex)),
            })
        }
        _ => {
            println!("No response to ASCII fallback.");
            Err("Pas de réponse au format alternatif".to_string())
        }
    }
}
