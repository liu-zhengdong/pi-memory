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
  const directory = await mkdtemp(join(tmpdir(), "pi-memory-residents-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { directory: join(directory, "vault"), maxContextBytes };
  await mkdir(join(config.directory, "deep"), { recursive: true });
  const loader = new MemoryLoader();
  const index = new KeywordIndex();
  return {
    directory,
    config,
    loader,
    index,
    refresh: async () => index.refresh(await loader.scan(config)),
    scan: () => loader.scan(config, [], index.residents),
    write: (relative: string, text: string) =>
      writeFile(join(config.directory, relative), text),
  };
}

const ROOT = `---\ndescription: 用户画像\ndefaultopen: true\n---\nROOT_BODY\n`;
const OPEN_ONE = `---\ndescription: 排版约定\npurpose: 设置字体时参考\nkeywords: [字体]\ndefaultopen: true\n---\nDEEP_ONE_BODY\n`;
const OPEN_TWO = `---\ndescription: 备份流程\ndefaultopen: true\n---\nDEEP_TWO_BODY\n`;
const QUIET = `---\ndescription: 只在关键词出现时提醒\nkeywords: [备份]\n---\nQUIET_BODY\n`;

test("深层 defaultopen 记忆登记为常驻指针：每轮有路径与定位，正文不进上下文", async (t) => {
  const { config, index, refresh, scan, write } = await fixture(t);
  await write("root.md", ROOT);
  await write("deep/one.md", OPEN_ONE);
  await write("deep/two.md", OPEN_TWO);
  await write("deep/quiet.md", QUIET);
  await refresh();

  assert.deepEqual(
    index.residents.map((note) => note.name).sort(),
    ["one.md", "two.md"],
  );
  assert.ok(
    index.match("备份流程").some((hit) => hit.includes("quiet.md")),
    "关键词索引仍能命中未常驻的深层记忆",
  );
  assert.ok(index.match("字体").some((hit) => hit.includes("one.md")));

  const snapshot = await scan();
  assert.equal(snapshot.residentCount, 2);
  assert.deepEqual(snapshot.issues, []);
  assert.match(snapshot.text, /# 常驻记忆\n\n以下记忆每轮提供，正文按路径按需读取。/);
  assert.ok(snapshot.text.includes(join(config.directory, "deep", "one.md")));
  assert.ok(snapshot.text.includes(join(config.directory, "deep", "two.md")));
  assert.match(snapshot.text, /设置字体时参考/);
  assert.match(snapshot.text, /备份流程/);
  for (const body of ["DEEP_ONE_BODY", "DEEP_TWO_BODY", "QUIET_BODY"])
    assert.ok(!snapshot.text.includes(body), `${body} 不应进入默认上下文`);
  assert.match(snapshot.text, /ROOT_BODY/);
  assert.deepEqual(snapshot.residentPaths, [
    join(config.directory, "deep", "one.md"),
    join(config.directory, "deep", "two.md"),
  ]);
});

test("常驻指针每轮重复出现，不再依赖关键词命中", async (t) => {
  const { index, refresh, scan, write } = await fixture(t);
  await write("root.md", ROOT);
  await write("deep/one.md", OPEN_ONE);
  await refresh();
  const first = await scan();
  const second = await scan();
  assert.equal(first.text, second.text);
  assert.match(second.text, /one\.md/);
});

test("常驻条目超上限：登记前 200 条，未登记项写进提醒", async (t) => {
  const { index, refresh, scan, write } = await fixture(t);
  await write("root.md", ROOT);
  for (let i = 0; i < 205; i++)
    await write(
      `deep/m${String(i).padStart(3, "0")}.md`,
      `---\ndescription: 第 ${i} 篇\ndefaultopen: true\n---\nBODY_${i}\n`,
    );
  await refresh();
  assert.equal(index.residents.length, 205);
  const snapshot = await scan();
  assert.equal(snapshot.residentCount, 200);
  assert.equal(snapshot.issues.length, 1);
  assert.match(snapshot.issues[0], /深层常驻记忆超过上限 200 条/);
  assert.match(snapshot.issues[0], /5 条未登记（m200\.md、m201\.md、m202\.md、m203\.md、m204\.md）/);
  assert.doesNotMatch(snapshot.issues[0], /等/);
  assert.match(snapshot.text, /m199\.md/);
});

test("单篇常驻全文超 8 KiB：照常注入并提醒", async (t) => {
  const { config, index, refresh, scan, write } = await fixture(t);
  await write(
    "root.md",
    `---\ndescription: 很长的画像\ndefaultopen: true\n---\n${"字".repeat(3000)}\n`,
  );
  await write("deep/one.md", OPEN_ONE);
  await refresh();
  const snapshot = await scan();
  assert.equal(snapshot.issues.length, 1);
  assert.match(snapshot.issues[0], /^root\.md：每轮注入全文 8\.8 KiB，超过单篇常驻 8 KiB 上限/);
  assert.ok(snapshot.text.includes(join(config.directory, "root.md")));
  assert.match(snapshot.text, /字{100}/);
  assert.equal(snapshot.residentCount, 1);
  assert.ok(snapshot.text.includes(join(config.directory, "deep", "one.md")));
});

test("常驻文本超出剩余预算：整块不注入并明确报告，不截断", async (t) => {
  const { config, index, refresh, scan, write } = await fixture(t, 1024);
  for (let i = 0; i < 20; i++)
    await write(
      `deep/m${i}.md`,
      `---\ndescription: ${"长描述".repeat(60)}\ndefaultopen: true\n---\nBODY_${i}\n`,
    );
  await refresh();
  const snapshot = await scan();
  assert.equal(snapshot.residentCount, 20);
  assert.ok(!snapshot.text.includes("# 常驻记忆"));
  assert.ok(
    snapshot.issues.some((issue) =>
      /常驻记忆共 \d+\.\d KiB，超过剩余默认上下文 1 KiB 预算，本轮未注入/.test(issue),
    ),
    snapshot.issues.join(" | "),
  );
  assert.ok(!snapshot.text.includes("BODY_"));
});
