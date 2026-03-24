OpenCut MCP

Model Context Protocol (MCP) server for [OpenCut](https://opencut.app) — the open-source browser-based video editor. Exposes **161 tools** that give any MCP-compatible AI assistant full programmatic control over OpenCut's editor, timeline, media, effects, export pipeline, and more.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [Connecting to Claude Desktop](#connecting-to-claude-desktop)
- [Environment Variables](#environment-variables)
- [Tool Reference](#tool-reference)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## How It Works

OpenCut stores all project data in the browser's IndexedDB / OPFS — there is no server-side project storage. The MCP server bridges this gap by:

1. Launching a headless Chromium browser via [Playwright](https://playwright.dev)
2. Navigating to the running OpenCut web app
3. Calling JavaScript directly inside the page via `page.evaluate()` to invoke `EditorCore` methods and read Zustand store state
4. Exposing those calls as standard MCP tools over `stdio`

```
Claude / MCP Client
      │
      │  stdio (JSON-RPC)
      ▼
@opencut/mcp server
  ├── Playwright (headless Chromium)
  │     └── page.evaluate() → window.__opencut (EditorCore)
  │     └── page.evaluate() → window.__stores  (Zustand stores)
  └── fetch() → /api/health, /api/sounds/search, /api/auth/*
      ▼
OpenCut web app  (http://localhost:3001)
```

Two small patches to the web app expose the necessary globals (already applied):

| File | What is exposed |
|------|----------------|
| `editor-provider.tsx` | `window.__opencut` — the `EditorCore` singleton after a project loads |
| `editor-provider.tsx` | `window.__stores` — all Zustand stores (panel, timeline, keybindings, sounds, stickers, assets, preview) |
| `projects/page.tsx` | `window.__opencut` — also exposed on the home page so `project_list` works without opening an editor |

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| [Bun](https://bun.sh) | ≥ 1.0 |
| OpenCut web app running | `http://localhost:3001` (default) |
| Playwright Chromium | installed via `bunx playwright install chromium` |

> **Windows users:** The MCP server must be started from a **native Windows Terminal** (PowerShell, CMD, or Windows Terminal). It cannot launch Chrome from Git Bash or WSL due to a Windows process-creation restriction.

---

## Installation

```bash
# From the repo root
cd apps/mcp
bun install
bunx playwright install chromium
```

---

## Running the Server

### Step 1 — Start OpenCut

```bash
# From the repo root
bun dev
# OpenCut will be available at http://localhost:3001
```

### Step 2 — Start the MCP server

```bash
# From apps/mcp (native Windows Terminal / macOS Terminal)
bun start
```

The server connects via `stdio`. You should see:

```
[opencut-mcp] Starting server with 161 tools
[opencut-mcp] Connected via stdio
[opencut-mcp] Browser ready
```

### Development mode (auto-restart on file changes)

```bash
bun dev
```

---

## Connecting to Claude Desktop

Add the following to your `claude_desktop_config.json`:

**Windows** (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "opencut": {
      "command": "bun",
      "args": [
        "run",
        "C:/Users/<YOUR_USERNAME>/Desktop/Opencut/OpenCut/apps/mcp/src/index.ts"
      ],
      "env": {
        "OPENCUT_URL": "http://localhost:3001"
      }
    }
  }
}
```

**macOS** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "opencut": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/OpenCut/apps/mcp/src/index.ts"
      ],
      "env": {
        "OPENCUT_URL": "http://localhost:3001"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The OpenCut tools will appear in Claude's tool list.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCUT_URL` | `http://localhost:3001` | Base URL of the running OpenCut web app |
| `MCP_HEADLESS` | `true` | Set to `false` to show the Chromium browser window (useful for debugging) |
| `CHROMIUM_PATH` | _(Playwright bundled)_ | Absolute path to a custom Chromium / Chrome executable |

---

## Tool Reference

All 161 tools are organized into 24 modules. Every tool returns a JSON object. On error, the response includes `isError: true` and an `Error:` message string.

---

### Project (16 tools)

| Tool | Description |
|------|-------------|
| `project_create` | Create a new project. Returns `{ id }`. |
| `project_load` | Load an existing project into the editor by ID. |
| `project_save` | Flush any pending saves for the active project. |
| `project_delete` | Delete a project by ID. |
| `project_duplicate` | Duplicate one or more projects by ID. Returns `{ newIds }`. |
| `project_list` | List all saved projects with metadata. |
| `project_get_active` | Get info about the currently loaded project. |
| `project_rename` | Rename the active project. |
| `project_update_settings` | Update FPS, canvas size, background type/color/blur. |
| `project_get_timeline_view_state` | Get zoom level, scroll position, and playhead time. |
| `project_set_timeline_view_state` | Set zoom level, scroll position, and/or playhead time. |
| `project_get_export_state` | Get current export progress and result. |
| `project_cancel_export` | Cancel an in-progress export. |
| `project_clear_export_state` | Clear export state after completion. |
| `project_close` | Save thumbnail, flush, close project, and navigate home. |
| `project_get_total_duration` | Get the total timeline duration in seconds. |

---

### Scenes (6 tools)

| Tool | Description |
|------|-------------|
| `scene_create` | Create a new scene. Returns `{ id }`. |
| `scene_delete` | Delete a scene by ID. |
| `scene_rename` | Rename a scene. |
| `scene_switch` | Switch to a scene by ID. |
| `scene_list` | List all scenes in the active project. |
| `scene_get_current` | Get the currently active scene. |

---

### Playback (10 tools)

| Tool | Description |
|------|-------------|
| `playback_play` | Start playback. |
| `playback_pause` | Pause playback. |
| `playback_toggle` | Toggle play/pause. |
| `playback_stop` | Pause and seek to time 0. |
| `playback_seek` | Seek to a time in seconds. |
| `playback_set_volume` | Set volume (0.0 – 1.0). |
| `playback_mute` | Mute audio. |
| `playback_unmute` | Unmute audio. |
| `playback_toggle_mute` | Toggle mute state. |
| `playback_get_state` | Get `{ isPlaying, currentTime, volume, isMuted }`. |

---

### Timeline Tracks (6 tools)

| Tool | Description |
|------|-------------|
| `timeline_track_add` | Add a track (`video`, `audio`, `text`, `sticker`, `effect`). Returns `{ trackId }`. |
| `timeline_track_remove` | Remove a track by ID. |
| `timeline_track_toggle_mute` | Toggle mute on a track. |
| `timeline_track_toggle_visibility` | Toggle visibility on a track. |
| `timeline_track_list` | List all tracks in the current scene. |
| `timeline_track_get` | Get a track and its elements by ID. |

---

### Timeline Elements (15 tools)

| Tool | Description |
|------|-------------|
| `timeline_element_insert` | Insert an element into a track. |
| `timeline_element_delete` | Delete one or more elements. |
| `timeline_element_duplicate` | Duplicate elements with an optional time offset. |
| `timeline_element_move` | Move an element to a different track or time. |
| `timeline_element_split` | Split elements at a specific time. |
| `timeline_element_trim` | Update an element's in/out trim points. |
| `timeline_element_update_duration` | Set an element's duration. |
| `timeline_element_update_start_time` | Set the start time of one or more elements. |
| `timeline_element_toggle_visibility` | Show or hide elements. |
| `timeline_element_toggle_mute` | Mute or unmute elements. |
| `timeline_element_update` | Update arbitrary element properties (opacity, blendMode, transform, etc.). |
| `timeline_element_get` | Get a full element definition by track ID and element ID. |
| `timeline_element_preview` | Apply temporary (non-committed) updates for live preview. |
| `timeline_element_preview_commit` | Commit the active preview as an undoable command. |
| `timeline_element_preview_discard` | Discard the active preview and revert to the original state. |

---

### Timeline Effects (5 tools)

| Tool | Description |
|------|-------------|
| `timeline_effect_add` | Add an effect to an element. Returns `{ effectId }`. |
| `timeline_effect_remove` | Remove an effect from an element. |
| `timeline_effect_update_params` | Update effect parameters (e.g. `{ radius: 10 }`). |
| `timeline_effect_toggle` | Enable or disable an effect. |
| `timeline_effect_reorder` | Reorder effects on an element by index. |

---

### Keyframes (6 tools)

| Tool | Description |
|------|-------------|
| `keyframe_upsert` | Create or update a keyframe on an element property (e.g. `transform.x`, `opacity`). |
| `keyframe_remove` | Remove a keyframe by ID. |
| `keyframe_retime` | Move a keyframe to a new time. |
| `keyframe_effect_param_upsert` | Create or update a keyframe on an effect parameter. |
| `keyframe_effect_param_remove` | Remove a keyframe from an effect parameter. |
| `keyframe_list` | List all keyframes on an element. |

---

### Text (9 tools)

| Tool | Description |
|------|-------------|
| `text_create` | Create a text element (auto-creates a text track if none specified). Returns `{ elementId, trackId }`. |
| `text_update_content` | Update the text string. |
| `text_update_font` | Update font family, size, weight, style, and decoration. |
| `text_update_style` | Update color, alignment, letter spacing, line height, and opacity. |
| `text_update_background` | Update text background box (color, radius, padding). |
| `text_update_transform` | Update position (x, y), scale, and rotation. |
| `text_update_blend_mode` | Set the CSS blend mode. |
| `text_list` | List all text elements across all tracks. |
| `text_delete` | Delete a text element. |

---

### Media (7 tools)

| Tool | Description |
|------|-------------|
| `media_list` | List all media assets in the current project. |
| `media_add_file` | Upload a local file as a media asset. |
| `media_remove` | Remove a media asset by ID. |
| `media_clear_all` | Remove all media assets. |
| `media_get` | Get a specific media asset by ID. |
| `media_add_to_timeline` | Add a media asset to the timeline (auto-creates a track if needed). |
| `media_is_loading` | Check if media is currently being loaded. |

---

### Audio (8 tools)

| Tool | Description |
|------|-------------|
| `audio_set_element_volume` | Set the volume of an audio element on the timeline. |
| `audio_sound_search` | Search the Freesound library (requires API key). |
| `audio_sound_save` | Save a sound to the user's saved library. |
| `audio_sound_remove_saved` | Remove a sound from the saved library by numeric ID. |
| `audio_sound_list_saved` | List all saved sounds. |
| `audio_sound_toggle_commercial_filter` | Toggle the commercial-use-only filter. |
| `audio_sound_add_to_timeline` | Add a library sound to the timeline. |
| `audio_sound_clear_saved` | Clear all saved sounds. |

---

### Stickers (6 tools)

| Tool | Description |
|------|-------------|
| `sticker_search` | Search stickers by query. |
| `sticker_browse_category` | Browse stickers by category (`all`, `emoji`, `flags`, `icons`, `shapes`). |
| `sticker_add_to_timeline` | Add a sticker element to the timeline. |
| `sticker_list_recent` | List recently used stickers. |
| `sticker_clear_recent` | Clear recent stickers. |
| `sticker_set_category` | Set the active sticker category in the UI. |

---

### Bookmarks (8 tools)

| Tool | Description |
|------|-------------|
| `bookmark_toggle` | Toggle a bookmark at the current or specified time. |
| `bookmark_update` | Update a bookmark's note, color, or duration. |
| `bookmark_move` | Move a bookmark to a new time. |
| `bookmark_remove` | Remove a bookmark at a specific time. |
| `bookmark_list` | List all bookmarks in the current scene. |
| `bookmark_get_at_time` | Get the bookmark at a specific time (or `null`). |
| `bookmark_is_bookmarked` | Check if a bookmark exists at a specific time. |
| `bookmark_toggle_overlay` | Toggle the bookmark overlay in the preview. |

---

### Selection (4 tools)

| Tool | Description |
|------|-------------|
| `selection_select` | Select one or more elements by `{ trackId, elementId }`. |
| `selection_deselect_all` | Clear all selections. |
| `selection_get` | Get the list of currently selected elements. |
| `selection_is_selected` | Check if a specific element is selected. |

---

### Clipboard (2 tools)

| Tool | Description |
|------|-------------|
| `clipboard_copy` | Copy currently selected elements to the clipboard. |
| `clipboard_paste` | Paste elements at the current or a specified time. |

---

### History (4 tools)

| Tool | Description |
|------|-------------|
| `history_undo` | Undo the last action. Returns `{ success }`. |
| `history_redo` | Redo the last undone action. Returns `{ success }`. |
| `history_can_undo` | Check if undo is available. |
| `history_can_redo` | Check if redo is available. |

---

### Export (6 tools)

| Tool | Description |
|------|-------------|
| `export_project` | Export the project to video. Polls until complete. Returns the export result. |
| `export_get_progress` | Get current export progress and state. |
| `export_cancel` | Cancel an in-progress export. |
| `export_clear_state` | Clear export state after completion. |
| `export_set_quality` | Set the quality preset for the next export (`low`, `medium`, `high`, `very_high`). |
| `export_set_fps` | Override the FPS for export (updates project settings). |

---

### Canvas (7 tools)

| Tool | Description |
|------|-------------|
| `canvas_set_size` | Set canvas dimensions or apply a preset (`16:9`, `9:16`, `1:1`, `4:3`). |
| `canvas_set_fps` | Set the project frame rate. |
| `canvas_set_background` | Set the background type (color or blur). |
| `canvas_set_layout_guide` | Set a platform layout guide (e.g. TikTok safe zone). |
| `canvas_toggle_layout_guide` | Toggle a layout guide on or off. |
| `canvas_clear_layout_guide` | Remove the active layout guide. |
| `canvas_get_settings` | Get current canvas size, FPS, and background. |

---

### Transcription (5 tools)

| Tool | Description |
|------|-------------|
| `transcription_transcribe` | Initiate transcription on a media asset using a Whisper model. |
| `transcription_cancel` | Cancel an in-progress transcription. |
| `transcription_generate_captions` | Split transcription segments into caption chunks. |
| `transcription_add_captions_to_timeline` | Insert caption text elements from segments directly onto the timeline. |
| `transcription_get_state` | Get the current transcription state. |

---

### Timeline Settings (4 tools)

| Tool | Description |
|------|-------------|
| `timeline_toggle_snapping` | Toggle timeline snapping. Returns `{ snappingEnabled }`. |
| `timeline_toggle_ripple_editing` | Toggle ripple editing. Returns `{ rippleEditingEnabled }`. |
| `timeline_set_zoom` | Set the timeline zoom level. |
| `timeline_set_scroll` | Set the timeline horizontal scroll position. |

---

### Panels (7 tools)

| Tool | Description |
|------|-------------|
| `panel_set_size` | Set a panel's size percentage (`tools`, `preview`, `properties`, `mainContent`, `timeline`). |
| `panel_reset` | Reset all panels to default sizes. |
| `panel_get_sizes` | Get all current panel sizes. |
| `panel_set_active_tab` | Set the active assets panel tab. |
| `panel_set_media_view_mode` | Set the media view mode (`grid` or `list`). |
| `panel_set_media_sort` | Set the media sort key and order. |
| `panel_get_active_tab` | Get the currently active assets panel tab. |

---

### Keybindings (8 tools)

| Tool | Description |
|------|-------------|
| `keybinding_get_all` | Get all keybinding configurations. |
| `keybinding_update` | Map a key combination to an action. |
| `keybinding_remove` | Remove a keybinding for a key. |
| `keybinding_reset_defaults` | Reset all keybindings to defaults. |
| `keybinding_import` | Import a keybinding configuration object. |
| `keybinding_export` | Export the current keybinding configuration. |
| `keybinding_enable` | Enable keybindings. |
| `keybinding_disable` | Disable keybindings. |

---

### Storage (3 tools)

| Tool | Description |
|------|-------------|
| `storage_get_migration_state` | Get the current storage schema migration state. |
| `storage_list_projects` | List all projects directly from storage. |
| `storage_get_is_dirty` | Check if the active project has unsaved changes. |

---

### Auth (6 tools)

| Tool | Description |
|------|-------------|
| `auth_sign_up` | Create a new account (email + password). |
| `auth_sign_in` | Sign in to an account. |
| `auth_sign_out` | Sign out. |
| `auth_get_session` | Get the current session. |
| `auth_get_profile` | Get the current user's profile from the browser session. |
| `auth_check_logged_in` | Check if a user is logged in. Returns `{ loggedIn, user }`. |

---

### API (3 tools)

| Tool | Description |
|------|-------------|
| `api_health_check` | Check if the OpenCut server is running. Returns `{ healthy, status }`. |
| `api_sounds_search` | Search Freesound via the OpenCut API proxy. Requires a configured Freesound API key. |
| `api_sounds_search_next_page` | Fetch the next page of a sound search result. |

---

## Development

### Project structure

```
apps/mcp/
├── src/
│   ├── index.ts          # MCP server entry point — registers all tools and handlers
│   ├── browser.ts        # Playwright lifecycle and evaluate() wrappers
│   └── tools/            # One file per tool group (24 files)
│       ├── project.ts
│       ├── scenes.ts
│       ├── playback.ts
│       ├── timeline-tracks.ts
│       ├── timeline-elements.ts
│       ├── timeline-effects.ts
│       ├── keyframes.ts
│       ├── text.ts
│       ├── media.ts
│       ├── audio.ts
│       ├── stickers.ts
│       ├── transcription.ts
│       ├── export.ts
│       ├── bookmarks.ts
│       ├── selection.ts
│       ├── clipboard.ts
│       ├── history.ts
│       ├── canvas.ts
│       ├── panels.ts
│       ├── keybindings.ts
│       ├── timeline-settings.ts
│       ├── storage.ts
│       ├── auth.ts
│       └── api.ts
├── test/
│   └── smoke.ts          # End-to-end smoke test suite
├── package.json
└── tsconfig.json
```

### Adding a new tool

Each tool file exports a `fooTools: Tool[]` array and a `fooHandlers: [string, Handler][]` array:

```typescript
export const fooTools: Tool[] = [
  {
    name: "foo_bar",
    description: "Does foo bar",
    inputSchema: {
      type: "object",
      properties: { value: { type: "number" } },
      required: ["value"],
    },
  },
];

export const fooHandlers: [string, Handler][] = [
  ["foo_bar", async (args) => {
    const { value } = z.object({ value: z.number() }).parse(args);
    const result = await browserManager.evaluateWithArg(
      (v: number) => (window as any).__opencut.someManager.someMethod({ v }),
      value
    );
    return { success: true, result };
  }],
];
```

Then import and register both in `src/index.ts`.

### Key implementation notes

**Playwright arg passing** — `page.evaluate(fn)` closures cannot capture outer variables. Always use `evaluateWithArg(fn, arg)` when passing values from MCP arguments into the browser.

**Async EditorCore methods** — Use `evaluateAsyncWithArg(async (arg) => { await ... }, arg)` when the browser-side method returns a Promise.

**Zustand stores** — Access via `window.__stores.panel.getState().setPanel(...)`. All stores are synchronous getters.

**Preview API** — Use `timeline_element_preview` for live adjustments, then `timeline_element_preview_commit` to create an undoable command or `timeline_element_preview_discard` to revert.

---

## Testing

The smoke test connects to the MCP server as a subprocess and exercises all major tool groups.

```bash
# Requires OpenCut running at http://localhost:3001
bun run test/smoke.ts
```

If the browser is unavailable (e.g. running from Git Bash on Windows), all browser-dependent tests are automatically skipped and the suite exits cleanly:

```
=== Tool Discovery ===
  ✓ tools/list returns >=150 tools
     (161 tools registered)

=== HTTP API Tools ===
  ✓ api_health_check
  ✓ api_sounds_search (needs API key)

=== Browser Probe ===
  ⚠ Browser unavailable (browser did not respond in time)
    Skipping all browser-dependent tests.
    Run from a native Windows terminal to test these.

══════════════════════════════════════════════════
Results: 3 passed, 0 failed, 36 skipped
```

Run from a native Windows Terminal with OpenCut running to get all 39 tests passing.

---

## Troubleshooting

### `Browser not launched` error

The server calls `browserManager.launch()` automatically on startup. If it fails, check:

- Playwright Chromium is installed: `bunx playwright install chromium`
- You are not running from Git Bash / WSL on Windows (use PowerShell or CMD)
- The `CHROMIUM_PATH` environment variable points to a valid executable if set

### `Editor not ready after 30000ms`

The server navigated to an editor URL but `window.__opencut` did not become available within 30 seconds. Check:

- OpenCut is running at `OPENCUT_URL` (default: `http://localhost:3001`)
- The editor-provider patch is present in `apps/web/src/components/providers/editor-provider.tsx`

### Tools return `Error: No active project`

Several tools require an active project loaded in the editor. Call `project_create` or `project_load` first.

### `api_sounds_search` returns 401

The Freesound API requires a key configured in `apps/web/.env`. This is not a bug in the MCP server.

### `MCP_HEADLESS=false` for debugging

Set this environment variable to watch the Chromium browser as the MCP server interacts with it:

```bash
MCP_HEADLESS=false bun start
```
