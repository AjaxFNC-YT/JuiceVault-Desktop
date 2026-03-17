# JuiceVault API Documentation

Complete API reference for the Juice WRLD Archive. Covers all **user-facing** endpoints for building iOS/Android clients.

**Base URL:** `https://api.juicevault.xyz`

---

## Table of Contents

- [Authentication](#authentication)
  - [Get Login Token](#get-login-token)
  - [Register](#register)
  - [Login](#login)
  - [Refresh Token](#refresh-token)
  - [Logout](#logout)
  - [Get Current User](#get-current-user)
  - [Verify Email (API)](#verify-email-api)
  - [Resend Verification](#resend-verification)
  - [Forgot Password](#forgot-password)
  - [Reset Password](#reset-password)
- [Profile](#profile)
  - [Get Public Profile](#get-public-profile)
  - [Update Profile](#update-profile)
  - [Change Email](#change-email)
  - [Change Password](#change-password)
  - [Upload Avatar](#upload-avatar)
  - [Remove Avatar](#remove-avatar)
- [Songs](#songs)
  - [List All Songs](#list-all-songs)
  - [Get Song Metadata](#get-song-metadata)
  - [Search Songs](#search-songs)
  - [Stream Song](#stream-song)
  - [Download Song](#download-song)
  - [Check Download Limit](#check-download-limit)
  - [Prepare Zip Download](#prepare-zip-download)
  - [Download Zip](#download-zip)
  - [Get Overall Stats](#get-overall-stats)
- [Song Tracker](#song-tracker)
  - [Get Tracker Info for Song](#get-tracker-info-for-song)
  - [Get Tracker Stats](#get-tracker-stats)
- [Likes (Favorites)](#likes-favorites)
  - [Get Liked Songs](#get-liked-songs)
  - [Like a Song](#like-a-song)
  - [Unlike a Song](#unlike-a-song)
  - [Check if Song is Liked](#check-if-song-is-liked)
  - [Batch Check Likes](#batch-check-likes)
  - [Get Public Liked Songs](#get-public-liked-songs)
- [Playlists](#playlists)
  - [Get My Playlists](#get-my-playlists)
  - [Get Playlist by ID](#get-playlist-by-id)
  - [Get User's Public Playlists](#get-users-public-playlists)
  - [Get Shared Playlist](#get-shared-playlist)
  - [Create Playlist](#create-playlist)
  - [Clone Playlist](#clone-playlist)
  - [Update Playlist](#update-playlist)
  - [Delete Playlist](#delete-playlist)
  - [Add Songs to Playlist](#add-songs-to-playlist)
  - [Remove Song from Playlist](#remove-song-from-playlist)
  - [Upload Playlist Cover](#upload-playlist-cover)
  - [Remove Playlist Cover](#remove-playlist-cover)
  - [Generate Share Link](#generate-share-link)
  - [Remove Share Link](#remove-share-link)
  - [Record Playlist Play](#record-playlist-play)
- [Playlist Collaborators](#playlist-collaborators)
  - [Invite Collaborator](#invite-collaborator)
  - [Accept Invite](#accept-invite)
  - [Decline Invite](#decline-invite)
  - [Cancel Invite](#cancel-invite)
  - [Get Pending Invites](#get-pending-invites)
  - [Get Collaborators](#get-collaborators)
  - [Remove Collaborator / Leave](#remove-collaborator--leave)
- [Listening History](#listening-history)
  - [Get History](#get-history)
  - [Log a Listen](#log-a-listen)
  - [Clear History](#clear-history)
  - [Get Listening Stats](#get-listening-stats)
  - [Get Listening Activity](#get-listening-activity)
  - [Get Public Listening Stats](#get-public-listening-stats)
- [Notifications](#notifications)
  - [List Notifications](#list-notifications)
  - [Get Unread Count](#get-unread-count)
  - [Mark as Read](#mark-as-read)
  - [Mark All as Read](#mark-all-as-read)
  - [Dismiss Notification](#dismiss-notification)
  - [Get Popup Notification](#get-popup-notification)
  - [Dismiss Popup](#dismiss-popup)
- [Radio](#radio)
  - [Stream](#stream)
  - [Now Playing](#now-playing)
  - [Schedule](#schedule)
  - [Listener Count](#listener-count)
  - [Vote to Skip](#vote-to-skip)
- [Media](#media)
  - [List All Media](#list-all-media)
  - [Get Media Metadata](#get-media-metadata)
  - [Stream Media](#stream-media)
  - [Download Media](#download-media)
  - [Record Media View](#record-media-view)
- [CDN / Assets](#cdn--assets)
  - [Song Cover Art](#song-cover-art)
  - [Media Thumbnail](#media-thumbnail)
  - [Playlist Cover](#playlist-cover)
  - [User Avatar](#user-avatar)
  - [App Downloads](#app-downloads)
- [Desktop App Updates](#desktop-app-updates)
  - [Get Desktop Versions](#get-desktop-versions)
  - [Check for Desktop Update](#check-for-desktop-update)
- [Mobile App Updates](#mobile-app-updates)
  - [Get Mobile Versions](#get-mobile-versions)
  - [Check for Mobile Update](#check-for-mobile-update)
- [News](#news)
  - [Get Active News](#get-active-news)
- [Health](#health)
- [Local Files](#local-files)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)

---

## Authentication

Most endpoints are **public** and require no auth. Protected endpoints require a **JWT Bearer token** in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

**Token details:**
- **Access token expiry:** 7 days
- **Refresh token expiry:** 30 days
- **Algorithm:** HS256
- Tokens are obtained from `/user/auth/register` or `/user/auth/login`

Some protected endpoints also require the user's **email to be verified** (noted as `Verified ✓` below).

### Login Token (Required for Login & Register)

Both **login** and **register** require a **login token** in the request body. This token must be obtained first from `POST /user/auth/token`.

**Why?** The login token is a short-lived JWT that contains an encrypted `ca` (captcha-authorization) field. On platforms that can render web CAPTCHAs (PC/web), the token is simply passed alongside the CAPTCHA tokens. On platforms that **cannot** render CAPTCHAs (mobile apps), the `ca` inside the JWT is extracted and used to bypass CAPTCHA entirely.

### CAPTCHA

Some endpoints require CAPTCHA tokens to prevent abuse:

- **Login** requires a **Cloudflare Turnstile** token (`turnstileToken` in request body)
- **Register** requires an **hCaptcha** token (`hcaptchaToken` in request body), and optionally accepts a Turnstile token too

If the token is missing or invalid, the API returns `400` or `403`.

### CAPTCHA Bypass (X-CA) — for Mobile Apps

Mobile apps cannot render web CAPTCHAs. Instead, they use the `ca` field from the login token JWT to bypass CAPTCHA.

**Mobile login/register flow:**

1. Call `POST /user/auth/token` — returns a JWT login token
2. Decode the JWT payload (base64, no signature verification needed — just read it):
   ```js
   const payload = JSON.parse(atob(token.split('.')[1]))
   // payload.ca = "c024c0ae31b3a489c4126a65:8f9d41c4..."
   ```
3. Extract the `ca` field from the decoded payload
4. Send it as the `X-CA` header on the login/register request:
   ```
   POST /user/auth/login
   X-CA: c024c0ae31b3a489c4126a65:8f9d41c4...
   Content-Type: application/json

   { "login": "user", "password": "pass", "loginToken": "<the full JWT>" }
   ```
5. The `X-CA` header bypasses **both Turnstile and hCaptcha** — no CAPTCHA tokens needed in the request body

**PC/web flow (for reference):**

1. Call `POST /user/auth/token` — returns a JWT login token
2. Pass the full JWT as `loginToken` in the request body + solve CAPTCHA normally:
   ```
   POST /user/auth/login
   Content-Type: application/json

   { "login": "user", "password": "pass", "turnstileToken": "...", "loginToken": "<the full JWT>" }
   ```

### CAPTCHA Bypass After Login (X-CA from Access Token)

After a successful login or register, the returned **access token JWT** also contains a `ca` field. This works the same way — decode the access token JWT, extract `ca`, and pass it as `X-CA` on future requests.

**Details:**
- The `ca` token is AES-256-GCM encrypted with password `JV:Secure`
- The `ca` from a login token expires in 5 minutes (same as the login token)
- The `ca` from an access token expires at the same time as the access token
- When the access token is refreshed via `/user/auth/refresh`, the new access token contains a fresh `ca`
- If `X-CA` is missing or invalid/expired, normal CAPTCHA validation applies as a fallback

---

### Get Login Token

```
POST /user/auth/token
```

🔓 **Public** — no auth required

Returns a short-lived pre-auth login token (JWT, 5 minutes). **Required** in the body of login and register requests.

The JWT payload contains a `ca` field (AES-256-GCM encrypted CA token). Mobile clients decode the JWT and extract this `ca` to use as `X-CA` header for CAPTCHA bypass.

**Request:** No body required.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 300
  }
}
```

**Decoded JWT payload:**
```json
{
  "ca": "c024c0ae31b3a489c4126a65:8f9d41c495873edd2b4318cb2b116a3a:51cb9ace...",
  "type": "login",
  "iat": 1773009506,
  "exp": 1773009806
}
```

**Errors:**

| Status | Error |
|---|---|
| `429` | Rate limited (20 req / 1 min) |

---

### Register

```
POST /user/auth/register
```

Creates a new account. Sends a welcome email and verification email.

**Headers:**
- `Content-Type: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `loginToken` | string | ✅ | Login token from `POST /user/auth/token` |
| `username` | string | ✅ | 2-32 chars, alphanumeric + `_` `.` `-` |
| `email` | string | ✅ | Must be a valid, non-disposable email |
| `password` | string | ✅ | Account password |
| `displayName` | string | ❌ | Display name (defaults to username) |
| `hcaptchaToken` | string | ✅* | hCaptcha verification token (*bypassed if valid `X-CA` header) |
| `turnstileToken` | string | ❌* | Cloudflare Turnstile token (*bypassed if valid `X-CA` header) |

**Success Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { /* private profile object */ }
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing required fields / invalid username format / missing login token or CAPTCHA |
| `403` | CAPTCHA verification failed / invalid or expired login token |
| `409` | Username or email already taken |
| `429` | Rate limited (10 req / 15 min) |
| `500` | Registration failed |

---

### Login

```
POST /user/auth/login
```

Authenticate with username/email and password.

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `loginToken` | string | ✅ | Login token from `POST /user/auth/token` |
| `login` | string | ✅ | Username or email |
| `password` | string | ✅ | Account password |
| `turnstileToken` | string | ✅* | Cloudflare Turnstile token (*bypassed if valid `X-CA` header) |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { /* private profile object */ }
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing login, password, login token, or Turnstile token |
| `403` | CAPTCHA verification failed / invalid or expired login token |
| `401` | Invalid credentials |
| `403` | Account disabled or banned |
| `423` | Account locked (too many failed attempts) |
| `429` | Rate limited (10 req / 15 min) |

---

### Refresh Token

```
POST /user/auth/refresh
```

Exchange a valid refresh token for a new access + refresh token pair (rotation).

**Body:**

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | ✅ |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing refresh token |
| `401` | Invalid / expired / revoked refresh token |
| `429` | Rate limited (30 req / 1 min) |

---

### Logout

```
POST /user/auth/logout
```

🔒 **Auth required**

Invalidates the provided refresh token.

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `refreshToken` | string | ❌ | Token to revoke (recommended) |

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Logged out" }
```

---

### Get Current User

```
GET /user/auth/me
```

🔒 **Auth required**

Returns the authenticated user's private profile.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "...",
    "username": "johndoe",
    "displayName": "John",
    "email": "john@example.com",
    "avatar": "/cdn/avatars/...",
    "bio": "...",
    "isVerified": true,
    "preferences": {
      "theme": "default",
      "quality": "high",
      "privateProfile": false,
      "showListeningHistory": true,
      "repeat": "none",
      "shuffle": false,
      "sortBy": "popular",
      "crossfadeDuration": 0,
      "skipSilence": false,
      "eqBass": 0,
      "eqMid": 0,
      "eqTreble": 0,
      "eqReverb": 0,
      "eqGain": 0,
      "discordRpc": true,
      "mergeSessionEdits": false,
      "localFilesEnabled": false,
      "localFilesSources": []
    },
    "stats": {
      "likedCount": 42,
      "playlistCount": 5,
      "totalListens": 1337,
      "totalListenTime": 98000
    },
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `401` | Not authenticated |
| `404` | User not found |

---

### Verify Email (API)

```
POST /user/auth/verify-email
```

Verify email address via token (programmatic alternative to the email link).

**Body:**

| Field | Type | Required |
|---|---|---|
| `token` | string | ✅ |

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Email verified" }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing or invalid/expired token |

---

### Resend Verification

```
POST /user/auth/resend-verification
```

🔒 **Auth required**

Resend the email verification link. Has a **2-minute per-user cooldown**.

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Verification email sent" }
```

**Errors:**

| Status | Error |
|---|---|
| `429` | Cooldown active / rate limited (5 req / 30 min) |

---

### Forgot Password

```
POST /user/auth/forgot-password
```

Request a password reset email. Always returns success to prevent email enumeration.

**Body:**

| Field | Type | Required |
|---|---|---|
| `email` | string | ✅ |

**Success Response:** `200 OK`
```json
{ "success": true, "message": "If that email exists, a reset link has been sent" }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing email |
| `429` | Rate limited (5 req / 30 min) |

---

### Reset Password

```
POST /user/auth/reset-password
```

Reset password using the token from the reset email. Invalidates all existing sessions.

**Body:**

| Field | Type | Required |
|---|---|---|
| `token` | string | ✅ |
| `password` | string | ✅ |

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Password reset successfully" }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing fields / invalid or expired token |

---

## Profile

### Get Public Profile

```
GET /user/profile/:username
```

🔓 **Public** (optional auth for seeing own private profile)

**URL Params:**
- `username` — case-insensitive

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "...",
    "username": "johndoe",
    "displayName": "John",
    "avatar": "/cdn/avatars/...",
    "bio": "Juice WRLD fan",
    "isVerified": true,
    "stats": {
      "likedCount": 42,
      "playlistCount": 5,
      "totalListens": 1337,
      "totalListenTime": 98000
    },
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

If profile is **private** (and viewer is not the owner):
```json
{
  "success": true,
  "data": {
    "id": "...",
    "username": "johndoe",
    "displayName": "John",
    "avatar": "/cdn/avatars/...",
    "private": true
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `404` | User not found |

---

### Update Profile

```
PUT /user/profile
```

🔒 **Auth required**

**Body (all optional):**

| Field | Type | Description |
|---|---|---|
| `displayName` | string | Display name |
| `bio` | string | Profile bio |
| `preferences.theme` | string | UI theme ID (arbitrary string, max 50 chars). Default `"default"`. |
| `preferences.quality` | string | Audio quality preference |
| `preferences.privateProfile` | boolean | Hide profile from public |
| `preferences.showListeningHistory` | boolean | Show listening history publicly |
| `preferences.repeat` | string | Repeat mode: `"none"` or `"all"`. Note: `"one"` (repeat single) is never persisted — it is saved as `"none"`. |
| `preferences.shuffle` | boolean | Shuffle playback on/off |
| `preferences.sortBy` | string | Default sort for song lists: `"popular"`, `"az"`, `"za"`, `"newest"`, or `"random"` |
| `preferences.crossfadeDuration` | number | Crossfade duration in seconds (0–12). `0` = disabled. Fades out the current song and fades in the next song during transitions. |
| `preferences.skipSilence` | boolean | Automatically skip fully silent sections in songs (intros, outros, gaps). Only skips true digital silence. |
| `preferences.eqBass` | number | Equalizer bass (low-shelf 200Hz) gain in dB. Range: `-20` to `+20`. Default `0`. |
| `preferences.eqMid` | number | Equalizer mid (peaking 1kHz) gain in dB. Range: `-20` to `+20`. Default `0`. |
| `preferences.eqTreble` | number | Equalizer treble (high-shelf 4kHz) gain in dB. Range: `-20` to `+20`. Default `0`. |
| `preferences.eqReverb` | number | Reverb wet mix level. Range: `-20` to `+20`. `0` = dry, `+20` = max reverb. Default `0`. |
| `preferences.eqGain` | number | Master gain in dB. Range: `-20` to `+20`. Default `0`. |
| `preferences.discordRpc` | boolean | Whether Discord Rich Presence is enabled. Default `true`. |
| `preferences.mergeSessionEdits` | boolean | Show session edits inline instead of grouped. Default `false`. |
| `preferences.localFilesEnabled` | boolean | Whether the local files feature is enabled. Default `false`. |
| `preferences.localFilesSources` | string[] | Array of local directory paths used as music sources (max 20 items, each max 500 chars). Default `[]`. |

**Success Response:** `200 OK`
```json
{ "success": true, "data": { /* updated private profile */ } }
```

---

### Change Email

```
PUT /user/profile/email
```

🔒 **Auth required**

Changes the account email. Resets verification status.

**Body:**

| Field | Type | Required |
|---|---|---|
| `email` | string | ✅ |
| `password` | string | ✅ |

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing fields |
| `401` | Invalid password |
| `409` | Email already in use |

---

### Change Password

```
PUT /user/profile/password
```

🔒 **Auth required**

Changes password and invalidates all sessions (must log in again).

**Body:**

| Field | Type | Required |
|---|---|---|
| `currentPassword` | string | ✅ |
| `newPassword` | string | ✅ |

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing fields |
| `401` | Current password incorrect |

---

### Upload Avatar

```
POST /user/profile/avatar
```

🔒 **Auth required**

Upload a profile picture. Accepts `multipart/form-data`.

**Form field:** `avatar` — image file (JPEG, PNG, WebP, GIF; max 5 MB)

Image is resized to **256×256** and converted to WebP.

**Success Response:** `200 OK`
```json
{ "success": true, "data": { "avatar": "/cdn/avatars/userId-timestamp.webp" } }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | No image provided |
| `404` | User not found |

---

### Remove Avatar

```
DELETE /user/profile/avatar
```

🔒 **Auth required**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Avatar removed" }
```

---

## Songs

### List All Songs

```
GET /music/list
```

🔓 **Public**

Returns all songs in the archive with basic info. Results are cached for 10 minutes.

**Success Response:** `200 OK`
```json
{
  "total": 2150,
  "songs": [
    {
      "id": "abc123",
      "file_name": "Juice WRLD - Lucid Dreams.mp3",
      "title": "Lucid Dreams",
      "artist": "Juice WRLD",
      "length": "3:59",
      "cover": "/cdn/music/covers/abc123?v=...",
      "play_count": 42069,
      "file_size": "8.7 MB",
      "file_size_bytes": 9123456,
      "alt_names": ["Lucid Dreams OG", "All Girls Are The Same Demo"]
    }
  ]
}
```

**Song list object fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique song ID |
| `file_name` | string | Original file name |
| `title` | string | Song title |
| `artist` | string | Artist name |
| `length` | string | Duration as `"M:SS"` |
| `cover` | string | Cover art URL (relative to base) |
| `play_count` | number | Total play count |
| `file_size` | string | Human-readable size e.g. `"8.7 MB"` |
| `file_size_bytes` | number | Size in bytes |
| `alt_names` | string[] | Alternative/known names from tracker |

---

### Get Song Metadata

```
GET /music/:id/metadata
```

🔓 **Public**

Detailed metadata for a single song. Cached for 3 hours.

**Success Response:** `200 OK`
```json
{
  "id": "abc123",
  "file_name": "Juice WRLD - Lucid Dreams.mp3",
  "title": "Lucid Dreams",
  "artist": "Juice WRLD",
  "album": "Goodbye & Good Riddance",
  "year": 2018,
  "duration": 239,
  "length": "3:59",
  "bitrate": 320,
  "file_size": "8.7 MB",
  "file_size_bytes": 9123456,
  "cover": "/cdn/music/covers/abc123?v=...",
  "play_count": 42069
}
```

**Additional fields vs list:**

| Field | Type | Description |
|---|---|---|
| `album` | string | Album name |
| `year` | number\|null | Release year |
| `duration` | number | Duration in seconds |
| `bitrate` | number | Bitrate in kbps |

**Errors:**

| Status | Error |
|---|---|
| `404` | Song not found |

---

### Search Songs

```
GET /music/search?q=<query>
```

🔓 **Public**

Full-text search across title, artist, album, file name. Cached for 45 minutes.

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | ✅ | Search query |

**Success Response:** `200 OK`
```json
{
  "query": "lucid",
  "count": 3,
  "results": [
    {
      "id": "abc123",
      "file_name": "...",
      "title": "Lucid Dreams",
      "artist": "Juice WRLD",
      "album": "...",
      "length": "3:59",
      "cover": "/cdn/music/covers/abc123?v=...",
      "play_count": 42069,
      "relevance": 15.5,
      "file_size": "8.7 MB",
      "file_size_bytes": 9123456
    }
  ]
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing `q` param |

---

### Stream Song

```
GET /music/stream/:id
```

🔓 **Public**

Streams the audio file. Supports HTTP **Range requests** for seeking.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `src` | string | `"direct"` | Play source: `direct`, `spicetify`, `website`, `app` |

**Response:** Binary audio stream (`audio/mpeg`)

**Headers returned:**
- `Content-Type: audio/mpeg`
- `Content-Length` / `Content-Range` (for range requests)
- `Accept-Ranges: bytes`

Play count is incremented once per IP per song per cooldown window.

**Errors:**

| Status | Error |
|---|---|
| `400` | Invalid `src` value |
| `404` | Song not found |

---

### Download Song

```
GET /music/download/:id
```

🔓 **Public** (rate limited)

Downloads the audio file as an attachment. Each download counts as **1 download action** toward your rate limit.

**Response:** Binary file with `Content-Disposition: attachment`

**Rate limit headers** (always included):

| Header | Description |
|---|---|
| `X-Download-Limit` | Max downloads per window |
| `X-Download-Remaining` | Downloads remaining |
| `X-Download-Used` | Downloads used this window |
| `X-Download-Reset` | ISO 8601 timestamp when the window resets |
| `X-Download-Tier` | `verified`, `unverified`, or `anonymous` |

**Rate limit error:** `429 Too Many Requests`
```json
{
  "error": "Download limit reached",
  "message": "You've reached your download limit. Limit: 500 downloads per 2 hours (Verified).",
  "resetsIn": "1h 45m",
  "resetsAt": "2026-03-11T22:30:00.000Z",
  "tip": null,
  "usage": {
    "used": 500,
    "remaining": 0,
    "max": 500,
    "windowSeconds": 7200,
    "resetsAt": "2026-03-11T22:30:00.000Z",
    "tier": "verified"
  }
}
```

> For unverified/anonymous users, `tip` will contain: `"Verify your email to get 500 downloads every 2 hours."`

**Errors:**

| Status | Error |
|---|---|
| `404` | Song not found |
| `429` | Download limit reached (see above) |

---

### Check Download Limit

```
GET /music/download-limit
```

🔓 **Public** (optional auth)

Check your current download rate limit status without triggering a download.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "used": 0,
  "remaining": 500,
  "max": 500,
  "windowSeconds": 7200,
  "resetsAt": null,
  "tier": "verified"
}
```

---

### Prepare Zip Download

```
POST /music/download-zip/prepare
```

🔓 **Public**

Validates songs and returns info about the download before starting it.

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `songIds` | string[] | ✅ | Array of song IDs (max 100) |
| `name` | string | ❌ | Zip file name |

**Success Response:** `200 OK`
```json
{
  "songCount": 15,
  "totalSize": 125000000,
  "queueLength": 0,
  "activeDownloads": 1,
  "maxConcurrent": 2
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing/empty `songIds` or exceeds 100 |
| `404` | No valid songs found |

---

### Download Zip

```
POST /music/download-zip
```

🔓 **Public** (rate limited)

Downloads multiple songs as a zip archive. Queued — max 2 concurrent zips. Each song in the zip counts toward your rate limit. Same rate limit headers and 429 response as [Download Song](#download-song).

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `songIds` | string[] | ✅ | Array of song IDs (max 350 logged in, 100 anonymous) |
| `name` | string | ❌ | Zip file name (default: `"playlist"`) |

**Response:** Binary zip stream

**Headers returned:**
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="name.zip"`
- `X-Total-Raw-Size: <bytes>`
- `X-Song-Count: <n>`
- Rate limit headers (`X-Download-Limit`, `X-Download-Remaining`, etc.)

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing/empty `songIds` or exceeds limit |
| `404` | No valid songs found |
| `429` | Download limit reached |

---

### Get Overall Stats

```
GET /stats
```

🔓 **Public**

Archive-wide statistics. Cached for 5 minutes.

**Success Response:** `200 OK`
```json
{
  "total_songs": 2150,
  "total_duration": "5d 12h 30m",
  "total_duration_seconds": 475800,
  "total_size": "45.2 GB",
  "total_size_bytes": 48530000000,
  "top_songs": [
    {
      "rank": 1,
      "id": "abc123",
      "title": "Lucid Dreams",
      "artist": "Juice WRLD",
      "length": "3:59",
      "cover": "/cdn/music/covers/abc123",
      "play_count": 42069
    }
  ],
  "play_sources": {
    "website": 50000,
    "spicetify": 30000,
    "app": 10000,
    "direct": 5000
  },
  "spicetify": { ... }
}
```

---

## Song Tracker

### Get Tracker Info for Song

```
GET /music/tracker/info/:id
```

🔓 **Public**

Returns community tracker data (leak dates, producers, known names, etc.) for a specific song.

**Errors:**

| Status | Error |
|---|---|
| `404` | No tracker info found for this song |

---

### Get Tracker Stats

```
GET /music/tracker/stats
```

🔓 **Public**

Returns cache stats about the tracker data.

**Success Response:** `200 OK`
```json
{
  "status": "loaded",
  "totalEntries": 3500,
  "matchedSongs": 2100,
  "lastUpdated": "2026-03-07T10:00:00.000Z"
}
```

---

## Likes (Favorites)

### Get Liked Songs

```
GET /user/likes
```

🔒 **Auth required**

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `50` | Max 200 |
| `offset` | number | `0` | Pagination offset |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "songId": "abc123",
      "likedAt": "2026-01-15T12:00:00.000Z",
      "song": {
        "id": "abc123",
        "title": "Lucid Dreams",
        "artist": "Juice WRLD",
        "cover": "/cdn/music/covers/abc123?v=...",
        "length": "3:59",
        "play_count": 42069,
        "file_size": "8.7 MB",
        "file_size_bytes": 9123456
      }
    }
  ],
  "total": 42
}
```

---

### Like a Song

```
POST /user/likes/:songId
```

🔒 **Auth required** · **Verified ✓**

**For server songs:** just pass the song ID as `:songId`.

**For local files:** pass `local:<fileHash>` as `:songId` and include metadata in the body. Metadata can be nested under `localMeta` or sent flat at the top level:

Nested:
```json
{
  "localMeta": {
    "title": "My Local Song",
    "artist": "Some Artist",
    "album": "Some Album",
    "duration": 210,
    "fileHash": "a1b2c3d4e5f6...",
    "fileName": "my_song.mp3"
  }
}
```

Flat:
```json
{
  "title": "My Local Song",
  "artist": "Some Artist",
  "album": "Some Album",
  "duration": 210,
  "fileHash": "a1b2c3d4e5f6...",
  "fileName": "my_song.mp3"
}
```

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Song liked", "liked": true }
```

If already liked:
```json
{ "success": true, "message": "Already liked", "liked": true }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | `title` and `fileHash` required for local files |
| `404` | Song not found (server songs only) |

---

### Unlike a Song

```
DELETE /user/likes/:songId
```

🔒 **Auth required** · **Verified ✓**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Song unliked", "liked": false }
```

---

### Check if Song is Liked

```
GET /user/likes/check/:songId
```

🔒 **Auth required**

**Success Response:** `200 OK`
```json
{ "success": true, "liked": true }
```

---

### Batch Check Likes

```
POST /user/likes/check
```

🔒 **Auth required**

Check multiple songs at once. Ideal for rendering grids with like status.

**Body:**

| Field | Type | Required |
|---|---|---|
| `songIds` | string[] | ✅ |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "abc123": true,
    "def456": false,
    "ghi789": true
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing or invalid `songIds` array |

---

### Get Public Liked Songs

```
GET /user/likes/public/:username
```

🔓 **Public**

Returns up to 200 liked songs for a user.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [ /* same shape as Get Liked Songs */ ],
  "owner": {
    "_id": "...",
    "username": "johndoe",
    "displayName": "John",
    "avatar": "/cdn/avatars/..."
  },
  "total": 42
}
```

**Errors:**

| Status | Error |
|---|---|
| `404` | User not found |

---

## Playlists

### Get My Playlists

```
GET /user/playlists
```

🔒 **Auth required**

Returns owned playlists + playlists where user is a collaborator.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "name": "My Playlist",
      "description": "Best leaks",
      "isPublic": true,
      "isPinned": false,
      "coverImage": "/cdn/playlist-covers/...",
      "songs": [ { "songId": "abc123", "addedBy": "..." } ],
      "totalDuration": 3600,
      "shareId": "xYz123",
      "collaborators": [],
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "collaborated": [
    {
      "_id": "...",
      "name": "Shared Vibes",
      "_isCollaborator": true
    }
  ]
}
```

---

### Get Playlist by ID

```
GET /user/playlists/:id
```

🔓 **Public** (optional auth) — public playlists visible to all, private only to owner/collaborators.

Returns fully populated playlist with song data, collaborator info, and owner info.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "My Playlist",
    "description": "...",
    "isPublic": true,
    "coverImage": "/cdn/playlist-covers/...",
    "songs": [
      {
        "songId": "abc123",
        "addedBy": "...",
        "song": {
          "id": "abc123",
          "title": "Lucid Dreams",
          "artist": "Juice WRLD",
          "cover": "/cdn/music/covers/abc123?v=...",
          "length": "3:59",
          "play_count": 42069,
          "file_size": "8.7 MB",
          "file_size_bytes": 9123456
        }
      }
    ],
    "collaborators": [
      {
        "userId": "...",
        "role": "editor",
        "user": { "username": "...", "displayName": "...", "avatar": "..." }
      }
    ],
    "owner": { "username": "...", "displayName": "...", "avatar": "..." },
    "totalDuration": 3600
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `403` | Playlist is private |
| `404` | Playlist not found |

---

### Get User's Public Playlists

```
GET /user/playlists/user/:username
```

🔓 **Public** (optional auth — owner sees private playlists too)

**Errors:**

| Status | Error |
|---|---|
| `404` | User not found |

---

### Get Shared Playlist

```
GET /user/playlists/shared/:shareId
```

🔓 **Public**

Access a playlist by its share ID (short URL-friendly ID).

**Errors:**

| Status | Error |
|---|---|
| `404` | Playlist not found |

---

### Create Playlist

```
POST /user/playlists
```

🔒 **Auth required** · **Verified ✓**

**Body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | ✅ | — | Playlist name |
| `description` | string | ❌ | `""` | Description |
| `isPublic` | boolean | ❌ | `true` | Visibility |

Max **100 playlists** per user.

**Success Response:** `201 Created`
```json
{ "success": true, "data": { /* playlist object */ } }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing name / max playlists reached |

---

### Clone Playlist

```
POST /user/playlists/clone
```

🔒 **Auth required** · **Verified ✓**

Clone a set of songs (from a shared playlist or liked songs) into a new playlist. Supports both server songs and local files.

**Body:**

| Field | Type | Required | Default |
|---|---|---|---|
| `songIds` | string[] | ❌* | — |
| `localFiles` | object[] | ❌* | — |
| `name` | string | ❌ | `"Saved Playlist"` |

\* At least one of `songIds` or `localFiles` is required. Both can be sent together.

`localFiles` uses the same format as [Add Songs to Playlist](#add-songs-to-playlist).

**Success Response:** `201 Created`

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing songIds/localFiles / max playlists reached |

---

### Update Playlist

```
PUT /user/playlists/:id
```

🔒 **Auth required (owner only)** · **Verified ✓**

**Body (all optional):**

| Field | Type |
|---|---|
| `name` | string |
| `description` | string |
| `isPublic` | boolean |
| `isPinned` | boolean |

**Errors:**

| Status | Error |
|---|---|
| `404` | Playlist not found (or not owner) |

---

### Delete Playlist

```
DELETE /user/playlists/:id
```

🔒 **Auth required (owner only)** · **Verified ✓**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Playlist deleted" }
```

---

### Add Songs to Playlist

```
POST /user/playlists/:id/songs
```

🔒 **Auth required (owner or collaborator)** · **Verified ✓**

**Body:**

| Field | Type | Description |
|---|---|---|
| `songId` | string | Single server song ID |
| `songIds` | string[] | Multiple server song IDs (takes priority) |
| `localFiles` | object[] | Local files to add (see [Local Files](#local-files)) |

Each object in `localFiles`:

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ | Song title |
| `fileHash` | string | ✅ | File hash (used as `local:<fileHash>` ID) |
| `artist` | string | ❌ | Artist name |
| `album` | string | ❌ | Album name |
| `duration` | number | ❌ | Duration in seconds |
| `fileName` | string | ❌ | Original filename |

Server songs and local files can be sent **together** in the same request. Max **1000 songs** per playlist. Duplicates are silently skipped.

**Success Response:** `200 OK` — returns updated playlist object.

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing song ID or local files / max songs reached |
| `403` | Not authorized |
| `404` | Playlist not found |

---

### Remove Song from Playlist

```
DELETE /user/playlists/:id/songs/:songId
```

🔒 **Auth required (owner or collaborator)** · **Verified ✓**

For local files, use `local:<fileHash>` as the `:songId`.

**Errors:**

| Status | Error |
|---|---|
| `403` | Not authorized |
| `404` | Playlist not found / song not in playlist |

---

### Upload Playlist Cover

```
POST /user/playlists/:id/cover
```

🔒 **Auth required (owner only)** · **Verified ✓**

Upload a custom cover image. Accepts `multipart/form-data`.

**Form field:** `cover` — image file (JPEG, PNG, WebP, GIF; max 5 MB)

Image is resized to **512×512** and converted to WebP.

**Success Response:** `200 OK`
```json
{ "success": true, "data": { "coverImage": "/cdn/playlist-covers/..." } }
```

---

### Remove Playlist Cover

```
DELETE /user/playlists/:id/cover
```

🔒 **Auth required (owner only)** · **Verified ✓**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Cover removed" }
```

---

### Generate Share Link

```
POST /user/playlists/:id/share
```

🔒 **Auth required (owner only)** · **Verified ✓**

Generates a short share ID if one doesn't exist.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "shareId": "xYz123",
    "shareUrl": "https://juicevault.xyz/playlists/s/xYz123"
  }
}
```

---

### Remove Share Link

```
DELETE /user/playlists/:id/share
```

🔒 **Auth required (owner only)** · **Verified ✓**

Revokes the share link.

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Share link removed" }
```

---

### Record Playlist Play

```
POST /user/playlists/:id/play
```

🔓 **Public** (no auth required)

Increments the playlist's play count. Rate-limited to **once per 30 seconds** per IP per playlist to prevent abuse.

**URL Params:**
- `id` — Playlist ID

**Success Response:** `200 OK`
```json
{ "success": true, "playCount": 43 }
```

**Throttled (too soon):**
```json
{ "success": true, "throttled": true }
```

**Errors:**

| Status | Error |
|---|---|
| `404` | Playlist not found |

---

## Playlist Collaborators

### Invite Collaborator

```
POST /user/playlists/:id/collaborators
```

🔒 **Auth required (owner only)** · **Verified ✓**

Invite a user by username or email. Sends an invitation email. Max **20 collaborators**.

**Body:**

| Field | Type | Required |
|---|---|---|
| `username` | string | ✅ (or `email`) |
| `email` | string | ✅ (or `username`) |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "invite": {
      "_id": "...",
      "invitedEmail": "friend@example.com",
      "invitedUser": { "_id": "...", "username": "...", "displayName": "...", "avatar": "..." },
      "status": "pending"
    }
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing fields / can't invite self / already collaborator / invite already pending / max collaborators |
| `404` | Playlist or user not found |

---

### Accept Invite

```
POST /user/playlists/invites/:token/accept
```

🔒 **Auth required** · **Verified ✓**

**Success Response:** `200 OK`
```json
{ "success": true, "data": { "playlistId": "...", "playlistName": "My Playlist" } }
```

**Errors:**

| Status | Error |
|---|---|
| `403` | Invitation is for a different user/email |
| `404` | Invitation not found or playlist deleted |
| `410` | Invitation expired |

---

### Decline Invite

```
POST /user/playlists/invites/:token/decline
```

🔒 **Auth required**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Invitation declined" }
```

---

### Cancel Invite

```
DELETE /user/playlists/invites/:inviteId
```

🔒 **Auth required (invite sender only)**

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Invitation cancelled" }
```

**Errors:**

| Status | Error |
|---|---|
| `403` | Not authorized (not the sender) |
| `404` | Invitation not found |

---

### Get Pending Invites

```
GET /user/playlists/invites/pending
```

🔒 **Auth required**

Returns pending invitations for the current user (matched by userId or email).

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "playlistId": "...",
      "invitedBy": "...",
      "status": "pending",
      "expiresAt": "...",
      "token": "...",
      "playlist": { "name": "...", "coverImage": "...", "songs": [...] },
      "inviter": { "username": "...", "displayName": "...", "avatar": "..." }
    }
  ]
}
```

---

### Get Collaborators

```
GET /user/playlists/:id/collaborators
```

🔒 **Auth required (owner or collaborator)**

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "owner": { "username": "...", "displayName": "...", "avatar": "..." },
    "collaborators": [
      {
        "userId": "...",
        "role": "editor",
        "user": { "username": "...", "displayName": "...", "avatar": "..." }
      }
    ],
    "pendingInvites": [ /* only visible to owner */ ]
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `403` | Not authorized |
| `404` | Playlist not found |

---

### Remove Collaborator / Leave

```
DELETE /user/playlists/:id/collaborators/:userId
```

🔒 **Auth required**

- **Owner** can remove any collaborator by their `userId`
- **Collaborator** can remove themselves (leave) by passing their own `userId`

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Left playlist" }
// or
{ "success": true, "message": "Collaborator removed" }
```

**Errors:**

| Status | Error |
|---|---|
| `403` | Not owner and not removing self |
| `404` | Playlist not found |

---

## Listening History

### Get History

```
GET /user/history
```

🔒 **Auth required**

**Query params:**

| Param | Type | Default | Max |
|---|---|---|---|
| `limit` | number | `50` | `200` |
| `offset` | number | `0` | — |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "songId": "abc123",
      "duration": 180,
      "completed": true,
      "source": "website",
      "playlistId": null,
      "listenedAt": "2026-03-07T10:30:00.000Z",
      "song": { /* formatted song object */ }
    }
  ],
  "total": 500
}
```

---

### Log a Listen

```
POST /user/history
```

🔒 **Auth required** · **Verified ✓**

**Body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `songId` | string | ✅ | — | Song ID |
| `duration` | number | ❌ | `0` | Seconds listened |
| `completed` | boolean | ❌ | `false` | Whether full song was played |
| `source` | string | ❌ | `"library"` | Play source |
| `playlistId` | string | ❌ | `null` | If played from a playlist |

Also increments the song's global play count.

**Success Response:** `200 OK`
```json
{ "success": true, "message": "Listen logged" }
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing songId |
| `404` | Song not found |

---

### Clear History

```
DELETE /user/history
```

🔒 **Auth required**

Deletes all listening history for the current user.

**Success Response:** `200 OK`
```json
{ "success": true, "message": "History cleared" }
```

---

### Get Listening Stats

```
GET /user/history/stats
```

🔒 **Auth required**

Aggregated listening statistics + top 50 songs.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalListens": 1337,
      "totalDuration": 98000,
      "uniqueSongs": 450,
      "completionRate": 72
    },
    "topSongs": [
      {
        "song": { /* formatted song object */ },
        "songId": "abc123",
        "count": 85,
        "totalDuration": 20400
      }
    ]
  }
}
```

---

### Get Listening Activity

```
GET /user/history/activity
```

🔒 **Auth required**

Daily activity heatmap data, hourly breakdown, and streak info.

**Query params:**

| Param | Type | Default | Max |
|---|---|---|---|
| `days` | number | `90` | `365` |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "daily": [
      { "date": "2026-03-01", "plays": 12, "duration": 2880 },
      { "date": "2026-03-02", "plays": 0, "duration": 0 }
    ],
    "hourly": [
      { "hour": 0, "count": 5 },
      { "hour": 1, "count": 2 }
    ],
    "currentStreak": 7,
    "longestStreak": 30,
    "activeDays": 65,
    "avgDailyPlays": 15
  }
}
```

---

### Get Public Listening Stats

```
GET /user/history/public/:username
```

🔓 **Public**

Same rich data as private stats + activity, but for a public profile. Respects privacy settings.

Returns top 20 songs, last 90 days of daily activity, hourly breakdown, and streaks.

If profile is private:
```json
{ "success": true, "data": { "private": true } }
```

**Errors:**

| Status | Error |
|---|---|
| `404` | User not found |

---

## Notifications

### List Notifications

```
GET /user/notifications
```

🔒 **Auth required**

**Query params:**

| Param | Type | Default | Max |
|---|---|---|---|
| `limit` | number | `20` | `100` |
| `offset` | number | `0` | — |
| `unreadOnly` | string | — | Set to `"true"` to filter |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "type": "playlist_invite",
      "title": "Playlist Invitation",
      "message": "You were invited to collaborate on...",
      "read": false,
      "dismissed": false,
      "showOnVisit": true,
      "popupDismissed": false,
      "actionUrl": "/playlists/invite/...",
      "createdAt": "2026-03-07T10:00:00.000Z"
    }
  ],
  "total": 15,
  "unreadCount": 3
}
```

---

### Get Unread Count

```
GET /user/notifications/unread-count
```

🔒 **Auth required**

Quick endpoint for badge counts.

**Success Response:** `200 OK`
```json
{ "success": true, "count": 3 }
```

---

### Mark as Read

```
PATCH /user/notifications/:id/read
```

🔒 **Auth required**

**Errors:**

| Status | Error |
|---|---|
| `404` | Notification not found |

---

### Mark All as Read

```
PATCH /user/notifications/read-all
```

🔒 **Auth required**

**Success Response:** `200 OK`
```json
{ "success": true, "updated": 5 }
```

---

### Dismiss Notification

```
DELETE /user/notifications/:id
```

🔒 **Auth required**

Soft-deletes (hides) a notification.

**Errors:**

| Status | Error |
|---|---|
| `404` | Notification not found |

---

### Get Popup Notification

```
GET /user/notifications/popup
```

🔒 **Auth required**

Returns the most recent unread `showOnVisit` notification that hasn't been popup-dismissed. Used for showing a one-time popup on page load.

**Success Response:** `200 OK`
```json
{ "success": true, "data": { /* notification or null */ } }
```

---

### Dismiss Popup

```
PATCH /user/notifications/:id/dismiss-popup
```

🔒 **Auth required**

Dismisses the popup and marks the notification as read, without hiding it from the notification list.

---

## Radio

Live internet radio — a continuous 128 kbps MP3 stream playing a shuffled mix of the top 250 most popular songs. Everyone hears the exact same audio in real-time. The playlist reshuffles on each full loop.

**How it works:** The server uses ffmpeg to transcode songs one-by-one into a continuous MP3 stream. All connected clients receive the same audio bytes simultaneously. Clients connect to `/radio/stream` for the audio and poll `/radio/now-playing` for metadata (song info, cover art, elapsed time).

### Stream

```
GET /radio/stream
```

🔓 **Public**

Live MP3 audio stream. This is a long-lived HTTP response that never ends — audio data is continuously pushed to the client. Connect with an `<audio>` element or any MP3-capable player.

**Response headers:**
```
Content-Type: audio/mpeg
ICY-Name: JuiceVault Radio
ICY-Genre: Hip-Hop/Rap
ICY-BR: 128
Transfer-Encoding: chunked
```

**Usage example:**
```html
<audio src="https://api.juicevault.xyz/radio/stream" autoplay></audio>
```

---

### Now Playing

```
GET /radio/now-playing
```

🔓 **Public**

Returns the currently playing song with elapsed/remaining time. Poll this endpoint to update the UI (recommended interval: 5–10 seconds).

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "current": {
      "id": "abc123",
      "title": "Lucid Dreams",
      "artist": "Juice WRLD",
      "duration": 240,
      "length": "4:00",
      "cover": "/cdn/music/covers/abc123?v=...",
      "play_count": 42069,
      "file_size": "8.7 MB",
      "file_size_bytes": 9123456,
      "index": 42,
      "elapsed": 127.35,
      "remaining": 112.65
    },
    "next": {
      "id": "def456",
      "title": "All Girls Are The Same",
      "artist": "Juice WRLD",
      "duration": 165,
      "length": "2:45",
      "cover": "/cdn/music/covers/def456?v=...",
      "play_count": 38000,
      "file_size": "6.2 MB",
      "file_size_bytes": 6500000,
      "index": 43
    },
    "playlist_length": 250,
    "server_time": 1709800000000,
    "listeners": 15
  }
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `current.elapsed` | number | Seconds into the current song |
| `current.remaining` | number | Seconds until the song ends |
| `current.index` | number | Position in the playlist (0-indexed) |
| `next` | object | The next song that will play |
| `playlist_length` | number | Total songs in the radio playlist (250) |
| `server_time` | number | Server Unix timestamp in ms |
| `listeners` | number | Number of currently connected stream listeners |

---

### Schedule

```
GET /radio/schedule
```

🔓 **Public**

Returns the currently playing song and upcoming songs.

**Query params:**

| Param | Type | Default | Max |
|---|---|---|---|
| `count` | number | `10` | `50` |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "now_playing": {
      "id": "abc123",
      "title": "Lucid Dreams",
      "elapsed": 127.35,
      "remaining": 112.65
    },
    "upcoming": [
      {
        "id": "def456",
        "title": "All Girls Are The Same",
        "artist": "Juice WRLD",
        "duration": 165,
        "length": "2:45",
        "cover": "/cdn/music/covers/def456?v=...",
        "starts_in": 112.65
      }
    ],
    "listeners": 15,
    "server_time": 1709800000000
  }
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `upcoming[].starts_in` | number | Seconds until this song starts playing |

---

### Listener Count

```
GET /radio/listeners
```

🔓 **Public**

Quick endpoint for getting the current listener count (connected stream clients).

**Success Response:** `200 OK`
```json
{ "success": true, "data": { "listeners": 15 } }
```

---

### Vote to Skip

```
POST /radio/skip
```

🔒 **Auth required**

Vote to skip the current song. Requires **50% of current listeners** to vote yes. Minimum 1 vote when there are few listeners.

**Success Response:** `200 OK`

**Not yet skipped:**
```json
{
  "success": true,
  "data": {
    "skipped": false,
    "votes": 3,
    "needed": 8,
    "listeners": 15
  }
}
```

**Skipped:**
```json
{
  "success": true,
  "data": {
    "skipped": true,
    "votes": 8,
    "needed": 8,
    "listeners": 15
  }
}
```

Votes reset when a new song starts or when a skip is triggered.

---

## Media

### List All Media

```
GET /media/list
```

🔓 **Public**

Returns all media files (videos, images, etc.). Cached for 10 minutes.

**Success Response:** `200 OK`
```json
{
  "total": 150,
  "media": [
    {
      "id": "xyz789",
      "file_name": "freestyle_2019.mp4",
      "title": "Freestyle 2019",
      "type": "video/mp4",
      "duration": "2:30",
      "file_size": "45.2 MB",
      "file_size_bytes": 47400000,
      "thumbnail": "/cdn/media/thumbnails/xyz789"
    }
  ]
}
```

---

### Get Media Metadata

```
GET /media/:id/metadata
```

🔓 **Public**

Detailed metadata for a single media item. Cached for 3 hours.

**Success Response:** `200 OK`
```json
{
  "id": "xyz789",
  "file_name": "freestyle_2019.mp4",
  "title": "Freestyle 2019",
  "type": "video/mp4",
  "duration": "2:30",
  "duration_seconds": 150,
  "width": 1920,
  "height": 1080,
  "file_size": "45.2 MB",
  "file_size_bytes": 47400000,
  "thumbnail": "/cdn/media/thumbnails/xyz789"
}
```

**Errors:**

| Status | Error |
|---|---|
| `404` | Media not found |

---

### Stream Media

```
GET /media/stream/:id
```

🔓 **Public**

Stream a media file with Range support. MIME type is auto-detected from file extension.

Supported types: MP4, WebM, MOV, AVI, MKV, M4V, MP3, WAV, OGG, M4A, JPG, PNG, GIF, WebP, SVG, BMP, ICO.

**Errors:**

| Status | Error |
|---|---|
| `404` | Media not found |

---

### Download Media

```
GET /media/download/:id
```

🔓 **Public**

Download a media file as attachment.

**Errors:**

| Status | Error |
|---|---|
| `404` | Media not found |

---

### Record Media View

```
POST /media/:id/view
```

🔓 **Public**

Increments the view count for a media item. Deduplicated to **once per 5 minutes** per IP per media item.

**URL Params:**
- `id` — Media ID

**Success Response:** `200 OK`
```json
{ "success": true }
```

**Deduplicated (already counted recently):**
```json
{ "success": true, "deduplicated": true }
```

---

## CDN / Assets

All CDN paths are **relative to the base URL**. Prepend `https://api.juicevault.xyz` for absolute URLs.

### Song Cover Art

```
GET /cdn/music/covers/:songId
```

Returns the cover art as `image/webp` (600×600). Falls back to a placeholder if no embedded cover exists.

Cache: `max-age=60, must-revalidate` with ETag support.

---

### Media Thumbnail

```
GET /cdn/media/thumbnails/:mediaId
```

Returns a thumbnail as `image/webp`. Auto-generated on first request (video frame extraction or image resize).

Cache: `max-age=31536000, immutable`

---

### Playlist Cover

```
GET /cdn/playlist-covers/:filename
```

Returns custom playlist cover image as `image/webp`.

Cache: `max-age=86400`

---

### User Avatar

```
GET /cdn/avatars/:filename
```

Returns user avatar as `image/webp`.

Cache: `max-age=86400`

---

### App Downloads

```
GET /cdn/downloads/:filename
```

🔓 **Public**

Download any file from the app downloads folder. Files are served dynamically — any file placed in the downloads directory is immediately available without an API restart.

**URL Params:**
- `filename` — exact filename (e.g. `JuiceVault.apk`, `JuiceVault.ipa`, `Ksign.ipa`)

**Response:** Binary file download with `Content-Disposition: attachment`

**Content types** are auto-detected by extension:

| Extension | Content-Type |
|---|---|
| `.apk` | `application/vnd.android.package-archive` |
| `.ipa` | `application/octet-stream` |
| `.zip` | `application/zip` |
| `.dmg` | `application/x-apple-diskimage` |
| `.exe` | `application/x-msdownload` |
| Other | `application/octet-stream` |

Cache: `max-age=3600`

**Errors:**

| Status | Error |
|---|---|
| `404` | File not found |

---

## Desktop App Updates

Endpoints for checking desktop app versions and updates. Desktop releases are managed through the admin dashboard and support multiple platforms (Windows, macOS, Linux) and release channels (stable, beta, dev).

All desktop releases include SHA-256 file hashes for integrity verification. Clients should hash the installed binary and compare against the API to detect tampering or check for updates.

### Get Desktop Versions

```
GET /misc/desktop/versions
```

🔓 **Public**

Returns current and historical version info for all desktop platforms.

**Query Params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `channel` | string | ❌ | `stable` | Release channel: `stable`, `beta`, or `dev` |

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "windows": {
      "current": {
        "version": "1.2.0",
        "hash": "a1b2c3d4e5f6...",
        "size": 85246371,
        "filename": "JuiceVault-Setup-1.2.0.exe",
        "notes": "Bug fixes and performance improvements",
        "releasedAt": "2026-03-15T12:00:00.000Z",
        "downloadUrl": "/cdn/downloads/JuiceVault-Setup-1.2.0.exe"
      },
      "history": [
        {
          "version": "1.2.0",
          "hash": "a1b2c3d4e5f6...",
          "size": 85246371,
          "filename": "JuiceVault-Setup-1.2.0.exe",
          "current": true,
          "releasedAt": "2026-03-15T12:00:00.000Z",
          "downloadUrl": "/cdn/downloads/JuiceVault-Setup-1.2.0.exe"
        },
        {
          "version": "1.1.0",
          "hash": "f6e5d4c3b2a1...",
          "size": 82100000,
          "filename": "JuiceVault-Setup-1.1.0.exe",
          "current": false,
          "releasedAt": "2026-02-20T10:00:00.000Z",
          "downloadUrl": "/cdn/downloads/JuiceVault-Setup-1.1.0.exe"
        }
      ]
    },
    "mac": {
      "current": null,
      "history": []
    },
    "linux": {
      "current": null,
      "history": []
    }
  }
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `version` | string | Semantic version string (e.g. `"1.2.0"`) |
| `hash` | string | SHA-256 hash of the file |
| `size` | number | File size in bytes |
| `filename` | string | Original filename |
| `notes` | string | Release notes (may be empty) |
| `current` | boolean | Whether this is the latest release for its platform+channel |
| `releasedAt` | string | ISO 8601 date when the release was uploaded |
| `downloadUrl` | string | Relative URL to download the file (prefix with base URL) |

History is capped at the 20 most recent releases per platform.

---

### Check for Desktop Update

```
GET /misc/desktop/checkUpdate?hash=HASH
```

🔓 **Public**

Check if a given desktop app hash is the latest version. Clients should compute the SHA-256 hash of their installed binary and send it here on startup.

**Query Params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `hash` | string | ✅ | — | SHA-256 hash of the installed app binary |
| `platform` | string | ❌ | — | `windows`, `mac`, or `linux` — narrows the lookup |
| `channel` | string | ❌ | `stable` | Release channel: `stable`, `beta`, or `dev` |

**Response — up to date:**
```json
{
  "success": true,
  "data": {
    "known": true,
    "updateAvailable": false,
    "platform": "windows",
    "version": "1.2.0",
    "releasedAt": "2026-03-15T12:00:00.000Z"
  }
}
```

**Response — update available:**
```json
{
  "success": true,
  "data": {
    "known": true,
    "updateAvailable": true,
    "platform": "windows",
    "yourVersion": "1.1.0",
    "yourRelease": "2026-02-20T10:00:00.000Z",
    "latest": {
      "version": "1.2.0",
      "hash": "a1b2c3d4e5f6...",
      "size": 85246371,
      "filename": "JuiceVault-Setup-1.2.0.exe",
      "notes": "Bug fixes and performance improvements",
      "releasedAt": "2026-03-15T12:00:00.000Z",
      "downloadUrl": "/cdn/downloads/JuiceVault-Setup-1.2.0.exe"
    }
  }
}
```

**Response — unknown hash:**
```json
{
  "success": true,
  "data": {
    "known": false,
    "updateAvailable": true,
    "message": "Unknown version",
    "latest": {
      "version": "1.2.0",
      "hash": "a1b2c3d4e5f6...",
      "size": 85246371,
      "filename": "JuiceVault-Setup-1.2.0.exe",
      "downloadUrl": "/cdn/downloads/JuiceVault-Setup-1.2.0.exe"
    }
  }
}
```

> **Note:** Unlike the mobile endpoint, the desktop `checkUpdate` response for unknown hashes includes the `latest` object so the client can show the user what to download.

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing `hash` query param |

---

## Mobile App Updates

Endpoints for checking mobile app versions and updates. The API automatically tracks SHA-256 hashes of `JuiceVault.apk` and `JuiceVault.ipa` in the downloads folder, recording new releases whenever the files change (live file-watching, no restart needed).

### Get Mobile Versions

```
GET /misc/mobile/versions
```

🔓 **Public**

Returns current and historical version info for both Android and iOS apps.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "android": {
      "current": {
        "hash": "26609beafcc2e036b60f...",
        "size": 26974637,
        "releasedAt": "2026-03-11T00:24:33.326Z",
        "filename": "JuiceVault.apk"
      },
      "history": [
        {
          "hash": "26609beafcc2e036b60f...",
          "size": 26974637,
          "releasedAt": "2026-03-11T00:24:33.326Z",
          "current": true
        }
      ]
    },
    "ios": {
      "current": { "..." : "same shape" },
      "history": [ "..." ]
    }
  }
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `hash` | string | SHA-256 hash of the file |
| `size` | number | File size in bytes |
| `releasedAt` | string | ISO 8601 date when this version was first detected |
| `filename` | string | Original filename |
| `current` | boolean | Whether this is the latest release |

---

### Check for Mobile Update

```
GET /misc/mobile/checkUpdate?hash=HASH
```

🔓 **Public**

Check if a given app hash is the latest version.

**Query Params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `hash` | string | ✅ | SHA-256 hash of the installed app |
| `platform` | string | ❌ | `android` or `ios` — narrows the lookup |

**Response — up to date:**
```json
{
  "success": true,
  "data": {
    "known": true,
    "updateAvailable": false,
    "platform": "android",
    "releasedAt": "2026-03-11T00:24:33.326Z"
  }
}
```

**Response — update available:**
```json
{
  "success": true,
  "data": {
    "known": true,
    "updateAvailable": true,
    "platform": "android",
    "yourRelease": "2026-02-01T00:00:00.000Z",
    "latestRelease": "2026-03-11T00:24:33.326Z",
    "latestHash": "26609beafcc2..."
  }
}
```

**Response — unknown hash:**
```json
{
  "success": true,
  "data": {
    "known": false,
    "updateAvailable": true,
    "message": "Unknown version"
  }
}
```

**Errors:**

| Status | Error |
|---|---|
| `400` | Missing `hash` query param |

---

## News

### Get Active News

```
GET /misc/news/active
```

🔓 **Public**

Returns the latest active news item (if any). Used by clients to show in-app news banners.

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "title": "Android Is Available",
    "blocks": [
      { "type": "text", "content": { "text": "Android is now available for download!" } },
      { "type": "button", "content": { "label": "Check it out", "url": "https://juicevault.xyz/download", "style": "primary" }, "inline": true }
    ],
    "icon": "info",
    "priority": "normal",
    "active": true,
    "sentByUsername": "admin",
    "createdAt": "2026-03-10T..."
  }
}
```

Returns `null` for `data` if no active news exists.

---

## Health

```
GET /health
```

🔓 **Public**

**Success Response:** `200 OK`
```json
{
  "status": "OK",
  "timestamp": 1709800000000,
  "uptime": 86400,
  "database": { "status": "connected", "song_count": 2150, "media_count": 150 },
  "redis": { "status": "connected" },
  "cache": { "hits": 50000, "misses": 5000, "keys": 200, "hit_rate": "90.91%" },
  "memory": { "rss": "256.00 MB", "heap_used": "128.00 MB" }
}
```

---

## Local Files

The API supports **local files** — audio files that exist only on the user's device (e.g. the desktop app). Local files are never uploaded to the server. Instead, the client sends metadata about the file, and the API stores a reference with `local: true` so other clients (mobile, web) can display the song info without breaking.

### How It Works

- Local files use a **deterministic ID** based on their file hash: `local:<fileHash>` (e.g. `local:a1b2c3d4e5f6...`)
- When adding a local file to a playlist or liking it, the client sends a `localMeta` object with the file's metadata
- The API stores the metadata inline alongside the reference — no Song document is created in the database
- GET endpoints return local songs with `local: true` and `cover: null` so clients know to handle them differently
- Clients without the local file should display the song info (title, artist, etc.) but grey it out or show a "local only" badge

### Local Song Format

When a local song appears in a playlist or liked songs response, it has the same shape as a server song but with `local: true` and no server-specific fields:

```json
{
  "id": "local:a1b2c3d4e5f6...",
  "local": true,
  "file_name": "my_song.mp3",
  "title": "My Local Song",
  "artist": "Some Artist",
  "album": "Some Album",
  "year": null,
  "duration": 210,
  "length": "3:30",
  "bitrate": null,
  "file_size": null,
  "file_size_bytes": null,
  "cover": null,
  "play_count": 0
}
```

### localMeta Object

When sending a local file to the API (liking, adding to playlist, cloning), include a `localMeta` object:

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ | Song title |
| `artist` | string | ❌ | Artist name (default: `"Unknown"`) |
| `album` | string | ❌ | Album name |
| `duration` | number | ❌ | Duration in seconds |
| `fileHash` | string | ✅ | SHA-256 (or similar) hash of the file — used as the unique identifier |
| `fileName` | string | ❌ | Original filename (e.g. `"song.mp3"`) |

### Supported Endpoints

Local files are supported in these endpoints:

- **Like a Song** — `POST /user/likes/:songId` with songId = `local:<fileHash>` and `localMeta` in body
- **Unlike a Song** — `DELETE /user/likes/:songId` with songId = `local:<fileHash>`
- **Check if Liked** — `GET /user/likes/check/:songId` and `POST /user/likes/check` both accept `local:` IDs
- **Add Songs to Playlist** — `POST /user/playlists/:id/songs` with `localFiles` array in body
- **Remove Song from Playlist** — `DELETE /user/playlists/:id/songs/:songId` with songId = `local:<fileHash>`
- **Clone Playlist** — `POST /user/playlists/clone` with `localFiles` array in body

---

## Response Format

All API responses follow a consistent format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

> **Note:** Some older endpoints (music, media, stats, CDN) return data directly without the `success` wrapper. These are the public/read-only endpoints mounted at root level.

---

## Error Handling

| Status Code | Meaning |
|---|---|
| `400` | Bad request — missing or invalid parameters |
| `401` | Unauthorized — missing or invalid auth token |
| `403` | Forbidden — lacks permission (private resource, banned) |
| `404` | Not found |
| `409` | Conflict — resource already exists (duplicate username/email) |
| `410` | Gone — resource expired (e.g. expired invite) |
| `423` | Locked — account locked due to failed login attempts |
| `429` | Too many requests — rate limited |
| `500` | Internal server error |

---

## Rate Limits

| Endpoint Group | Window | Max Requests |
|---|---|---|
| Register / Login | 15 min | 10 |
| Token Refresh | 1 min | 30 |
| Resend Verification | 30 min | 5 |
| Forgot Password | 30 min | 5 |
| Spicetify Install | 1 hour | 5 |
| **Song/Zip Download (verified)** | **2 hours** | **500** |
| **Song/Zip Download (unverified)** | **6 hours** | **100** |
| **Song/Zip Download (anonymous)** | **24 hours** | **30** |

General rate limit headers:
- `RateLimit-Limit`
- `RateLimit-Remaining`
- `RateLimit-Reset`

Download-specific rate limit headers:
- `X-Download-Limit` — max downloads per window
- `X-Download-Remaining` — downloads left
- `X-Download-Used` — downloads used this window
- `X-Download-Reset` — ISO 8601 reset timestamp
- `X-Download-Tier` — `verified`, `unverified`, or `anonymous`
