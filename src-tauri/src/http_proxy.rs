// HTTP Proxy module for Windows compatibility
// Makes HTTP requests from Rust to bypass WebView2 limitations

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub headers: HashMap<String, String>,
}

/// Make an HTTP request from Rust (bypasses WebView2 CORS restrictions on Windows)
#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    println!("[HTTP Proxy] {} {}", request.method, request.url);
    
    let client = reqwest::Client::new();
    
    let mut req_builder = match request.method.to_uppercase().as_str() {
        "GET" => client.get(&request.url),
        "POST" => client.post(&request.url),
        "PUT" => client.put(&request.url),
        "DELETE" => client.delete(&request.url),
        "PATCH" => client.patch(&request.url),
        "HEAD" => client.head(&request.url),
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };
    
    // Add headers
    for (key, value) in &request.headers {
        req_builder = req_builder.header(key, value);
    }
    
    // Add body if present
    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }
    
    // Send request
    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    
    let status = response.status().as_u16();
    let ok = response.status().is_success();
    
    // Collect response headers
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            headers.insert(key.to_string(), v.to_string());
        }
    }
    
    // Get response body
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    
    println!("[HTTP Proxy] Response: {} ({})", status, if ok { "OK" } else { "Error" });
    
    Ok(HttpResponse {
        status,
        ok,
        body,
        headers,
    })
}
