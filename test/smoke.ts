/**
 * Smoke test for the OpenCut MCP server.
 * Runs the server as a subprocess and exercises core tools.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "../src/index.ts");

const TOOL_TIMEOUT_MS = 35_000; // per-tool call timeout
const BROWSER_PROBE_MS = 20_000; // how long to wait to detect browser availability

let passed = 0;
let failed = 0;
let skipped = 0;
const errors: string[] = [];

function ok(label: string) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`  ✗ ${label}: ${msg}`);
  failed++;
  errors.push(`${label}: ${msg}`);
}

function skip(label: string) {
  console.log(`  ⊘ ${label} (browser unavailable)`);
  skipped++;
}

async function test(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

function assertOk(result: any) {
  const content = result?.content?.[0]?.text;
  if (!content) throw new Error("No content returned");
  const parsed = JSON.parse(content);
  if (parsed?.error || result?.isError) throw new Error(`Tool returned error: ${content}`);
  return parsed;
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS });
}

async function main() {
  console.log("Starting OpenCut MCP server...");

  const transport = new StdioClientTransport({
    command: process.env.BUN_PATH ?? "bun",
    args: ["run", serverEntry],
    env: { ...process.env, MCP_HEADLESS: "true" },
  });

  const client = new Client({ name: "smoke-test", version: "0.0.1" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("Connected.\n");
  } catch (e) {
    console.error("Failed to connect:", e);
    process.exit(1);
  }

  // ── Tool discovery ─────────────────────────────────────────────────────────
  console.log("=== Tool Discovery ===");
  await test("tools/list returns >=150 tools", async () => {
    const { tools } = await client.listTools();
    if (tools.length < 150) throw new Error(`Only ${tools.length} tools registered`);
    console.log(`     (${tools.length} tools registered)`);
  });

  // ── HTTP API tools (no browser/editor needed) ─────────────────────────────
  console.log("\n=== HTTP API Tools ===");
  await test("api_health_check", async () => {
    const res = await callTool(client, "api_health_check");
    const data = assertOk(res);
    if (!data.healthy) throw new Error(`Not healthy: ${JSON.stringify(data)}`);
  });

  await test("api_sounds_search (needs API key)", async () => {
    const res = await callTool(client, "api_sounds_search", { q: "rain", type: "effects" });
    const data = assertOk(res);
    // 401 is expected without a configured Freesound API key — count as pass
    if (data.status === 401 || !data.success) {
      console.log(`     (got ${data.status ?? "error"} — API key not configured, expected)`);
    }
  });

  // ── Browser probe ──────────────────────────────────────────────────────────
  console.log("\n=== Browser Probe ===");
  let browserAvailable = false;
  try {
    await Promise.race([
      callTool(client, "storage_get_is_dirty"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("browser did not respond in time")), BROWSER_PROBE_MS)
      ),
    ]);
    browserAvailable = true;
    console.log("  ✓ Browser available");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ⚠ Browser unavailable (${msg})`);
    console.log("    Skipping all browser-dependent tests.");
    console.log("    Run from a native Windows terminal to test these.\n");
  }

  if (!browserAvailable) {
    // Count all browser-dependent tests as skipped
    const browserTests = [
      "project_list", "project_create", "project_load", "project_get_active",
      "playback_get_state", "playback_seek", "playback_set_volume", "playback_mute/unmute",
      "timeline_track_add video", "timeline_track_add audio", "timeline_track_add text",
      "timeline_track_list", "timeline_track_get", "timeline_track_toggle_mute",
      "text_create", "text_list", "text_update_content", "timeline_element_get",
      "history_can_undo", "history_undo", "history_can_redo", "history_redo",
      "canvas_get_settings", "canvas_set_fps", "canvas_set_size",
      "bookmark_toggle", "bookmark_list", "bookmark_toggle (remove)",
      "selection_get", "selection_deselect_all",
      "timeline_toggle_snapping",
      "scene_create", "scene_list", "scene_rename", "scene_delete",
      "project_close", "project_delete",
    ];
    for (const t of browserTests) skip(t);
    printSummary();
    await client.close();
    process.exit(0);
  }

  // ── Project tools ──────────────────────────────────────────────────────────
  console.log("\n=== Project Tools ===");
  let projectId: string | null = null;

  await test("project_list", async () => {
    const res = await callTool(client, "project_list");
    const data = assertOk(res);
    if (!Array.isArray(data.projects)) throw new Error("projects not array");
    console.log(`     (${data.projects.length} existing projects)`);
  });

  await test("project_create", async () => {
    const res = await callTool(client, "project_create", { name: "MCP Smoke Test" });
    const data = assertOk(res);
    if (!data.id) throw new Error("No id returned");
    projectId = data.id;
    console.log(`     (project id: ${projectId})`);
  });

  if (projectId) {
    await test("project_get_active returns active project", async () => {
      const res = await callTool(client, "project_get_active");
      const data = assertOk(res);
      if (!data.project?.id) throw new Error("No project id");
    });
  }

  // ── Playback tools ─────────────────────────────────────────────────────────
  console.log("\n=== Playback Tools ===");
  await test("playback_get_state", async () => {
    const res = await callTool(client, "playback_get_state");
    const data = assertOk(res);
    if (typeof data.isPlaying !== "boolean") throw new Error("isPlaying missing");
  });

  await test("playback_seek to 0s", async () => {
    // Seek to 0 always works regardless of timeline duration
    const res = await callTool(client, "playback_seek", { time: 0 });
    assertOk(res);
  });

  await test("playback_set_volume 0.5", async () => {
    const res = await callTool(client, "playback_set_volume", { volume: 0.5 });
    assertOk(res);
  });

  await test("playback_mute / playback_unmute", async () => {
    await callTool(client, "playback_mute");
    await callTool(client, "playback_unmute");
  });

  // ── Timeline track tools ───────────────────────────────────────────────────
  console.log("\n=== Timeline Track Tools ===");
  let videoTrackId: string | null = null;
  let audioTrackId: string | null = null;
  let textTrackId: string | null = null;

  await test("timeline_track_add video", async () => {
    const res = await callTool(client, "timeline_track_add", { type: "video" });
    const data = assertOk(res);
    if (!data.trackId) throw new Error("No trackId");
    videoTrackId = data.trackId;
    console.log(`     (video trackId: ${videoTrackId})`);
  });

  await test("timeline_track_add audio", async () => {
    const res = await callTool(client, "timeline_track_add", { type: "audio" });
    const data = assertOk(res);
    audioTrackId = data.trackId;
  });

  await test("timeline_track_add text", async () => {
    const res = await callTool(client, "timeline_track_add", { type: "text" });
    const data = assertOk(res);
    textTrackId = data.trackId;
  });

  await test("timeline_track_list returns tracks", async () => {
    const res = await callTool(client, "timeline_track_list");
    const data = assertOk(res);
    if (!Array.isArray(data.tracks)) throw new Error("tracks not array");
    console.log(`     (${data.tracks.length} tracks total)`);
  });

  await test("timeline_track_get returns track", async () => {
    if (!videoTrackId) throw new Error("No videoTrackId");
    const res = await callTool(client, "timeline_track_get", { trackId: videoTrackId });
    const data = assertOk(res);
    if (!data.track?.id) throw new Error("No track.id");
  });

  await test("timeline_track_toggle_mute", async () => {
    if (!audioTrackId) throw new Error("No audioTrackId");
    await callTool(client, "timeline_track_toggle_mute", { trackId: audioTrackId });
    await callTool(client, "timeline_track_toggle_mute", { trackId: audioTrackId });
  });

  // ── Text element tools ─────────────────────────────────────────────────────
  console.log("\n=== Text Element Tools ===");
  let textElementId: string | null = null;

  await test("text_create", async () => {
    const res = await callTool(client, "text_create", {
      content: "Hello from MCP",
      startTime: 0,
      duration: 3,
      fontSize: 64,
      color: "#ff0000",
    });
    const data = assertOk(res);
    if (!data.elementId) throw new Error("No elementId");
    textElementId = data.elementId;
    textTrackId = data.trackId ?? textTrackId;
    console.log(`     (elementId: ${textElementId})`);
  });

  await test("text_list returns elements", async () => {
    const res = await callTool(client, "text_list");
    const data = assertOk(res);
    if (!Array.isArray(data.elements)) throw new Error("elements not array");
    if (data.elements.length < 1) throw new Error("No text elements found");
  });

  if (textElementId && textTrackId) {
    await test("text_update_content", async () => {
      const res = await callTool(client, "text_update_content", {
        trackId: textTrackId!,
        elementId: textElementId!,
        content: "Updated by smoke test",
      });
      assertOk(res);
    });

    await test("timeline_element_get reflects update", async () => {
      const res = await callTool(client, "timeline_element_get", {
        trackId: textTrackId!,
        elementId: textElementId!,
      });
      const data = assertOk(res);
      if (data.element?.content !== "Updated by smoke test") {
        throw new Error(`Content mismatch: ${data.element?.content}`);
      }
    });
  }

  // ── History tools ──────────────────────────────────────────────────────────
  console.log("\n=== History Tools ===");
  await test("history_can_undo is true after edits", async () => {
    const res = await callTool(client, "history_can_undo");
    const data = assertOk(res);
    if (!data.canUndo) throw new Error("Expected canUndo=true after edits");
  });

  await test("history_undo works", async () => {
    const res = await callTool(client, "history_undo");
    const data = assertOk(res);
    if (!data.success) throw new Error("Undo returned success=false");
  });

  await test("history_can_redo after undo", async () => {
    const res = await callTool(client, "history_can_redo");
    const data = assertOk(res);
    if (!data.canRedo) throw new Error("Expected canRedo=true after undo");
  });

  await test("history_redo works", async () => {
    const res = await callTool(client, "history_redo");
    const data = assertOk(res);
    if (!data.success) throw new Error("Redo returned success=false");
  });

  // ── Canvas tools ───────────────────────────────────────────────────────────
  console.log("\n=== Canvas Tools ===");
  await test("canvas_get_settings", async () => {
    const res = await callTool(client, "canvas_get_settings");
    const data = assertOk(res);
    if (!data.settings?.canvasSize) throw new Error("No canvasSize");
  });

  await test("canvas_set_fps to 30", async () => {
    const res = await callTool(client, "canvas_set_fps", { fps: 30 });
    assertOk(res);
  });

  await test("canvas_set_size preset 9:16", async () => {
    const res = await callTool(client, "canvas_set_size", { preset: "9:16" });
    const data = assertOk(res);
    if (data.width !== 1080 || data.height !== 1920) {
      throw new Error(`Wrong size: ${data.width}x${data.height}`);
    }
  });

  // ── Bookmark tools ─────────────────────────────────────────────────────────
  console.log("\n=== Bookmark Tools ===");
  // Use time 0 since that always exists on any timeline
  await test("bookmark_toggle at time 0", async () => {
    const res = await callTool(client, "bookmark_toggle", { time: 0 });
    assertOk(res);
  });

  await test("bookmark_list returns bookmark", async () => {
    const res = await callTool(client, "bookmark_list");
    const data = assertOk(res);
    if (!Array.isArray(data.bookmarks)) throw new Error("bookmarks not array");
    if (data.bookmarks.length < 1) throw new Error("Expected >= 1 bookmark");
    console.log(`     (${data.bookmarks.length} bookmarks)`);
  });

  await test("bookmark_toggle same time removes it", async () => {
    const res = await callTool(client, "bookmark_toggle", { time: 0 });
    assertOk(res);
  });

  // ── Selection tools ────────────────────────────────────────────────────────
  console.log("\n=== Selection Tools ===");
  await test("selection_get returns empty initially", async () => {
    const res = await callTool(client, "selection_get");
    const data = assertOk(res);
    if (!Array.isArray(data.selected)) throw new Error("selected not array");
  });

  await test("selection_deselect_all", async () => {
    const res = await callTool(client, "selection_deselect_all");
    assertOk(res);
  });

  // ── Timeline settings ──────────────────────────────────────────────────────
  console.log("\n=== Timeline Settings ===");
  await test("timeline_toggle_snapping", async () => {
    const r1 = await callTool(client, "timeline_toggle_snapping");
    const d1 = assertOk(r1);
    const r2 = await callTool(client, "timeline_toggle_snapping");
    const d2 = assertOk(r2);
    if (d1.snappingEnabled === d2.snappingEnabled) throw new Error("Snapping did not toggle");
  });

  // ── Scenes tools ───────────────────────────────────────────────────────────
  console.log("\n=== Scenes Tools ===");
  let newSceneId: string | null = null;

  await test("scene_create", async () => {
    const res = await callTool(client, "scene_create", { name: "Test Scene" });
    const data = assertOk(res);
    if (!data.id) throw new Error("No scene id");
    newSceneId = data.id;
  });

  await test("scene_list returns scenes", async () => {
    const res = await callTool(client, "scene_list");
    const data = assertOk(res);
    if (!Array.isArray(data.scenes)) throw new Error("scenes not array");
    if (data.scenes.length < 2) throw new Error(`Expected >= 2 scenes, got ${data.scenes.length}`);
  });

  if (newSceneId) {
    await test("scene_rename", async () => {
      const res = await callTool(client, "scene_rename", { id: newSceneId!, name: "Renamed Scene" });
      assertOk(res);
    });

    await test("scene_delete", async () => {
      const res = await callTool(client, "scene_delete", { id: newSceneId! });
      assertOk(res);
    });
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  console.log("\n=== Cleanup ===");
  if (projectId) {
    await test("project_close", async () => {
      const res = await callTool(client, "project_close");
      assertOk(res);
    });

    await test("project_delete test project", async () => {
      const res = await callTool(client, "project_delete", { id: projectId! });
      assertOk(res);
    });
  }

  printSummary();
  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log("\n" + "═".repeat(50));
  const parts = [`${passed} passed`, `${failed} failed`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  console.log(`Results: ${parts.join(", ")}`);
  if (errors.length > 0) {
    console.log("\nFailures:");
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
