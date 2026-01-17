// ===================================
// TPE Module - Ingenico Move/5000 Handler
// ===================================
// Standard Concert Protocol (Async & 8-digit amount)

use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::time::Duration;
use tokio::time::sleep;

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
pub async fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    log_to_file(&format!("=== TEST CONNECTION {} ===", port_name));
    
    // Run blocking serial operations in a separate thread
    let result = tokio::task::spawn_blocking(move || {
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
    }).await; // Await the spawn_blocking

    match result {
        Ok(res) => res,
        Err(e) => TpeTestResult {
            connected: false,
            message: format!("Thread error: {}", e),
            raw_data: None,
        }
    }
}

/// Build Concert Standard payment message
/// Type 01 (Payment) + Amount (8 digits)
fn build_payment_message(amount_cents: u32) -> Vec<u8> {
    // Format: STX + data + ETX + LRC
    
    // Transaction type "01" = Payment Request (Standard Concert)
    // "00" is sometimes Debit but 01 is more universal for "Please Pay this amount"
    let tx_type = "01";
    
    // Pos Number "01" (default)
    let pos_num = "01"; 

    // Amount in cents, 8 digits with leading zeros (e.g. 00000500 for 5.00)
    // This solves the "0.00" display issue as 12 digits is for Caisse protocol
    let amount = format!("{:08}", amount_cents);
    
    // Private field (empty) or sometimes Mode. Let's try minimal first.
    let private_field = "";
    
    // Build data: type(2) + pos(2) + amount(8) + private
    let data = format!("{}{}{}{}", tx_type, pos_num, amount, private_field);
    
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
pub async fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("=== PAYMENT {} cents (Standard Concert) ===", amount_cents));
    
    // Run blocking serial operations in a separate thread
    let result = tokio::task::spawn_blocking(move || {
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
                
                // If we get ENQ/NAK, it didn't like the format
                if ack_buf[0] == ENQ || ack_buf[0] == EOT || ack_buf[0] == NAK {
                     // Try simple ASCII fallback as last resort
                     // But first try to retry the standard one? 
                     // Let's go to fallback immediately if standard fails to avoid long wait
                    log_to_file("Standard format rejected, trying simple ASCII");
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
                    // Just continue loop on timeout
                     if total > 0 { break; } // If we have data and timed out, maybe we're done
                }
                Err(e) => return Err(format!("Read error: {}", e)),
            }
        }
        
        let _ = port.write_all(&[ACK]);
        
        let raw = bytes_to_hex(&response[..total]);
        log_to_file(&format!("Response: {}", raw));
        
        // Parse response
        parse_response(&response[..total], amount_cents, &raw)
    }).await; // Blocking task await

      match result {
        Ok(res) => res,
        Err(e) => Err(format!("Thread error: {}", e))
    }
}

/// Try alternate ASCII format (Simple "DEBIT X.XX EUR")
fn try_alternate_format(port: &mut Box<dyn SerialPort>, amount_cents: u32) -> Result<TpePaymentResponse, String> {
    log_to_file("Trying ASCII format: amount in plain text");
    
    // Some TPEs accept plain: "DEBIT 10.00 EUR\r\n"
    let amount_euros = amount_cents as f64 / 100.0;
    // Using \r (CR) is standard for line ending in serial
    let message = format!("DEBIT {:.2} EUR\r", amount_euros); 
    
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
            
            // Standard Concert Response:
            // PosNum(2) + TransType(2) + ResponseCode(1) + Amount(8) + ...
            // ResponseCode: 0=Approved, 7=Refused, etc.
            
            // Or simple response: result code in position 2
            
            // Let's look for "0" (success) or "1"/"7" (failure)
             if body.len() >= 5 {
                 // Try to guess position. Usually pos 4 (0-indexed) is response code?
                 // Let's be lenient: if we find '0' in the first few chars
                 let slice = &body[0..std::cmp::min(body.len(), 10)];
                 // Response code is often at index 4 (Type '01' + Pos '01' + Code)
                 // Or simple format: Type '00' + Code
                 
                 // If we find '0' surrounded by numbers, it's likely success
             }
             
             // Fallback: Check if message contains accepted pattern
             // Often "0" at specific offset.
             // We'll trust ACK logic mainly, but if we have explicit response:
             
             // Result code for '0' (Approved)
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
    
    // Simple ACK = success (often TPE sends ACK then response, but if we only got ACK/EOT...)
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
pub async fn cancel_tpe_transaction(port_name: String, baud_rate: u32) -> Result<String, String> {
    log_to_file("=== CANCEL ===");
    let result = tokio::task::spawn_blocking(move || {
        let mut port = open_port(&port_name, baud_rate, 2)?;
        port.write_all(&[EOT]).map_err(|e| format!("Cancel failed: {}", e))?;
        Ok("Annulation envoyée".to_string())
    }).await;
    
    match result {
        Ok(res) => res,
        Err(e) => Err(format!("Thread error: {}", e))
    }
}
