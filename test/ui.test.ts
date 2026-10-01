import assert from "node:assert/strict";
import { test } from "node:test";
import { initTheme, Theme } from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { MemoryPreview, summary, terminalText } from "../src/ui.ts";

initTheme("dark");
// Identity colors isolate wrapping from the terminal's color capability detection.
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const keys = new KeybindingsManager(TUI_KEYBINDINGS);

test("summary 报告全文/按需条数与提醒项", () => {
  const snapshot = {
    directory: "/vault",
    sources: [
      {
        kind: "global",
        path: "/vault",
        notes: [{ name: "a.md", path: "/vault/a.md" }],
        folders: [],
        issues: [],
        text: "# 记忆",
        bytes: 10,
      },
    ],
    issues: [
      "USER.md：每轮注入全文 24.7 KiB，超过单篇默认展开 8 KiB 上限；请拆分，或改为按需阅读。",
    ],
    text: "# 记忆",
    bytes: 31701,
    reads: 1,
    cacheHits: 0,
  } as unknown as Parameters<typeof summary>[0];
  assert.equal(
    summary(snapshot),
    "0 全文 · 1 按需 · 0 文件夹 · 31.0 KiB · 1 项提醒",
  );
});

test("preview fits narrow and normal widths, scrolls, closes and sanitizes terminal controls", () => {
  let closed = false;
  const text = Array.from(
    { length: 100 },
    (_, i) => `第${i}行 用户偏好 ${"long/path/".repeat(8)}`,
  ).join("\n");
  const preview = new MemoryPreview(
    text,
    "1 全文 · 2 按需",
    theme,
    keys,
    () => 40,
    () => {
      closed = true;
    },
  );
  for (const width of [1, 20, 44, 80, 120]) {
    const output = preview.render(width);
    assert.ok(output.length <= 35);
    assert.ok(
      output.every((line) => visibleWidth(line) <= width),
      `width ${width}`,
    );
  }
  const before = preview.render(80).join("\n");
  preview.handleInput("\x1b[6~");
  assert.notEqual(preview.render(80).join("\n"), before);
  preview.handleInput("\x1b");
  assert.equal(closed, true);
  assert.equal(terminalText("hello\x1b[2J\x00 world"), "hello world");
});
