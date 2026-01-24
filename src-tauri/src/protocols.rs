// TPE Protocol Builders
// Factorized protocol implementations for different TPE types

use std::time::SystemTime;

// Protocol constants
pub const STX: u8 = 0x02;
pub const ETX: u8 = 0x03;

/// Calculate LRC checksum (XOR of all bytes)
pub fn calculate_lrc(data: &[u8]) -> u8 {
    data.iter().fold(0u8, |acc, &byte| acc ^ byte)
}

/// Convert bytes to hex string for logging
pub fn bytes_to_hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

// ===================================
// TLV Helper (for Concert V3 / Caisse-AP)
// ===================================

fn tlv(tag: &str, value: &str) -> String {
    format!("{}{:03}{}", tag, value.len(), value)
}

// ===================================
// Protocol Builders
// ===================================

/// Concert V2 binary protocol (Ingenico older terminals)
/// Format: TYPE(1) + POS(2) + AMOUNT(8) + CURRENCY(3) = 14 chars
pub fn build_concert_v2(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    let pos_num = format_pos_number(pos_number);
    let tx_type = "0"; // Debit
    let amount = format!("{:08}", amount_cents);
    let data = format!("{}{}{}{}", tx_type, pos_num, amount, "978");
    
    frame_message(&data)
}

/// Concert V3 TLV protocol (Modern terminals, SmilePay)
/// Uses Tag-Length-Value format same as Caisse-AP IP
pub fn build_concert_v3_tlv(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    let pos_num = format_pos_number(pos_number);
    
    let mut msg = String::new();
    msg.push_str(&tlv("CZ", "0320")); // Protocol version 3.2
    msg.push_str(&tlv("CA", &pos_num)); // POS number
    msg.push_str(&tlv("CE", "978")); // Currency EUR
    msg.push_str(&tlv("BA", "0")); // Answer at end
    msg.push_str(&tlv("CD", "0")); // Debit transaction
    msg.push_str(&tlv("CB", &format!("{:012}", amount_cents))); // Amount 12 digits
    
    frame_message(&msg)
}

/// Concert V3 binary protocol (alternative format)
/// Format: TYPE(2) + POS(2) + AMOUNT(12) + CURRENCY(3) = 19 chars
pub fn build_concert_v3_binary(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    let pos_num = format_pos_number(pos_number);
    let tx_type = "00"; // Debit
    let amount = format!("{:012}", amount_cents);
    let data = format!("{}{}{}{}", tx_type, pos_num, amount, "978");
    
    frame_message(&data)
}

/// Caisse-AP IP protocol (TCP/IP terminals, Nepting)
/// Full TLV with transaction ID and label
pub fn build_caisse_ap_ip(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    let pos_num = format_pos_number(pos_number);
    
    // Generate transaction ID
    let tx_id = format!("{:06}", SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() % 1000000);
    
    let mut msg = String::new();
    msg.push_str(&tlv("CZ", "0320")); // Protocol version
    msg.push_str(&tlv("CA", &pos_num)); // POS number
    msg.push_str(&tlv("CE", "978")); // Currency
    msg.push_str(&tlv("BA", "0")); // Answer mode
    msg.push_str(&tlv("CD", "0")); // Transaction type
    msg.push_str(&tlv("CB", &format!("{:012}", amount_cents))); // Amount
    msg.push_str(&tlv("TI", &tx_id)); // Transaction ID
    msg.push_str(&tlv("LB", "CAISSE")); // Label
    
    frame_message(&msg)
}

/// SmilePay protocol (uses Concert V3 TLV)
/// SmilePay Smart/Super Smile terminals use standard Concert V3
pub fn build_smilepay(amount_cents: u32, pos_number: &str) -> Vec<u8> {
    // SmilePay uses Concert V3 TLV format
    build_concert_v3_tlv(amount_cents, pos_number)
}

// ===================================
// Yavin HTTP API Payloads
// ===================================

/// Build Yavin Local API JSON payload
pub fn build_yavin_local_payload(amount_cents: u32, terminal_id: &str) -> String {
    serde_json::json!({
        "serial_number": terminal_id,
        "amount": amount_cents,
        "currency": "EUR",
        "transaction_type": "PAYMENT"
    }).to_string()
}

/// Build Yavin Cloud API JSON payload
pub fn build_yavin_cloud_payload(amount_cents: u32, terminal_id: &str, merchant_ref: &str) -> String {
    serde_json::json!({
        "serial_number": terminal_id,
        "amount": amount_cents,
        "currency": "EUR",
        "transaction_type": "PAYMENT",
        "merchant_reference": merchant_ref
    }).to_string()
}

// ===================================
// Response Parsing
// ===================================

/// Concert response codes
pub struct ConcertResponse {
    pub success: bool,
    pub code: String,
    pub message: String,
}

/// Parse Concert protocol response
pub fn parse_concert_response(data: &[u8]) -> ConcertResponse {
    let stx = data.iter().position(|&b| b == STX);
    let etx = data.iter().position(|&b| b == ETX);
    
    if let (Some(s), Some(e)) = (stx, etx) {
        if e > s {
            let body = &data[s+1..e];
            let body_str = String::from_utf8_lossy(body);
            
            // Try to extract result code at position 1 (V2) or 2 (V3)
            let code = if body_str.len() >= 3 {
                let v2_code = &body_str[1..3.min(body_str.len())];
                let v3_code = if body_str.len() >= 4 { &body_str[2..4] } else { "" };
                
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
            
            let (success, message) = match code.as_str() {
                "00" => (true, "Transaction acceptée".to_string()),
                "01" => (false, "Transaction annulée".to_string()),
                "02" => (false, "Carte refusée".to_string()),
                "03" => (false, "Erreur communication".to_string()),
                "10" => (false, "Fonction impossible".to_string()),
                "11" => (false, "Timeout".to_string()),
                _ => (false, format!("Erreur inconnue ({})", code)),
            };
            
            return ConcertResponse { success, code, message };
        }
    }
    
    ConcertResponse {
        success: false,
        code: "??".to_string(),
        message: "Réponse invalide".to_string(),
    }
}

// ===================================
// Helper Functions
// ===================================

/// Format POS number to exactly 2 digits
fn format_pos_number(pos_number: &str) -> String {
    if pos_number.len() >= 2 { 
        pos_number[..2].to_string() 
    } else if pos_number.len() == 1 { 
        format!("0{}", pos_number) 
    } else { 
        "01".to_string() 
    }
}

/// Frame message with STX, ETX, and LRC
fn frame_message(data: &str) -> Vec<u8> {
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

// ===================================
// Protocol Enum
// ===================================

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TpeProtocol {
    ConcertV2,       // Binary format, 14 chars
    ConcertV3Tlv,    // TLV format (Caisse-AP style)
    ConcertV3Binary, // Binary format, 19 chars
    CaisseApIp,      // Full TLV with TX ID
    SmilePay,        // Uses Concert V3 TLV
    YavinLocal,      // HTTP Local API
    YavinCloud,      // HTTP Cloud API
}

impl TpeProtocol {
    pub fn from_version(version: u8) -> Self {
        match version {
            2 => TpeProtocol::ConcertV2,
            3 => TpeProtocol::ConcertV3Tlv,
            4 => TpeProtocol::ConcertV3Binary,
            5 => TpeProtocol::SmilePay,
            6 => TpeProtocol::YavinLocal,
            7 => TpeProtocol::YavinCloud,
            _ => TpeProtocol::ConcertV3Tlv, // Default
        }
    }
    
    pub fn name(&self) -> &'static str {
        match self {
            TpeProtocol::ConcertV2 => "Concert V2 (Binaire)",
            TpeProtocol::ConcertV3Tlv => "Concert V3 (TLV/Caisse-AP)",
            TpeProtocol::ConcertV3Binary => "Concert V3 (Binaire 19 chars)",
            TpeProtocol::CaisseApIp => "Caisse-AP IP (Nepting)",
            TpeProtocol::SmilePay => "SmilePay",
            TpeProtocol::YavinLocal => "Yavin (Local API)",
            TpeProtocol::YavinCloud => "Yavin (Cloud API)",
        }
    }
    
    pub fn is_http(&self) -> bool {
        matches!(self, TpeProtocol::YavinLocal | TpeProtocol::YavinCloud)
    }
}
