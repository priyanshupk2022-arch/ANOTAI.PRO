import test from "node:test";
import assert from "node:assert";
import { safeParseJson } from "./json.server.ts";

test("safeParseJson - valid JSON object", () => {
  const input = '{"key": "value"}';
  const result = safeParseJson(input, {});
  assert.deepStrictEqual(result, { key: "value" });
});

test("safeParseJson - valid JSON array", () => {
  const input = '["a", "b"]';
  const result = safeParseJson(input, []);
  assert.deepStrictEqual(result, ["a", "b"]);
});

test("safeParseJson - JSON inside markdown block", () => {
  const input = "```json\n" + '{"key": "value"}' + "\n```";
  const result = safeParseJson(input, {});
  assert.deepStrictEqual(result, { key: "value" });
});

test("safeParseJson - JSON with surrounding text", () => {
  const input = 'Here is your JSON: {"key": "value"} Hope this helps!';
  const result = safeParseJson(input, {});
  assert.deepStrictEqual(result, { key: "value" });
});

test("safeParseJson - invalid JSON returns fallback", () => {
  const input = '{"key": "value"'; // Missing closing brace
  const fallback = { error: true };
  const result = safeParseJson(input, fallback);
  assert.deepStrictEqual(result, fallback);
});

test("safeParseJson - empty input returns fallback", () => {
  const input = "";
  const fallback = ["fallback"];
  const result = safeParseJson(input, fallback);
  assert.deepStrictEqual(result, fallback);
});

test("safeParseJson - AI conversational filler with array", () => {
  const input = 'I have extracted the keywords for you: ["keyword1", "keyword2"]';
  const result = safeParseJson(input, []);
  assert.deepStrictEqual(result, ["keyword1", "keyword2"]);
});
