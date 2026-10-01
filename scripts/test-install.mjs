import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 从仓库直接安装（git 安装走的也是这条路径）：只依赖 package.json 的 pi.extensions，
// 不构建 dist。这里用 Pi 的 DefaultResourceLoader 加载仓库根目录本身。
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
assert.deepEqual(
  metadata.pi?.extensions,
  ["./src/index.ts"],
  "Pi 扩展入口必须是源码路径",
);

const sandbox = await mkdtemp(join(tmpdir(), "pi-memory-install-"));
try {
  const cwd = join(sandbox, "workspace");
  const agentDir = join(sandbox, "agent");
  await mkdir(cwd);
  await mkdir(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { DefaultResourceLoader } = await import(
    pathToFileURL(
      join(repo, "node_modules/@earendil-works/pi-coding-agent/dist/index.js"),
    ).href
  );
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [repo],
  });
  await loader.reload();
  const result = loader.getExtensions();
  assert.deepEqual(result.errors, []);
  const entry = join(repo, "src/index.ts");
  const extension = result.extensions.find(
    (item) => resolve(item.resolvedPath) === entry,
  );
  assert(
    extension,
    `未从仓库根目录加载到扩展：${result.extensions
      .map((item) => item.resolvedPath)
      .join(", ")}`,
  );
  assert(
    extension.commands.has("memory"),
    `命令未注册：${[...extension.commands.keys()].join(", ")}`,
  );
  console.log(
    JSON.stringify(
      {
        package: `${metadata.name}@${metadata.version}`,
        entry,
        commands: [...extension.commands.keys()],
        tools: [...extension.tools.keys()],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
