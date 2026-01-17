// ===================================
// TPE Module - Concert V2 Protocol Handler
// ===================================

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
    pub pos_number: String, // 2 characters (01-99)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpePaymentRequest {
    pub amount_cents: u32,      // Amount in cents (e.g., 1000 = 10.00€)
    pub payment_mode: String,   // "card" or "check"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpePaymentResponse {
    pub success: bool,
    pub transaction_result: String,
    pub amount_cents: u32,
    pub authorization_number: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TpeTestResult {
    pub connected: bool,
    pub message: String,
}

// ===================================
// Concert V2 Protocol Constants
// ===================================

const STX: u8 = 0x02;  // Start of text
const ETX: u8 = 0x03;  // End of text
const ACK: u8 = 0x06;  // Acknowledge
const NAK: u8 = 0x15;  // Negative acknowledge
const ENQ: u8 = 0x05;  // Enquiry (used for connection test)

// ===================================
// Protocol Helpers
// ===================================

/// Calculate LRC (Longitudinal Redundancy Check)
fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

/// Build Concert V2 message
fn build_concert_message(pos_number: &str, amount_cents: u32, payment_mode: char) -> Vec<u8> {
    // Format: STX + pos_number(2) + amount(8) + answer_flag(1) + payment_mode(1) + ETX + LRC
    let amount_str = format!("{:08}", amount_cents);
    let answer_flag = '0'; // Request response from TPE
    
    let message_body = format!("{}{}{}{}", pos_number, amount_str, answer_flag, payment_mode);
    let mut full_message: Vec<u8> = Vec::new();
    
    // Build data for LRC calculation (includes ETX)
    let mut lrc_data: Vec<u8> = message_body.as_bytes().to_vec();
    lrc_data.push(ETX);
    
    let lrc = calculate_lrc(&lrc_data);
    
    // Build final message
    full_message.push(STX);
    full_message.extend_from_slice(message_body.as_bytes());
    full_message.push(ETX);
    full_message.push(lrc);
    
    full_message
}

/// Parse Concert V2 response
fn parse_concert_response(data: &[u8]) -> Result<TpePaymentResponse, String> {
    // Minimum response: STX + pos(2) + result(1) + amount(8) + mode(1) + ETX + LRC = 15 bytes
    if data.len() < 15 {
        return Err("Response too short".to_string());
    }
    
    // Find STX and ETX positions
    let stx_pos = data.iter().position(|&b| b == STX);
    let etx_pos = data.iter().position(|&b| b == ETX);
    
    match (stx_pos, etx_pos) {
        (Some(start), Some(end)) if end > start => {
            let body = &data[start + 1..end];
            
            if body.len() < 11 {
                return Err("Response body too short".to_string());
            }
            
            let body_str = String::from_utf8_lossy(body);
            
            // Parse fields
            // pos_number(2) + result(1) + amount(8) + mode(1) + ...
            let result_char = body_str.chars().nth(2).unwrap_or('9');
            let amount_str = &body_str[3..11];
            let amount_cents = amount_str.parse::<u32>().unwrap_or(0);
            
            let success = result_char == '0';
            let error_message = if !success {
                Some(match result_char {
                    '1' => "Transaction refusée".to_string(),
                    '2' => "Carte invalide".to_string(),
                    '3' => "Montant incorrect".to_string(),
                    '4' => "Transaction annulée".to_string(),
                    '5' => "Erreur de communication".to_string(),
                    _ => format!("Erreur code {}", result_char),
                })
            } else {
                None
            };
            
            Ok(TpePaymentResponse {
                success,
                transaction_result: result_char.to_string(),
                amount_cents,
                authorization_number: None, // Could be extracted from private data
                error_message,
            })
        }
        _ => Err("Invalid response format".to_string()),
    }
}

// ===================================
// TPE Commands
// ===================================

/// Test TPE connection
#[tauri::command]
pub fn test_tpe_connection(port_name: String, baud_rate: u32) -> TpeTestResult {
    let port_result = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_secs(3))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .open();
    
    match port_result {
        Ok(mut port) => {
            // Send ENQ to test connection
            let enq = [ENQ];
            match port.write_all(&enq) {
                Ok(_) => {
                    // Wait for response
                    let mut response = [0u8; 1];
                    match port.read(&mut response) {
                        Ok(_) => {
                            if response[0] == ACK || response[0] == NAK {
                                TpeTestResult {
                                    connected: true,
                                    message: "TPE connecté et répond".to_string(),
                                }
                            } else {
                                TpeTestResult {
                                    connected: true,
                                    message: "TPE connecté (réponse non standard)".to_string(),
                                }
                            }
                        }
                        Err(_) => {
                            // No response but port opened = might be connected
                            TpeTestResult {
                                connected: true,
                                message: "Port ouvert (TPE ne répond pas à ENQ)".to_string(),
                            }
                        }
                    }
                }
                Err(e) => TpeTestResult {
                    connected: false,
                    message: format!("Erreur d'écriture: {}", e),
                },
            }
        }
        Err(e) => TpeTestResult {
            connected: false,
            message: format!("Impossible d'ouvrir le port: {}", e),
        },
    }
}

/// Send payment request to TPE
#[tauri::command]
pub fn send_tpe_payment(
    port_name: String,
    baud_rate: u32,
    pos_number: String,
    amount_cents: u32,
) -> Result<TpePaymentResponse, String> {
    // Open serial port
    let port_result = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_secs(120)) // Long timeout for payment
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .open();
    
    let mut port = match port_result {
        Ok(p) => p,
        Err(e) => return Err(format!("Impossible d'ouvrir le port: {}", e)),
    };
    
    // Ensure pos_number is 2 characters
    let pos = format!("{:0>2}", &pos_number[..pos_number.len().min(2)]);
    
    // Build payment message (mode '1' = card payment)
    let message = build_concert_message(&pos, amount_cents, '1');
    
    // Send message
    match port.write_all(&message) {
        Ok(_) => {}
        Err(e) => return Err(format!("Erreur d'envoi: {}", e)),
    }
    
    // Wait for ACK
    let mut ack_buffer = [0u8; 1];
    match port.read_exact(&mut ack_buffer) {
        Ok(_) => {
            if ack_buffer[0] == NAK {
                return Err("TPE a refusé le message (NAK)".to_string());
            }
        }
        Err(e) => return Err(format!("Timeout en attente d'ACK: {}", e)),
    }
    
    // Wait for response (payment completion)
    let mut response_buffer = [0u8; 256];
    let mut total_read = 0;
    
    loop {
        match port.read(&mut response_buffer[total_read..]) {
            Ok(n) => {
                total_read += n;
                // Check if we have ETX (end of message)
                if response_buffer[..total_read].contains(&ETX) {
                    break;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                if total_read > 0 {
                    break;
                }
                return Err("Timeout en attente de réponse du TPE".to_string());
            }
            Err(e) => return Err(format!("Erreur de lecture: {}", e)),
        }
    }
    
    // Send ACK to confirm reception
    let _ = port.write_all(&[ACK]);
    
    // Parse response
    parse_concert_response(&response_buffer[..total_read])
}

/// Cancel ongoing TPE transaction
#[tauri::command]
pub fn cancel_tpe_transaction(port_name: String, baud_rate: u32) -> Result<String, String> {
    let port_result = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_secs(5))
        .open();
    
    let mut port = match port_result {
        Ok(p) => p,
        Err(e) => return Err(format!("Impossible d'ouvrir le port: {}", e)),
    };
    
    // Send NAK to cancel
    match port.write_all(&[NAK]) {
        Ok(_) => Ok("Annulation envoyée".to_string()),
        Err(e) => Err(format!("Erreur d'annulation: {}", e)),
    }
}
