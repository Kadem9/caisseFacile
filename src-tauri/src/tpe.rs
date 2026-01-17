// ===================================
// TPE Module - Ingenico & PAX Handler
// ===================================
// Supports:
// 1. Serial Port (USB/Serial adapter)
// 2. TCP/IP (WiFi/Ethernet)
// Protocol: Concert Standard (8 digits)

use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;
use tokio::time::sleep;

// ===================================
// Types
// ===================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TpeConfig {
    pub name: String,
    pub port: String, // Can be "COM3" or "192.168.1.50:8888"
    pub baud_rate: u32,
    pub pos_number: String,
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

// ===================================
// Abstraction Layer (Serial vs TCP)
// ===================================

// Trait object to handle both SerialPort and TcpStream
trait TpeStream: Read + Write + Send {}
impl<T: Read + Write + Send> TpeStream for T {}

fn connect(connection_str: &str, baud_rate: u32) -> Result<Box<dyn TpeStream>, String> {
    // Check if it's an IP address (contains ':')
    if connection_str.contains(':') {
        connect_tcp(connection_str)
    } else {
        connect_serial(connection_str, baud_rate)
    }
}

fn connect_tcp(address: &str) -> Result<Box<dyn TpeStream>, String> {
    log_to_file(&format!("Connecting TCP to {}", address));
    // Standard connection timeout
    match TcpStream::connect_timeout(&address.parse().map_err(|e| format!("Invalid IP: {}", e))?, Duration::from_secs(3)) {
        Ok(stream) => {
            stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
            stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
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
// Logging Helper
// ===================================

fn log_to_file(message: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\tpe_debug.log")
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] {}", timestamp, message);
    }
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
        let stream_res = connect(&port_name, baud_rate);
        
        match stream_res {
            Ok(mut stream) => {
                log_to_file("Connection opened");
                
                // Send ENQ
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
                            connected: false, // Treat timeout as not connected for test
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

fn build_payment_message(amount_cents: u32) -> Vec<u8> {
    let tx_type = "01";
    let pos_num = "01"; 
    let amount = format!("{:08}", amount_cents);
    let private_field = "";
    
    let data = format!("{}{}{}{}", tx_type, pos_num, amount, private_field);
    
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

#[tauri::command]
pub async fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("=== PAY {} cents on {} ===", amount_cents, port_name));
    
    let result = tokio::task::spawn_blocking(move || {
        let mut stream = connect(&port_name, baud_rate)?;
        
        // Step 1: ENQ
        stream.write_all(&[ENQ]).map_err(|e| format!("ENQ failed: {}", e))?;
        let _ = stream.flush();
        std::thread::sleep(Duration::from_millis(200));
        
        let mut buf = [0u8; 64];
        let handshake_ok = match stream.read(&mut buf) {
            Ok(n) if n > 0 => buf[0] == ACK,
            _ => false
        };
        
        if !handshake_ok {
            log_to_file("Handshake failed, forcing message");
        }
        
        // Step 2: Send Message
        let message = build_payment_message(amount_cents);
        stream.write_all(&message).map_err(|e| format!("Send failed: {}", e))?;
        let _ = stream.flush();
        
        // Step 3: Wait for ACK
        std::thread::sleep(Duration::from_millis(500));
        let mut ack_buf = [0u8; 64];
        match stream.read(&mut ack_buf) {
            Ok(n) if n > 0 => {
                 // If format rejected (ENQ, EOT, NAK), try alternate format
                 if ack_buf[0] == ENQ || ack_buf[0] == EOT || ack_buf[0] == NAK {
                    log_to_file("Standard format rejected, trying simple ASCII");
                    return try_alternate_format(&mut stream, amount_cents);
                }
            }
            _ => log_to_file("No ACK received"),
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
                return Err("Timeout (120s)".to_string());
            }
            
            match stream.read(&mut response[total..]) {
                Ok(n) if n > 0 => {
                    total += n;
                    if response[..total].contains(&ETX) || response[..total].contains(&EOT) {
                        break;
                    }
                }
                Ok(_) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => {
                     // check for timeout error kind
                     if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock {
                         // continue waiting if we haven't hit 120s global limit
                         if total > 0 { break; } // if we have partial data, maybe assume done?
                         continue;
                     }
                     return Err(format!("Read error: {}", e));
                }
            }
        }
        
        let _ = stream.write_all(&[ACK]);
        
        let raw = bytes_to_hex(&response[..total]);
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
            
            // Success detection: '0' in body (Concert: ResponseCode '0')
            if body.contains(&b'0') { 
                  return Ok(TpePaymentResponse {
                    success: true,
                    transaction_result: "0".to_string(),
                    amount_cents,
                    authorization_number: None,
                    error_message: None,
                    raw_response: Some(raw.to_string()),
                });
             }
        }
    }
    
    // Simple ACK or just raw data without framing is ambiguous
    Ok(TpePaymentResponse {
        success: false,
        transaction_result: "?".to_string(),
        amount_cents,
        authorization_number: None,
        error_message: Some(format!("No success code found in: {}", raw)),
        raw_response: Some(raw.to_string()),
    })
}

#[tauri::command]
pub async fn cancel_tpe_transaction(port_name: String, baud_rate: u32) -> Result<String, String> {
    let result = tokio::task::spawn_blocking(move || {
        let mut stream = connect(&port_name, baud_rate)?;
        stream.write_all(&[EOT]).map_err(|e| format!("Cancel failed: {}", e))?;
        Ok("Cancel Sent".to_string())
    }).await;
    
    match result {
        Ok(res) => res,
        Err(e) => Err(format!("Thread error: {}", e))
    }
}

/// Try alternate ASCII format (Simple "DEBIT X.XX EUR")
fn try_alternate_format(stream: &mut Box<dyn TpeStream>, amount_cents: u32) -> Result<TpePaymentResponse, String> {
    log_to_file("Trying ASCII format: amount in plain text");
    
    // Some TPEs accept plain: "DEBIT 10.00 EUR\r\n"
    let amount_euros = amount_cents as f64 / 100.0;
    // Using \r (CR) is standard for line ending in serial
    let message = format!("DEBIT {:.2} EUR\r", amount_euros); 
    
    log_to_file(&format!("Sending fallback: {}", message.trim()));
    if let Err(e) = stream.write_all(message.as_bytes()) {
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
    
    std::thread::sleep(Duration::from_millis(500));
    
    // Wait for response to ASCII command
    let mut buf = [0u8; 256];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => {
            let hex = bytes_to_hex(&buf[..n]);
            let text = String::from_utf8_lossy(&buf[..n]);
            log_to_file(&format!("Alternate response: {} ({})", text.trim(), hex));
            
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
        _ => Err("Pas de réponse au format alternatif".to_string()),
    }
}
