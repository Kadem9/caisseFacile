// ===================================
// TPE Module - Ingenico Move/5000 Handler
// ===================================
// Simplified Caisse protocol with file logging

use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::time::Duration;

// ===================================
// Types
// ===================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TpeConfig {
    pub name: String,
    pub port: String,
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

const STX: u8 = 0x02;  // Start of text
const ETX: u8 = 0x03;  // End of text
const ACK: u8 = 0x06;  // Acknowledge
const NAK: u8 = 0x15;  // Negative acknowledge
const ENQ: u8 = 0x05;  // Enquiry
const EOT: u8 = 0x04;  // End of transmission

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

/// Format bytes as hex string
fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

/// Open serial port
fn open_port(port_name: &str, baud_rate: u32, timeout_secs: u64) -> Result<Box<dyn SerialPort>, String> {
    log_to_file(&format!("Opening port {} at {} baud", port_name, baud_rate));
    
    serialport::new(port_name, baud_rate)
        .timeout(Duration::from_secs(timeout_secs))
        .data_bits(serialport::DataBits::Seven) // 7 bits data
        .parity(serialport::Parity::Even)       // Even parity
        .stop_bits(serialport::StopBits::One)
        .open()
        .map_err(|e| {
            let msg = format!("Impossible d'ouvrir {}: {}", port_name, e);
            log_to_file(&msg);
            msg
        })
}

/// Calculate LRC
fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

// ===================================
// TPE Commands
// ===================================

#[tauri::command]
pub fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    log_to_file(&format!("=== TEST CONNECTION {} ===", port_name));
    
    // Try with 7E1 (7 data bits, Even parity) - common for Ingenico
    let port_result = open_port(&port_name, baud_rate, 3);
    
    match port_result {
        Ok(mut port) => {
            log_to_file("Port opened (7E1)");
            
            // Send ENQ
            if let Err(e) = port.write_all(&[ENQ]) {
                return TpeTestResult {
                    connected: false,
                    message: format!("Erreur écriture: {}", e),
                    raw_data: None,
                };
            }
            log_to_file("ENQ sent");
            let _ = port.flush();
            
            std::thread::sleep(Duration::from_millis(300));
            
            let mut buffer = [0u8; 64];
            match port.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let hex = bytes_to_hex(&buffer[..n]);
                    log_to_file(&format!("Response: {}", hex));
                    
                    TpeTestResult {
                        connected: true,
                        message: if buffer[0] == ACK {
                            "TPE connecté - ACK reçu ✓".to_string()
                        } else {
                            format!("TPE répond: {}", hex)
                        },
                        raw_data: Some(hex),
                    }
                }
                Ok(_) => TpeTestResult {
                    connected: true,
                    message: "Port ouvert, pas de réponse".to_string(),
                    raw_data: None,
                },
                Err(e) => {
                    log_to_file(&format!("Read error: {}", e));
                    TpeTestResult {
                        connected: e.kind() == std::io::ErrorKind::TimedOut,
                        message: if e.kind() == std::io::ErrorKind::TimedOut {
                            "Port ouvert, timeout".to_string()
                        } else {
                            format!("Erreur: {}", e)
                        },
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
}

/// Build Telium/Caisse style payment message
/// This is a simpler format used by many Ingenico terminals
fn build_payment_message(amount_cents: u32) -> Vec<u8> {
    // Format: STX + data + ETX + LRC
    // Data for debit transaction: Transaction type + Amount
    
    // Transaction type "00" = Purchase/Debit
    let tx_type = "00";
    // Amount in cents, 12 digits with leading zeros
    let amount = format!("{:012}", amount_cents);
    // Currency code EUR = 978
    let currency = "978";
    // Payment mode: C = Card
    let payment_mode = "C";
    // Private field (empty)
    let private_field = "";
    
    // Build data: type(2) + amount(12) + currency(3) + mode(1) + private
    let data = format!("{}{}{}{}{}", tx_type, amount, currency, payment_mode, private_field);
    
    // Calculate LRC on data + ETX
    let mut lrc_input: Vec<u8> = data.as_bytes().to_vec();
    lrc_input.push(ETX);
    let lrc = calculate_lrc(&lrc_input);
    
    // Build message
    let mut msg: Vec<u8> = Vec::new();
    msg.push(STX);
    msg.extend_from_slice(data.as_bytes());
    msg.push(ETX);
    msg.push(lrc);
    
    msg
}

#[tauri::command]
pub fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("=== PAYMENT {} cents (pos:{}) ===", amount_cents, pos_number));
    
    let mut port = open_port(&port_name, baud_rate, 5)?;
    
    // Step 1: ENQ handshake
    log_to_file("Step 1: ENQ");
    port.write_all(&[ENQ]).map_err(|e| format!("ENQ failed: {}", e))?;
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(200));
    
    let mut buf = [0u8; 64];
    let handshake_ok = match port.read(&mut buf) {
        Ok(n) if n > 0 => {
            log_to_file(&format!("Handshake response: {}", bytes_to_hex(&buf[..n])));
            buf[0] == ACK
        }
        _ => {
            log_to_file("No handshake response");
            false
        }
    };
    
    if !handshake_ok {
        log_to_file("Handshake failed, trying direct message anyway");
    }
    
    // Step 2: Build and send payment message
    let message = build_payment_message(amount_cents);
    log_to_file(&format!("Step 2: Sending {}", bytes_to_hex(&message)));
    
    port.write_all(&message).map_err(|e| format!("Send failed: {}", e))?;
    let _ = port.flush();
    
    // Step 3: Wait for ACK of message
    log_to_file("Step 3: Waiting for message ACK");
    std::thread::sleep(Duration::from_millis(500));
    
    let mut ack_buf = [0u8; 64];
    match port.read(&mut ack_buf) {
        Ok(n) if n > 0 => {
            let hex = bytes_to_hex(&ack_buf[..n]);
            log_to_file(&format!("Message response: {}", hex));
            
            // If we get ENQ+EOT, the TPE doesn't understand
            if ack_buf[0] == ENQ || ack_buf[0] == EOT || ack_buf[0] == NAK {
                // Try alternate simple format
                log_to_file("TPE didn't understand, trying alternate format");
                return try_alternate_format(&mut port, amount_cents);
            }
        }
        Ok(_) => {
            log_to_file("No message ACK");
        }
        Err(e) => {
            log_to_file(&format!("ACK wait error: {}", e));
            if e.kind() == std::io::ErrorKind::TimedOut {
                return Err("Timeout - TPE ne répond pas".to_string());
            }
        }
    }
    
    // Step 4: Wait for payment result (long timeout)
    log_to_file("Step 4: Waiting for payment (120s)...");
    port.set_timeout(Duration::from_secs(120)).ok();
    
    let mut response = [0u8; 256];
    let mut total = 0;
    let start = std::time::Instant::now();
    
    loop {
        if start.elapsed().as_secs() > 120 {
            return Err("Timeout paiement (120s)".to_string());
        }
        
        match port.read(&mut response[total..]) {
            Ok(n) if n > 0 => {
                total += n;
                log_to_file(&format!("Received {} bytes", n));
                if response[..total].contains(&ETX) || response[..total].contains(&EOT) {
                    break;
                }
            }
            Ok(_) => std::thread::sleep(Duration::from_millis(200)),
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                if total > 0 { break; }
            }
            Err(e) => return Err(format!("Read error: {}", e)),
        }
    }
    
    let _ = port.write_all(&[ACK]);
    
    let raw = bytes_to_hex(&response[..total]);
    log_to_file(&format!("Response: {}", raw));
    
    // Parse response
    parse_response(&response[..total], amount_cents, &raw)
}

/// Try alternate ASCII format
fn try_alternate_format(port: &mut Box<dyn SerialPort>, amount_cents: u32) -> Result<TpePaymentResponse, String> {
    log_to_file("Trying ASCII format: amount in plain text");
    
    // Some TPEs accept plain: "DEBIT 10.00 EUR\r\n"
    let amount_euros = amount_cents as f64 / 100.0;
    let message = format!("DEBIT {:.2} EUR\r\n", amount_euros);
    
    log_to_file(&format!("Sending: {}", message.trim()));
    port.write_all(message.as_bytes()).map_err(|e| format!("Send failed: {}", e))?;
    let _ = port.flush();
    
    std::thread::sleep(Duration::from_millis(500));
    
    let mut buf = [0u8; 256];
    match port.read(&mut buf) {
        Ok(n) if n > 0 => {
            let hex = bytes_to_hex(&buf[..n]);
            let text = String::from_utf8_lossy(&buf[..n]);
            log_to_file(&format!("Alternate response: {} ({})", text.trim(), hex));
            
            Ok(TpePaymentResponse {
                success: false,
                transaction_result: "?".to_string(),
                amount_cents,
                authorization_number: None,
                error_message: Some(format!("Format non reconnu. Réponse: {}", hex)),
                raw_response: Some(hex),
            })
        }
        _ => Err("Pas de réponse au format alternatif".to_string()),
    }
}

fn parse_response(data: &[u8], amount_cents: u32, raw: &str) -> Result<TpePaymentResponse, String> {
    // Find STX-ETX block
    let stx = data.iter().position(|&b| b == STX);
    let etx = data.iter().position(|&b| b == ETX);
    
    if let (Some(s), Some(e)) = (stx, etx) {
        if e > s {
            let body = &data[s+1..e];
            let text = String::from_utf8_lossy(body);
            log_to_file(&format!("Parsed: {}", text));
            
            // Result code in position 2 (after 2 pos bytes)
            if body.len() >= 3 {
                let result = body[2];
                let success = result == b'0';
                
                return Ok(TpePaymentResponse {
                    success,
                    transaction_result: (result as char).to_string(),
                    amount_cents,
                    authorization_number: None,
                    error_message: if success { None } else { Some(format!("Code: {}", result as char)) },
                    raw_response: Some(raw.to_string()),
                });
            }
        }
    }
    
    // Simple ACK = success
    if !data.is_empty() && data[0] == ACK {
        return Ok(TpePaymentResponse {
            success: true,
            transaction_result: "0".to_string(),
            amount_cents,
            authorization_number: None,
            error_message: None,
            raw_response: Some(raw.to_string()),
        });
    }
    
    Ok(TpePaymentResponse {
        success: false,
        transaction_result: "?".to_string(),
        amount_cents,
        authorization_number: None,
        error_message: Some(format!("Réponse non parsée: {}", raw)),
        raw_response: Some(raw.to_string()),
    })
}

#[tauri::command]
pub fn cancel_tpe_transaction(port_name: String, baud_rate: u32) -> Result<String, String> {
    log_to_file("=== CANCEL ===");
    let mut port = open_port(&port_name, baud_rate, 2)?;
    port.write_all(&[EOT]).map_err(|e| format!("Cancel failed: {}", e))?;
    Ok("Annulation envoyée".to_string())
}
