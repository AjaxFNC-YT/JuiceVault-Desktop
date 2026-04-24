use std::collections::HashSet;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::OnceLock;
use std::time::Duration;

use reqwest::Client;
use serde_json::Value;
use crate::models::user::{ApiResponse, AuthData, TokenData};

pub const API_HOST: &str = "api.juicevault.xyz";
const API_BASE: &str = "https://api.juicevault.xyz";

pub struct ApiClient;

pub fn resolve_api_addrs(ipv4_only: bool) -> Result<Vec<SocketAddr>, String> {
    let addrs = format!("{}:443", API_HOST)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed: {}", e))?;

    let mut addrs: Vec<SocketAddr> = addrs.collect();
    let mut seen = HashSet::new();
    addrs.retain(|addr| seen.insert(*addr));

    if ipv4_only {
        let ipv4_addrs: Vec<SocketAddr> = addrs
            .iter()
            .copied()
            .filter(SocketAddr::is_ipv4)
            .collect();

        if !ipv4_addrs.is_empty() {
            return Ok(ipv4_addrs);
        }
    }

    addrs.sort_by_key(|addr| if addr.is_ipv4() { 0 } else { 1 });
    Ok(addrs)
}

fn truncate_str(s: &str, max: usize) -> &str {
    match s.char_indices().nth(max) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

fn parse_api_error(text: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            return err.to_string();
        }
        if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
            return msg.to_string();
        }
    }
    format!("Request failed: {}", truncate_str(text, 200))
}

fn decode_jwt_payload(jwt: &str) -> Option<Value> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    let b64 = parts[1]
        .replace('-', "+")
        .replace('_', "/");

    let padded = match b64.len() % 4 {
        2 => format!("{}==", b64),
        3 => format!("{}=", b64),
        _ => b64,
    };

    let decoded = base64_decode(&padded).ok()?;
    serde_json::from_slice(&decoded).ok()
}

fn extract_ca(jwt: &str) -> Option<String> {
    let payload = decode_jwt_payload(jwt)?;
    payload.get("ca").and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub fn extract_ca_pub(jwt: &str) -> Option<String> {
    extract_ca(jwt)
}

/// Shared HTTP client that impersonates Chrome's TLS fingerprint.
/// This prevents Cloudflare bot protection from blocking the connection.
fn shared_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("failed to build HTTP client")
    })
}

impl ApiClient {
    pub fn new() -> Self {
        Self
    }

    pub async fn send<F>(&self, build_request: F) -> Result<reqwest::Response, String>
    where
        F: Fn(&Client) -> reqwest::RequestBuilder,
    {
        let client = shared_client();
        build_request(client).send().await.map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("InvalidContentType")
                || err_str.contains("invalid token")
                || err_str.contains("SEC_E_")
                || err_str.contains("certificate")
            {
                format!(
                    "Connection blocked: your antivirus or firewall is interfering with secure connections to {}. \
                     Try adding JuiceVault to your antivirus exceptions, or disable SSL/HTTPS inspection. \
                     Details: {}",
                    API_HOST, err_str
                )
            } else {
                format!("Network error: failed to reach {}. {}", API_HOST, err_str)
            }
        })
    }

    pub async fn get_login_token(&self) -> Result<(String, String), String> {
        let resp = self.send(|client| {
            client
                .post(format!("{}/user/auth/token", API_BASE))
                .header("Content-Type", "application/json")
        }).await?;

        let text = resp.text().await.map_err(|e| e.to_string())?;
        let parsed: ApiResponse<TokenData> = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        let data = parsed.data.ok_or_else(|| {
            parsed.error.unwrap_or_else(|| "Failed to get login token".into())
        })?;

        let ca = extract_ca(&data.token).unwrap_or_default();
        Ok((data.token, ca))
    }

    pub async fn login(&self, login: &str, password: &str) -> Result<AuthData, String> {
        let (token, ca) = self.get_login_token().await?;

        let login = login.to_string();
        let password = password.to_string();
        let resp = self.send(|client| {
            let mut req = client
                .post(format!("{}/user/auth/login", API_BASE))
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({
                    "loginToken": token,
                    "login": login,
                    "password": password,
                }));

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let text = resp.text().await.map_err(|e| e.to_string())?;

        let parsed: ApiResponse<AuthData> = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        parsed.data.ok_or_else(|| {
            parsed.error.unwrap_or_else(|| "Login failed".into())
        })
    }

    pub async fn register(
        &self,
        username: &str,
        display_name: &str,
        email: &str,
        password: &str,
    ) -> Result<AuthData, String> {
        let (token, ca) = self.get_login_token().await?;

        let mut body = serde_json::json!({
            "loginToken": token,
            "username": username,
            "email": email,
            "password": password,
        });

        if !display_name.is_empty() {
            body["displayName"] = serde_json::json!(display_name);
        }

        let resp = self.send(|client| {
            let mut req = client
                .post(format!("{}/user/auth/register", API_BASE))
                .header("Content-Type", "application/json")
                .json(&body);

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let text = resp.text().await.map_err(|e| e.to_string())?;

        let parsed: ApiResponse<AuthData> = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        parsed.data.ok_or_else(|| {
            parsed.error.unwrap_or_else(|| "Registration failed".into())
        })
    }

    pub async fn authed_get(&self, endpoint: &str, access_token: &str) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let endpoint = endpoint.to_string();
        let access_token = access_token.to_string();

        let resp = self.send(|client| {
            let mut req = client
                .get(format!("{}{}", API_BASE, endpoint))
                .header("Authorization", format!("Bearer {}", access_token));

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(parse_api_error(&text));
        }

        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        Ok(val)
    }

    pub async fn public_get(&self, endpoint: &str) -> Result<Value, String> {
        let endpoint = endpoint.to_string();
        let resp = self.send(|client| {
            client.get(format!("{}{}", API_BASE, endpoint))
        }).await?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn public_get_bytes(&self, endpoint: &str) -> Result<Vec<u8>, String> {
        let endpoint = endpoint.to_string();
        let resp = self.send(|client| {
            client.get(format!("{}{}", API_BASE, endpoint))
        }).await?;
        let status = resp.status();

        if !status.is_success() {
            let text = resp.text().await.map_err(|e| e.to_string())?;
            return Err(parse_api_error(&text));
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    }

    pub async fn public_post(&self, endpoint: &str) -> Result<Value, String> {
        let endpoint = endpoint.to_string();
        let resp = self.send(|client| {
            client.post(format!("{}{}", API_BASE, endpoint))
        }).await?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_post(&self, endpoint: &str, access_token: &str, body: Value) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let endpoint = endpoint.to_string();
        let access_token = access_token.to_string();

        let resp = self.send(|client| {
            let mut req = client
                .post(format!("{}{}", API_BASE, endpoint))
                .header("Authorization", format!("Bearer {}", access_token))
                .json(&body);

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_put(&self, endpoint: &str, access_token: &str, body: Value) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let endpoint = endpoint.to_string();
        let access_token = access_token.to_string();

        let resp = self.send(|client| {
            let mut req = client
                .put(format!("{}{}", API_BASE, endpoint))
                .header("Authorization", format!("Bearer {}", access_token))
                .json(&body);

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text).map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_delete(&self, endpoint: &str, access_token: &str) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let endpoint = endpoint.to_string();
        let access_token = access_token.to_string();

        let resp = self.send(|client| {
            let mut req = client
                .delete(format!("{}{}", API_BASE, endpoint))
                .header("Authorization", format!("Bearer {}", access_token));

            if !ca.is_empty() {
                req = req.header("X-CA", &ca);
            }

            req
        }).await?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text).map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn refresh_tokens(&self, refresh_token: &str) -> Result<Value, String> {
        let refresh_token = refresh_token.to_string();
        let resp = self.send(|client| {
            client
                .post(format!("{}/user/auth/refresh", API_BASE))
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({ "refreshToken": refresh_token }))
        }).await?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        Ok(val)
    }
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for c in input.chars() {
        if c == '=' { break; }
        let val = chars.find(c).ok_or_else(|| format!("Invalid base64 char: {}", c))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}
