use std::error::Error;
use std::net::SocketAddr;
use std::time::Instant;

use crate::services::api::{resolve_api_addrs, API_HOST};

fn format_socket_addrs(addrs: &[SocketAddr]) -> Vec<String> {
    addrs.iter().map(|addr| addr.to_string()).collect()
}

#[tauri::command]
pub async fn debug_network() -> Result<String, String> {
    let mut log = Vec::new();
    let host = API_HOST;
    let url = format!("https://{}/user/auth/token", host);

    log.push(format!("=== JuiceVault Network Debug ==="));
    log.push(format!("Target: {}", url));
    log.push(format!("OS: {}", std::env::consts::OS));
    log.push(format!("Arch: {}", std::env::consts::ARCH));
    log.push(format!(""));

    // 1) DNS resolution
    log.push(format!("--- DNS Resolution ---"));
    let dns_start = Instant::now();
    match tokio::net::lookup_host(format!("{}:443", host)).await {
        Ok(addrs) => {
            let elapsed = dns_start.elapsed();
            let ips: Vec<String> = addrs.map(|a| a.to_string()).collect();
            log.push(format!("OK ({:.0?}): {} addresses", elapsed, ips.len()));
            for ip in &ips {
                log.push(format!("  -> {}", ip));
            }
        }
        Err(e) => {
            log.push(format!("FAIL: {}", e));
            log.push(format!(""));
            log.push(format!("DNS resolution failed. The user's system cannot resolve {}", host));
            log.push(format!("Possible causes: DNS server issue, firewall, no internet"));
            return Ok(log.join("\n"));
        }
    }
    log.push(format!(""));

    // 2) TCP connect
    log.push(format!("--- TCP Connect ---"));
    let tcp_start = Instant::now();
    match tokio::net::TcpStream::connect(format!("{}:443", host)).await {
        Ok(_stream) => {
            log.push(format!("OK ({:.0?})", tcp_start.elapsed()));
        }
        Err(e) => {
            log.push(format!("FAIL: {} (kind: {:?})", e, e.kind()));
            log.push(format!(""));
            log.push(format!("TCP connection failed. Port 443 is blocked."));
            log.push(format!("Possible causes: firewall, antivirus, corporate proxy"));
            return Ok(log.join("\n"));
        }
    }
    log.push(format!(""));

    // 3) TLS handshake via native-tls
    log.push(format!("--- TLS Handshake (native-tls) ---"));
    let tls_start = Instant::now();
    match native_tls::TlsConnector::new() {
        Ok(connector) => {
            let connector = tokio_native_tls::TlsConnector::from(connector);
            match tokio::net::TcpStream::connect(format!("{}:443", host)).await {
                Ok(tcp) => {
                    match connector.connect(host, tcp).await {
                        Ok(_tls) => {
                            log.push(format!("OK ({:.0?})", tls_start.elapsed()));
                        }
                        Err(e) => {
                            log.push(format!("FAIL: {}", e));
                            log.push(format!(""));
                            log.push(format!("TLS handshake failed. The OS rejected the server certificate."));
                            log.push(format!("Possible causes: antivirus MITM, expired system certs, corporate proxy injecting certs"));
                        }
                    }
                }
                Err(e) => {
                    log.push(format!("TCP reconnect FAIL: {}", e));
                }
            }
        }
        Err(e) => {
            log.push(format!("TLS connector creation FAIL: {}", e));
            log.push(format!("The OS native TLS stack is broken or unavailable."));
        }
    }
    log.push(format!(""));

    // 4) reqwest (the client the app actually uses)
    log.push(format!("--- HTTP Request (reqwest rustls) ---"));
    let reqwest_start = Instant::now();
    let reqwest_client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("reqwest client build error: {}", e))?;

    match reqwest_client
        .post(&url)
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let headers = format!("{:?}", resp.headers());
            let body = resp.text().await.unwrap_or_else(|e| format!("body read error: {}", e));
            log.push(format!("OK ({:.0?})", reqwest_start.elapsed()));
            log.push(format!("Status: {}", status));
            log.push(format!("Headers: {}", &headers[..headers.len().min(300)]));
            log.push(format!("Body: {}", &body[..body.len().min(500)]));
        }
        Err(e) => {
            log.push(format!("FAIL: {}", e));
            if e.is_connect() {
                log.push(format!("Type: CONNECTION error"));
            }
            if e.is_timeout() {
                log.push(format!("Type: TIMEOUT"));
            }
            if e.is_request() {
                log.push(format!("Type: REQUEST build error"));
            }
            if let Some(source) = e.source() {
                log.push(format!("Source: {}", source));
                if let Some(inner) = source.source() {
                    log.push(format!("Inner: {}", inner));
                    if let Some(deep) = inner.source() {
                        log.push(format!("Deep: {}", deep));
                    }
                }
            }
        }
    }
    log.push(format!(""));

    // 5) environment checks
    log.push(format!("--- Environment ---"));
    for var in ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "SSL_CERT_FILE", "SSL_CERT_DIR"] {
        if let Ok(val) = std::env::var(var) {
            log.push(format!("{} = {}", var, val));
        }
    }
    log.push(format!(""));
    log.push(format!("=== Debug Complete ==="));

    Ok(log.join("\n"))
}
