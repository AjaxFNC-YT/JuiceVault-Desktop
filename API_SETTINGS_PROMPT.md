# API Settings Sync — Prompt for Backend AI

## Context

The JuiceVault desktop app stores several user settings in `localStorage` that currently **don't sync to the API**. When the user logs in on a different device or clears their browser data, these settings are lost. We need to add these settings to the existing `preferences` object on the user model so they persist server-side.

## Current API Preferences (already working)

The `PUT /user/profile` endpoint already accepts these under `preferences`:

| Field | Type | Description |
|---|---|---|
| `eqBass` | number | EQ bass gain (-20 to +20) |
| `eqMid` | number | EQ mid gain (-20 to +20) |
| `eqTreble` | number | EQ treble gain (-20 to +20) |
| `eqReverb` | number | Reverb wet mix (-20 to +20) |
| `eqGain` | number | Master gain (-20 to +20) |
| `crossfadeDuration` | number | Crossfade seconds (0-12) |
| `shuffle` | boolean | Shuffle on/off |
| `repeat` | string | "none" or "all" |
| `quality` | string | Audio quality |
| `privateProfile` | boolean | Hide profile |
| `showListeningHistory` | boolean | Public history |
| `sortBy` | string | Default sort |
| `skipSilence` | boolean | Skip silence |

## New Preferences to Add

Add these fields to the `preferences` object on the user model. They should be accepted on `PUT /user/profile` (under `preferences.*`) and returned on `GET /user/me`:

| Field | Type | Default | Description |
|---|---|---|---|
| `theme` | string | `"default"` | UI theme ID. Valid values are arbitrary strings (theme IDs defined client-side, e.g. `"default"`, `"midnight"`, `"sunset"`, etc.). Just store whatever string the client sends. |
| `discordRpc` | boolean | `true` | Whether Discord Rich Presence is enabled. |
| `mergeSessionEdits` | boolean | `false` | Whether to show session edits inline in the Browse page instead of grouped in a folder. |
| `localFilesEnabled` | boolean | `false` | Whether the local files feature is turned on. |
| `localFilesSources` | array of strings | `[]` | Array of local directory paths the user has added as music sources (e.g. `["C:\\Users\\john\\Music", "D:\\Audio"]`). These are just strings — the server doesn't need to validate them. |

## Implementation Requirements

1. **Add fields to user preferences schema** — Add the 5 new fields above to whatever schema/model defines `preferences` on the user document.

2. **Accept on PUT /user/profile** — The existing `PUT /user/profile` endpoint should accept these new fields under `preferences.*` just like the existing ones. Example request body:
```json
{
  "preferences": {
    "theme": "midnight",
    "discordRpc": false,
    "mergeSessionEdits": true,
    "localFilesEnabled": true,
    "localFilesSources": ["C:\\Users\\john\\Music"]
  }
}
```

3. **Return on GET /user/me** — The `GET /user/me` response should include these new fields in the `preferences` object alongside the existing ones.

4. **Partial updates** — Like the existing preferences, these should support partial updates. If the client only sends `{ "preferences": { "theme": "sunset" } }`, only `theme` should change — don't wipe the other fields.

5. **Validation**:
   - `theme`: string, max 50 chars
   - `discordRpc`: boolean
   - `mergeSessionEdits`: boolean
   - `localFilesEnabled`: boolean
   - `localFilesSources`: array of strings, max 20 items, each string max 500 chars

6. **Backward compatibility** — Existing users without these fields should get the defaults when their profile is fetched. Don't require migration — just use defaults for missing fields.

## Expected Response Format

After implementation, `GET /user/me` should return something like:
```json
{
  "success": true,
  "data": {
    "username": "john",
    "preferences": {
      "eqBass": 0,
      "eqMid": 0,
      "eqTreble": 0,
      "eqReverb": 0,
      "eqGain": 0,
      "crossfadeDuration": 3,
      "shuffle": true,
      "repeat": "all",
      "theme": "midnight",
      "discordRpc": true,
      "mergeSessionEdits": false,
      "localFilesEnabled": true,
      "localFilesSources": ["C:\\Users\\john\\Music"]
    }
  }
}
```

That's it. Just add 5 new fields to the preferences object. No new endpoints needed.
