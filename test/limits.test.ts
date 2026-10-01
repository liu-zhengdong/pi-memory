import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planResidents,
  RESIDENT_ENTRY_LIMIT,
  RESIDENT_FULL_BYTES_LIMIT,
} from "../src/limits.ts";

test("常驻条目在上限内全部登记，且不产生提醒", () => {
  const names = Array.from({ length: RESIDENT_ENTRY_LIMIT }, (_, i) => `m${i}.md`);
  const plan = planResidents(names, []);
  assert.deepEqual(plan, { take: RESIDENT_ENTRY_LIMIT, omitted: 0, issues: [] });
  assert.deepEqual(planResidents([], []), { take: 0, omitted: 0, issues: [] });
});

test("常驻条目超上限时登记前 200 条，并列出未登记项", () => {
  const names = Array.from({ length: 401 }, (_, i) => `m${i}.md`);
  const plan = planResidents(names, []);
  assert.equal(plan.take, 200);
  assert.equal(plan.omitted, 201);
  assert.equal(plan.issues.length, 1);
  assert.match(plan.issues[0], /深层常驻记忆超过上限 200 条/);
  assert.match(
    plan.issues[0],
    /已登记 200 条，201 条未登记（m200\.md、m201\.md、m202\.md、m203\.md、m204\.md 等）/,
  );
  const few = planResidents(Array.from({ length: 202 }, (_, i) => `n${i}.md`), []);
  assert.match(few.issues[0], /2 条未登记（n200\.md、n201\.md）/);
  assert.doesNotMatch(few.issues[0], /等/);
});

test("单篇常驻全文的上限边界：正好 8 KiB 不提醒，多 1 字节提醒", () => {
  const boundary = [
    { name: "A.md", bytes: RESIDENT_FULL_BYTES_LIMIT },
    { name: "B.md", bytes: RESIDENT_FULL_BYTES_LIMIT - 1 },
  ];
  assert.deepEqual(planResidents([], boundary).issues, []);
  const issues = planResidents([], [...boundary, { name: "C.md", bytes: RESIDENT_FULL_BYTES_LIMIT + 1 }])
    .issues;
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^C\.md：每轮注入全文 8\.0 KiB，超过单篇常驻 8 KiB 上限/);
  assert.match(issues[0], /请拆分，或改为按需阅读。/);
});

test("多篇超限全文逐条提醒，顺序与输入一致", () => {
  const issues = planResidents([], [
    { name: "大.md", bytes: 25_000 },
    { name: "小.md", bytes: 10 },
    { name: "巨.md", bytes: 300_000 },
  ]).issues;
  assert.equal(issues.length, 2);
  assert.match(issues[0], /^大\.md：每轮注入全文 24\.4 KiB/);
  assert.match(issues[1], /^巨\.md：每轮注入全文 293\.0 KiB/);
});
