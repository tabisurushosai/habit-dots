import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

describe("release readiness metadata", () => {
  it("keeps the extension manifest ready for MV3 submission", () => {
    const manifest = readJson("manifest.json");

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toEqual(expect.any(String));
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.description).toEqual(expect.any(String));
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.permissions).toEqual(["storage"]);
  });

  it("keeps Japanese and English locale key sets in parity", () => {
    const enMessages = readJson("_locales/en/messages.json");
    const jaMessages = readJson("_locales/ja/messages.json");

    expect(Object.keys(jaMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it("includes the local privacy policy file", () => {
    expect(existsSync("legal/PRIVACY.md")).toBe(true);
  });
});
