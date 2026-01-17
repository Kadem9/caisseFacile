// ===================================
// TPE Module - Ingenico Move/5000 Handler
// ===================================
// With file logging for debugging and ENQ handshake

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

/// Format bytes as hex string for debugging
fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

/// Open serial port with safe settings
fn open_port(port_name: &str, baud_rate: u32, timeout_secs: u64) -> Result<Box<dyn SerialPort>, String> {
    log_to_file(&format!("Opening port {} at {} baud, timeout {}s", port_name, baud_rate, timeout_secs));
    
    serialport::new(port_name, baud_rate)
        .timeout(Duration::from_secs(timeout_secs))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .open()
        .map_err(|e| {
            let msg = format!("Impossible d'ouvrir {}: {}", port_name, e);
            log_to_file(&msg);
            msg
        })
}

/// Calculate LRC (XOR of all bytes)
fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

// ===================================
// TPE Commands
// ===================================

/// Test TPE connection - just checks if port can be opened and sends ENQ
#[tauri::command]
pub fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    log_to_file(&format!("=== TEST CONNECTION {} ===", port_name));
    
    let port_result = open_port(&port_name, baud_rate, 3);
    
    match port_result {
        Ok(mut port) => {
            log_to_file("Port opened successfully");
            
            // Send ENQ
            if let Err(e) = port.write_all(&[ENQ]) {
                log_to_file(&format!("Write ENQ failed: {}", e));
                return TpeTestResult {
                    connected: false,
                    message: format!("Port ouvert mais erreur d'écriture: {}", e),
                    raw_data: None,
                };
            }
            log_to_file("ENQ sent (05)");
            
            let _ = port.flush();
            std::thread::sleep(Duration::from_millis(200));
            
            // Read response
            let mut buffer = [0u8; 64];
            match port.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let hex = bytes_to_hex(&buffer[..n]);
                    log_to_file(&format!("Response: {} ({} bytes)", hex, n));
                    
                    let is_ack = buffer[0] == ACK;
                    
                    TpeTestResult {
                        connected: true,
                        message: if is_ack {
                            "TPE connecté - ACK reçu ✓".to_string()
                        } else {
                            format!("TPE répond ({} octets): {}", n, hex)
                        },
                        raw_data: Some(hex),
                    }
                }
                Ok(_) => {
                    log_to_file("No response (0 bytes)");
                    TpeTestResult {
                        connected: true,
                        message: "Port ouvert, pas de réponse".to_string(),
                        raw_data: None,
                    }
                }
                Err(e) => {
                    log_to_file(&format!("Read error: {}", e));
                    TpeTestResult {
                        connected: e.kind() == std::io::ErrorKind::TimedOut,
                        message: if e.kind() == std::io::ErrorKind::TimedOut {
                            "Port ouvert, timeout (TPE ne répond pas)".to_string()
                        } else {
                            format!("Erreur: {}", e)
                        },
                        raw_data: None,
                    }
                }
            }
        }
        Err(e) => {
            log_to_file(&format!("Port open failed: {}", e));
            TpeTestResult {
                connected: false,
                message: e,
                raw_data: None,
            }
        }
    }
}

/// Send payment to TPE
#[tauri::command]
pub fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("=== PAYMENT {} cents ===", amount_cents));
    
    let mut port = open_port(&port_name, baud_rate, 5)?;
    
    // Step 1: Send ENQ and wait for ACK (handshake)
    log_to_file("Step 1: Sending ENQ for handshake");
    port.write_all(&[ENQ]).map_err(|e| {
        log_to_file(&format!("ENQ send failed: {}", e));
        format!("Erreur envoi ENQ: {}", e)
    })?;
    let _ = port.flush();
    
    std::thread::sleep(Duration::from_millis(100));
    
    let mut ack_buf = [0u8; 1];
    match port.read(&mut ack_buf) {
        Ok(1) if ack_buf[0] == ACK => {
            log_to_file("Handshake OK - ACK received");
        }
        Ok(1) => {
            log_to_file(&format!("Unexpected response to ENQ: {:02X}", ack_buf[0]));
            // Continue anyway
        }
        Ok(_) => {
            log_to_file("No response to ENQ");
            return Err("TPE ne répond pas au handshake".to_string());
        }
        Err(e) => {
            log_to_file(&format!("ENQ read error: {}", e));
            return Err(format!("Timeout handshake: {}", e));
        }
    }
    
    // Step 2: Build and send Concert V2 payment message
    // Format: STX + data + ETX + LRC
    // Data: pos_number(2) + amount(8) + mode(1) + currency(3) + private(10)
    let pos = format!("{:0>2}", &pos_number[..pos_number.len().min(2)]);
    let amount = format!("{:08}", amount_cents);
    let mode = "1";       // 1 = card payment
    let currency = "978"; // EUR
    let private = "          "; // 10 spaces
    
    let data = format!("{}{}{}{}{}", pos, amount, mode, currency, private);
    log_to_file(&format!("Message data: {}", data));
    
    // Calculate LRC (on data + ETX)
    let mut lrc_input: Vec<u8> = data.as_bytes().to_vec();
    lrc_input.push(ETX);
    let lrc = calculate_lrc(&lrc_input);
    
    // Build full message
    let mut message: Vec<u8> = Vec::new();
    message.push(STX);
    message.extend_from_slice(data.as_bytes());
    message.push(ETX);
    message.push(lrc);
    
    log_to_file(&format!("Sending: {}", bytes_to_hex(&message)));
    
    port.write_all(&message).map_err(|e| {
        log_to_file(&format!("Message send failed: {}", e));
        format!("Erreur envoi message: {}", e)
    })?;
    let _ = port.flush();
    
    // Step 3: Wait for ACK of message reception
    log_to_file("Waiting for message ACK...");
    std::thread::sleep(Duration::from_millis(100));
    
    let mut msg_ack = [0u8; 1];
    match port.read(&mut msg_ack) {
        Ok(1) => {
            log_to_file(&format!("Message response: {:02X}", msg_ack[0]));
            if msg_ack[0] == NAK {
                return Err("TPE a refusé le message (NAK) - format incorrect".to_string());
            }
        }
        Ok(_) => {
            log_to_file("No ACK for message");
        }
        Err(e) => {
            log_to_file(&format!("Message ACK error: {}", e));
            if e.kind() == std::io::ErrorKind::TimedOut {
                return Err("Timeout - TPE ne répond pas au message".to_string());
            }
        }
    }
    
    // Step 4: Wait for payment completion (long wait)
    log_to_file("Waiting for payment completion (up to 120s)...");
    port.set_timeout(Duration::from_secs(120)).ok();
    
    let mut response_buffer = [0u8; 256];
    let mut total_read = 0;
    let start = std::time::Instant::now();
    
    loop {
        if start.elapsed().as_secs() > 120 {
            log_to_file("Payment timeout (120s)");
            return Err("Timeout - Paiement non complété (120s)".to_string());
        }
        
        match port.read(&mut response_buffer[total_read..]) {
            Ok(n) if n > 0 => {
                total_read += n;
                log_to_file(&format!("Received {} bytes, total: {}", n, total_read));
                
                // Check for ETX (end of message) or EOT
                if response_buffer[..total_read].contains(&ETX) 
                    || response_buffer[..total_read].contains(&EOT) {
                    log_to_file("End of message marker found");
                    break;
                }
            }
            Ok(_) => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                if total_read > 0 {
                    break;
                }
                continue;
            }
            Err(e) => {
                log_to_file(&format!("Read error: {}", e));
                return Err(format!("Erreur lecture: {}", e));
            }
        }
    }
    
    // Send ACK to confirm reception
    let _ = port.write_all(&[ACK]);
    
    // Parse response
    let raw_hex = bytes_to_hex(&response_buffer[..total_read]);
    log_to_file(&format!("Full response: {}", raw_hex));
    
    // Find STX and ETX
    let stx_pos = response_buffer[..total_read].iter().position(|&b| b == STX);
    let etx_pos = response_buffer[..total_read].iter().position(|&b| b == ETX);
    
    if let (Some(start_idx), Some(end_idx)) = (stx_pos, etx_pos) {
        if end_idx > start_idx {
            let body = &response_buffer[start_idx + 1..end_idx];
            let body_str = String::from_utf8_lossy(body);
            log_to_file(&format!("Response body: {}", body_str));
            
            // Parse: pos(2) + result(1) + amount(8) + ...
            if body.len() >= 11 {
                let result_char = body_str.chars().nth(2).unwrap_or('9');
                let success = result_char == '0';
                
                log_to_file(&format!("Result: {} (success={})", result_char, success));
                
                return Ok(TpePaymentResponse {
                    success,
                    transaction_result: result_char.to_string(),
                    amount_cents,
                    authorization_number: None,
                    error_message: if success { None } else { Some(format!("Code erreur: {}", result_char)) },
                    raw_response: Some(raw_hex),
                });
            }
        }
    }
    
    // Fallback
    if total_read > 0 && response_buffer[0] == ACK {
        log_to_file("Simple ACK response - treating as success");
        return Ok(TpePaymentResponse {
            success: true,
            transaction_result: "0".to_string(),
            amount_cents,
            authorization_number: None,
            error_message: None,
            raw_response: Some(raw_hex),
        });
    }
    
    log_to_file("Could not parse response");
    Ok(TpePaymentResponse {
        success: false,
        transaction_result: "?".to_string(),
        amount_cents,
        authorization_number: None,
        error_message: Some(format!("Réponse non parsée: {}", raw_hex)),
        raw_response: Some(raw_hex),
    })
}

/// Cancel ongoing TPE transaction
#[tauri::command]
pub fn cancel_tpe_transaction(port_name: String, baud_rate: u32) -> Result<String, String> {
    log_to_file("=== CANCEL TRANSACTION ===");
    let mut port = open_port(&port_name, baud_rate, 2)?;
    
    port.write_all(&[EOT])
        .map_err(|e| format!("Erreur d'annulation: {}", e))?;
    
    log_to_file("EOT sent");
    Ok("Annulation envoyée".to_string())
}
