import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_MAX_CONTEXT_BYTES } from "../src/config.ts";
import { KeywordIndex } from "../src/keywords.ts";
import { MemoryLoader } from "../src/memory.ts";

async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  maxContextBytes = DEFAULT_MAX_CONTEXT_BYTES,
) {
  const directory = await mkdtemp(join(tmpdir(), "pi-memory-expanded-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { directory: join(directory, "vault"), maxContextBytes };
  await mkdir(join(config.directory, "deep"), { recursive: true });
  const loader = new MemoryLoader();
  const index = new KeywordIndex();
  return {
    config,
    index,
    refresh: async () => index.refresh(await loader.scan(config)),
    scan: () => loader.scan(config),
    write: (relative: string, text: string) =>
      writeFile(join(config.directory, relative), text),
  };
}

const ROOT = `---\ndescription: 用户画像\ndefaultopen: true\n---\nROOT_BODY\n`;
const HIDDEN = `---\ndescription: 备份流程\ndefaultopen: false\n---\nDEEP_HIDDEN_BODY\n`;
const KEYED = `---\ndescription: 只在关键词出现时提醒\nkeywords: [备份]\n---\nKEYED_BODY\n`;

test("只有根层 defaultopen 注入正文，深层正文与条目都不进上下文", async (t) => {
  const { config, index, refresh, scan, write } = await fixture(t);
  await write("root.md", ROOT);
  await write("deep/hidden.md", HIDDEN);
  await write("deep/keyed.md", KEYED);
  await refresh();

  assert.ok(
    index.match("备份").some((hit) => hit.includes("keyed.md")),
    "深层记忆仍可由关键词主动出现",
  );
  const snapshot = await scan();
  assert.deepEqual(snapshot.issues, []);
  assert.ok(!snapshot.text.includes("# 常驻记忆"));
  assert.ok(snapshot.text.includes(join(config.directory, "root.md")));
  assert.match(snapshot.text, /ROOT_BODY/);
  for (const text of ["DEEP_HIDDEN_BODY", "KEYED_BODY", "hidden.md"])
    assert.ok(!snapshot.text.includes(text), `${text} 不应进入默认上下文`);
});

test("深层写 defaultopen 不生效：正文不注入，并提醒由上层笔记指向", async (t) => {
  const { index, refresh, scan, write } = await fixture(t);
  await write("root.md", ROOT);
  await write(
    "deep/misused.md",
    `---\ndescription: 备份流程\ndefaultopen: true\n---\nDEEP_BODY\n`,
  );
  await refresh();
  assert.equal(index.issues.length, 1);
  assert.match(index.issues[0], /defaultopen 只对根层记忆生效/);
  assert.match(index.issues[0], /misused\.md/);

  const snapshot = await scan();
  assert.deepEqual(snapshot.issues, []);
  assert.ok(!snapshot.text.includes("DEEP_BODY"));
  assert.ok(!snapshot.text.includes("misused.md"));
  assert.match(snapshot.text, /ROOT_BODY/);
});

test("单篇默认展开全文超 8 KiB：照常注入并提醒", async (t) => {
  const { config, refresh, scan, write } = await fixture(t);
  await write(
    "root.md",
    `---\ndescription: 很长的画像\ndefaultopen: true\n---\n${"字".repeat(3000)}\n`,
  );
  await write("deep/hidden.md", HIDDEN);
  await refresh();
  const snapshot = await scan();
  assert.equal(snapshot.issues.length, 1);
  assert.match(
    snapshot.issues[0],
    /^root\.md：每轮注入全文 8\.8 KiB，超过单篇默认展开 8 KiB 上限/,
  );
  assert.ok(snapshot.text.includes(join(config.directory, "root.md")));
  assert.match(snapshot.text, /字{100}/);
  assert.ok(!snapshot.text.includes("DEEP_HIDDEN_BODY"));
});
