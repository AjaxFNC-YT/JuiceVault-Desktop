use reqwest::Client;
use serde_json::Value;
use crate::models::user::{ApiResponse, AuthData, TokenData};

const API_BASE: &str = "https://api.juicevault.xyz";

pub struct ApiClient {
    client: Client,
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

impl ApiClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn get_login_token(&self) -> Result<(String, String), String> {
        let resp = self
            .client
            .post(format!("{}/user/auth/token", API_BASE))
            .header("Content-Type", "application/json")
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

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

        let mut req = self
            .client
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

        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
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

        let mut req = self
            .client
            .post(format!("{}/user/auth/register", API_BASE))
            .header("Content-Type", "application/json")
            .json(&body);

        if !ca.is_empty() {
            req = req.header("X-CA", &ca);
        }

        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
        let text = resp.text().await.map_err(|e| e.to_string())?;

        let parsed: ApiResponse<AuthData> = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;

        parsed.data.ok_or_else(|| {
            parsed.error.unwrap_or_else(|| "Registration failed".into())
        })
    }

    pub async fn authed_get(&self, endpoint: &str, access_token: &str) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();

        let mut req = self
            .client
            .get(format!("{}{}", API_BASE, endpoint))
            .header("Authorization", format!("Bearer {}", access_token));

        if !ca.is_empty() {
            req = req.header("X-CA", &ca);
        }

        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
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
        let resp = self
            .client
            .get(format!("{}{}", API_BASE, endpoint))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn public_post(&self, endpoint: &str) -> Result<Value, String> {
        let resp = self
            .client
            .post(format!("{}{}", API_BASE, endpoint))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_post(&self, endpoint: &str, access_token: &str, body: Value) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();

        let mut req = self
            .client
            .post(format!("{}{}", API_BASE, endpoint))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&body);

        if !ca.is_empty() {
            req = req.header("X-CA", &ca);
        }

        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text)
            .map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_put(&self, endpoint: &str, access_token: &str, body: Value) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let mut req = self.client
            .put(format!("{}{}", API_BASE, endpoint))
            .header("Authorization", format!("Bearer {}", access_token))
            .json(&body);
        if !ca.is_empty() { req = req.header("X-CA", &ca); }
        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text).map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn authed_delete(&self, endpoint: &str, access_token: &str) -> Result<Value, String> {
        let ca = extract_ca(access_token).unwrap_or_default();
        let mut req = self.client
            .delete(format!("{}{}", API_BASE, endpoint))
            .header("Authorization", format!("Bearer {}", access_token));
        if !ca.is_empty() { req = req.header("X-CA", &ca); }
        let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() { return Err(parse_api_error(&text)); }
        let val: Value = serde_json::from_str(&text).map_err(|_| parse_api_error(&text))?;
        Ok(val)
    }

    pub async fn refresh_tokens(&self, refresh_token: &str) -> Result<Value, String> {
        let resp = self
            .client
            .post(format!("{}/user/auth/refresh", API_BASE))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "refreshToken": refresh_token }))
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

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
