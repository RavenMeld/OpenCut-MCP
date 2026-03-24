import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { browserManager } from "./browser.js";

import { projectTools, projectHandlers } from "./tools/project.js";
import { scenesTools, scenesHandlers } from "./tools/scenes.js";
import { playbackTools, playbackHandlers } from "./tools/playback.js";
import { timelineTracksTools, timelineTracksHandlers } from "./tools/timeline-tracks.js";
import { timelineElementsTools, timelineElementsHandlers } from "./tools/timeline-elements.js";
import { timelineEffectsTools, timelineEffectsHandlers } from "./tools/timeline-effects.js";
import { keyframesTools, keyframesHandlers } from "./tools/keyframes.js";
import { selectionTools, selectionHandlers } from "./tools/selection.js";
import { clipboardTools, clipboardHandlers } from "./tools/clipboard.js";
import { historyTools, historyHandlers } from "./tools/history.js";
import { mediaTools, mediaHandlers } from "./tools/media.js";
import { textTools, textHandlers } from "./tools/text.js";
import { audioTools, audioHandlers } from "./tools/audio.js";
import { stickersTools, stickersHandlers } from "./tools/stickers.js";
import { transcriptionTools, transcriptionHandlers } from "./tools/transcription.js";
import { exportTools, exportHandlers } from "./tools/export.js";
import { bookmarksTools, bookmarksHandlers } from "./tools/bookmarks.js";
import { canvasTools, canvasHandlers } from "./tools/canvas.js";
import { panelsTools, panelsHandlers } from "./tools/panels.js";
import { keybindingsTools, keybindingsHandlers } from "./tools/keybindings.js";
import { timelineSettingsTools, timelineSettingsHandlers } from "./tools/timeline-settings.js";
import { storageTools, storageHandlers } from "./tools/storage.js";
import { authTools, authHandlers } from "./tools/auth.js";
import { apiTools, apiHandlers } from "./tools/api.js";

const allTools = [
  ...projectTools,
  ...scenesTools,
  ...playbackTools,
  ...timelineTracksTools,
  ...timelineElementsTools,
  ...timelineEffectsTools,
  ...keyframesTools,
  ...selectionTools,
  ...clipboardTools,
  ...historyTools,
  ...mediaTools,
  ...textTools,
  ...audioTools,
  ...stickersTools,
  ...transcriptionTools,
  ...exportTools,
  ...bookmarksTools,
  ...canvasTools,
  ...panelsTools,
  ...keybindingsTools,
  ...timelineSettingsTools,
  ...storageTools,
  ...authTools,
  ...apiTools,
];

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const allHandlers = new Map<string, Handler>([
  ...projectHandlers,
  ...scenesHandlers,
  ...playbackHandlers,
  ...timelineTracksHandlers,
  ...timelineElementsHandlers,
  ...timelineEffectsHandlers,
  ...keyframesHandlers,
  ...selectionHandlers,
  ...clipboardHandlers,
  ...historyHandlers,
  ...mediaHandlers,
  ...textHandlers,
  ...audioHandlers,
  ...stickersHandlers,
  ...transcriptionHandlers,
  ...exportHandlers,
  ...bookmarksHandlers,
  ...canvasHandlers,
  ...panelsHandlers,
  ...keybindingsHandlers,
  ...timelineSettingsHandlers,
  ...storageHandlers,
  ...authHandlers,
  ...apiHandlers,
]);

async function main() {
  console.error(`[opencut-mcp] Starting server with ${allTools.length} tools`);

  // Launch browser in background — tool calls will wait on it automatically
  browserManager.launch().then(() => {
    console.error("[opencut-mcp] Browser ready");
  }).catch((err) => {
    console.error("[opencut-mcp] Browser launch failed:", err);
  });

  const server = new Server(
    { name: "opencut-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = allHandlers.get(name);

    if (!handler) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler((args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[opencut-mcp] Tool error (${name}):`, message);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[opencut-mcp] Connected via stdio");

  process.on("SIGINT", async () => {
    console.error("[opencut-mcp] Shutting down...");
    await browserManager.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await browserManager.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[opencut-mcp] Fatal error:", err);
  process.exit(1);
});
