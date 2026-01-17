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
// use tokio::time::sleep; // Removed unused import

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

fn build_payment_message(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    let tx_type = "01"; // Payment
    
    // Safely handle pos_number to be exactly 2 digits
    let pos_num = if pos_number.len() >= 2 { 
        pos_number[..2].to_string() 
    } else if pos_number.len() == 1 { 
        format!("0{}", pos_number) 
    } else { 
        "01".to_string() 
    };
    
    // Concert V3: 10 digits for amount
    let amount = format!("{:010}", amount_cents);
    
    // Currency code: 978 = EUR
    let currency = "978"; 
    
    let data = format!("{}{}{}{}", tx_type, pos_num, amount, currency);
    println!("Building Concert message Data (length {}): {}", data.len(), data);
    
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

/// Build a TLV (Type-Length-Value) message for Nepting terminals
/// Format: TAG(2 chars) + LENGTH(3 digits) + VALUE
fn build_nepting_tlv_payment(amount_cents: u32, pos_id: &str, transaction_id: &str) -> String {
    // Helper to create a TLV field
    fn tlv(tag: &str, value: &str) -> String {
        format!("{}{:03}{}", tag, value.len(), value)
    }
    
    let mut msg = String::new();
    
    // PT = Protocol version (must be first)
    msg.push_str(&tlv("PT", "001"));
    
    // OP = Operation type (PAY = payment)
    msg.push_str(&tlv("OP", "PAY"));
    
    // AM = Amount in smallest currency unit (centimes)
    let amount_str = format!("{}", amount_cents);
    msg.push_str(&tlv("AM", &amount_str));
    
    // CU = Currency (ISO 4217: EUR)
    msg.push_str(&tlv("CU", "EUR"));
    
    // CR = Cash Register ID
    let cr_id = if pos_id.is_empty() { "P1" } else { pos_id };
    msg.push_str(&tlv("CR", cr_id));
    
    // TI = Transaction ID (unique identifier)
    let tx_id = if transaction_id.is_empty() { 
        format!("TX{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() % 1000000)
    } else { 
        transaction_id.to_string() 
    };
    msg.push_str(&tlv("TI", &tx_id));
    
    // Add newline terminator (common for text-based APIs)
    msg.push('\n');
    
    println!("Built Nepting TLV message ({}bytes): {}", msg.len(), msg.trim());
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
    
    // Explicit ASCII mode requested (legacy fallback)
    if port_name.ends_with("+ASCII") {
        let clean_port = port_name.replace("+ASCII", "");
        return tokio::task::spawn_blocking(move || {
             let mut stream = connect(&clean_port, baud_rate)?;
             try_alternate_format(&mut stream, amount_cents)
         }).await.map_err(|e| format!("Thread error: {}", e))?;
    }
    
    // All connections use Concert V3 protocol (both TCP and Serial)
    println!("--- CONCERT V3 MODE ---");

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
        let message = build_payment_message(amount_cents, &pos_number);
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

/// Send payment using Nepting TLV protocol (for TCP connections)
fn send_nepting_payment(address: &str, amount_cents: u32, pos_id: &str) -> Result<TpePaymentResponse, String> {
    log_to_file(&format!("Nepting payment: {} cents to {}", amount_cents, address));
    
    // Build TLV message
    let tlv_message = build_nepting_tlv_payment(amount_cents, pos_id, "");
    
    // Connect to terminal
    let clean_addr = address.trim_end_matches("+ASCII");
    let mut stream = TcpStream::connect_timeout(
        &clean_addr.parse().map_err(|e| format!("Invalid IP: {}", e))?,
        Duration::from_secs(3)
    ).map_err(|e| format!("TCP connection failed: {}", e))?;
    
    stream.set_read_timeout(Some(Duration::from_secs(120))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
    
    // Send TLV message (no ENQ/ACK handshake needed)
    println!("Sending TLV: {}", tlv_message);
    stream.write_all(tlv_message.as_bytes())
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
