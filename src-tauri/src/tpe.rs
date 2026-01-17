// ===================================
// TPE Module - Ingenico Move/5000 Handler
// ===================================
// Simplified protocol with robust error handling

use serde::{Deserialize, Serialize};
use serialport::SerialPort;
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

// ===================================
// Helper Functions
// ===================================

/// Calculate LRC (XOR of all bytes)
fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

/// Format bytes as hex string for debugging
fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

/// Open serial port with safe settings
fn open_port(port_name: &str, baud_rate: u32, timeout_secs: u64) -> Result<Box<dyn SerialPort>, String> {
    serialport::new(port_name, baud_rate)
        .timeout(Duration::from_secs(timeout_secs))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .open()
        .map_err(|e| format!("Impossible d'ouvrir {}: {}", port_name, e))
}

// ===================================
// TPE Commands
// ===================================

/// Test TPE connection - just checks if port can be opened and sends ENQ
#[tauri::command]
pub fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    // Try to open port with short timeout
    let port_result = open_port(&port_name, baud_rate, 2);
    
    match port_result {
        Ok(mut port) => {
            // Try sending ENQ
            if let Err(e) = port.write_all(&[ENQ]) {
                return TpeTestResult {
                    connected: false,
                    message: format!("Port ouvert mais erreur d'écriture: {}", e),
                    raw_data: None,
                };
            }
            
            // Try to flush
            let _ = port.flush();
            
            // Wait a bit and try to read response
            std::thread::sleep(Duration::from_millis(100));
            
            let mut buffer = [0u8; 64];
            match port.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let hex = bytes_to_hex(&buffer[..n]);
                    let is_ack = buffer[0] == ACK;
                    let is_nak = buffer[0] == NAK;
                    
                    TpeTestResult {
                        connected: true,
                        message: if is_ack {
                            "TPE connecté - ACK reçu ✓".to_string()
                        } else if is_nak {
                            "TPE connecté - NAK reçu".to_string()
                        } else {
                            format!("TPE répond ({} octets)", n)
                        },
                        raw_data: Some(hex),
                    }
                }
                Ok(_) => TpeTestResult {
                    connected: true,
                    message: "Port ouvert, pas de réponse (normal pour certains TPE)".to_string(),
                    raw_data: None,
                },
                Err(e) => {
                    // Timeout is OK - means port is open but no response
                    if e.kind() == std::io::ErrorKind::TimedOut {
                        TpeTestResult {
                            connected: true,
                            message: "Port ouvert, TPE ne répond pas au ENQ".to_string(),
                            raw_data: None,
                        }
                    } else {
                        TpeTestResult {
                            connected: false,
                            message: format!("Erreur de lecture: {}", e),
                            raw_data: None,
                        }
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

/// Send payment to TPE with Concert-like protocol
/// Returns immediately with pending status if TPE acknowledges
#[tauri::command]
pub fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    // Open port with 5 second timeout for initial send
    let mut port = open_port(&port_name, baud_rate, 5)?;
    
    // Build simple Concert V2 message
    // Format: STX + pos(2) + amount(8) + mode(1) + flag(1) + ETX + LRC
    let pos = format!("{:0>2}", &pos_number[..pos_number.len().min(2)]);
    let amount = format!("{:08}", amount_cents);
    let mode = "1"; // Card payment
    let flag = "0"; // Request response
    
    let body = format!("{}{}{}{}", pos, amount, mode, flag);
    
    // Calculate LRC (body + ETX)
    let mut lrc_data: Vec<u8> = body.as_bytes().to_vec();
    lrc_data.push(ETX);
    let lrc = calculate_lrc(&lrc_data);
    
    // Build full message
    let mut message: Vec<u8> = Vec::new();
    message.push(STX);
    message.extend_from_slice(body.as_bytes());
    message.push(ETX);
    message.push(lrc);
    
    // Log for debugging
    let msg_hex = bytes_to_hex(&message);
    eprintln!("[TPE] Sending: {}", msg_hex);
    
    // Send message
    port.write_all(&message)
        .map_err(|e| format!("Erreur d'envoi: {}", e))?;
    
    port.flush()
        .map_err(|e| format!("Erreur flush: {}", e))?;
    
    // Wait for initial response (ACK/NAK or start of data)
    let mut initial_buffer = [0u8; 1];
    match port.read(&mut initial_buffer) {
        Ok(1) => {
            let byte = initial_buffer[0];
            eprintln!("[TPE] Initial response: {:02X}", byte);
            
            if byte == NAK {
                return Err("TPE a refusé le message (NAK)".to_string());
            }
            
            // If not ACK, might be start of data, continue reading
            if byte != ACK {
                // This byte might be part of response, prepend it
            }
        }
        Ok(_) => {
            return Err("Pas de réponse initiale du TPE".to_string());
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::TimedOut {
                return Err("Timeout - TPE ne répond pas".to_string());
            }
            return Err(format!("Erreur lecture: {}", e));
        }
    }
    
    // Now wait for payment completion (longer timeout)
    // Set longer timeout for payment
    port.set_timeout(Duration::from_secs(120))
        .map_err(|e| format!("Erreur timeout: {}", e))?;
    
    let mut response_buffer = [0u8; 256];
    let mut total_read = 0;
    let max_wait = 120; // seconds
    let start = std::time::Instant::now();
    
    loop {
        if start.elapsed().as_secs() > max_wait {
            return Err("Timeout - Paiement non complété".to_string());
        }
        
        match port.read(&mut response_buffer[total_read..]) {
            Ok(n) if n > 0 => {
                total_read += n;
                eprintln!("[TPE] Received {} bytes, total: {}", n, total_read);
                
                // Check for ETX to know message is complete
                if response_buffer[..total_read].contains(&ETX) {
                    break;
                }
                
                // Safety limit
                if total_read >= 200 {
                    break;
                }
            }
            Ok(_) => {
                // No data, wait a bit
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                // Check if we have any data
                if total_read > 0 {
                    break;
                }
                // Still waiting for payment
                continue;
            }
            Err(e) => {
                return Err(format!("Erreur lecture: {}", e));
            }
        }
    }
    
    // Send ACK to confirm we received the response
    let _ = port.write_all(&[ACK]);
    
    // Parse response
    let raw_hex = bytes_to_hex(&response_buffer[..total_read]);
    eprintln!("[TPE] Full response: {}", raw_hex);
    
    // Try to parse Concert response
    // Find STX and ETX
    let stx_pos = response_buffer[..total_read].iter().position(|&b| b == STX);
    let etx_pos = response_buffer[..total_read].iter().position(|&b| b == ETX);
    
    match (stx_pos, etx_pos) {
        (Some(start), Some(end)) if end > start => {
            let body = &response_buffer[start + 1..end];
            let body_str = String::from_utf8_lossy(body);
            eprintln!("[TPE] Response body: {}", body_str);
            
            // Parse: pos(2) + result(1) + amount(8) + ...
            if body.len() >= 11 {
                let result_char = body_str.chars().nth(2).unwrap_or('9');
                let success = result_char == '0';
                
                return Ok(TpePaymentResponse {
                    success,
                    transaction_result: result_char.to_string(),
                    amount_cents,
                    authorization_number: None,
                    error_message: if success { None } else { Some(format!("Code: {}", result_char)) },
                    raw_response: Some(raw_hex),
                });
            }
        }
        _ => {}
    }
    
    // Fallback: check first bytes for simple success indicators
    if total_read > 0 {
        // Some TPEs just send ACK for success
        if response_buffer[0] == ACK || (total_read > 2 && response_buffer[2] == b'0') {
            return Ok(TpePaymentResponse {
                success: true,
                transaction_result: "0".to_string(),
                amount_cents,
                authorization_number: None,
                error_message: None,
                raw_response: Some(raw_hex),
            });
        }
    }
    
    // Could not parse response
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
    let mut port = open_port(&port_name, baud_rate, 2)?;
    
    // Send NAK to cancel
    port.write_all(&[NAK])
        .map_err(|e| format!("Erreur d'annulation: {}", e))?;
    
    Ok("Annulation envoyée".to_string())
}
