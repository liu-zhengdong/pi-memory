import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkExpandedFull,
  EXPANDED_FULL_BYTES_LIMIT,
} from "../src/limits.ts";

test("没有默认展开的记忆时不产生提醒", () => {
  assert.deepEqual(checkExpandedFull([]), []);
});

test("单篇默认展开全文的上限边界：正好 8 KiB 不提醒，多 1 字节提醒", () => {
  const boundary = [
    { name: "A.md", bytes: EXPANDED_FULL_BYTES_LIMIT },
    { name: "B.md", bytes: EXPANDED_FULL_BYTES_LIMIT - 1 },
  ];
  assert.deepEqual(checkExpandedFull(boundary), []);
  const issues = checkExpandedFull([
    ...boundary,
    { name: "C.md", bytes: EXPANDED_FULL_BYTES_LIMIT + 1 },
  ]);
  assert.equal(issues.length, 1);
  assert.match(
    issues[0],
    /^C\.md：每轮注入全文 8\.0 KiB，超过单篇默认展开 8 KiB 上限/,
  );
  assert.match(issues[0], /请拆分，或改为按需阅读。/);
});

test("多篇超限全文逐条提醒，顺序与输入一致", () => {
  const issues = checkExpandedFull([
    { name: "大.md", bytes: 25_000 },
    { name: "小.md", bytes: 10 },
    { name: "巨.md", bytes: 300_000 },
  ]);
  assert.equal(issues.length, 2);
  assert.match(issues[0], /^大\.md：每轮注入全文 24\.4 KiB/);
  assert.match(issues[1], /^巨\.md：每轮注入全文 293\.0 KiB/);
});
