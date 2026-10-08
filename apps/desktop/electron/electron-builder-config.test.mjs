import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import {
  packagedSidecarMetadataNames,
  packagedSidecarNames,
} from "../scripts/redrob-code-release.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function readConfig(name) {
  return YAML.parse(await readFile(path.resolve(dirname, "..", name), "utf8"));
}

describe("Electron distribution configs", () => {
  it("uses a stable Linux desktop identity and ships integration icons", async () => {
    const packageMetadata = JSON.parse(
      await readFile(path.resolve(dirname, "..", "package.json"), "utf8"),
    );
    const config = await readConfig("electron-builder.base.yml");
    assert.equal(packageMetadata.desktopName, "io.redrob.work");
    assert.equal(config.npmRebuild, false);
    assert.deepEqual(config.files.at(-1), {
      from: ".electron-runtime/node_modules",
      to: "node_modules",
    });
    assert.equal(config.linux.syncDesktopName, true);
    assert.equal(config.linux.icon, "resources/icons/linux");
    assert.deepEqual(config.linux.extraResources[0], {
      from: "resources/icons/linux",
      to: "icons/linux",
      filter: ["*.png"],
    });
  });

  it("ships the pinned privacy model outside app.asar, and only this platform's onnxruntime binaries", async () => {
    const config = await readConfig("electron-builder.base.yml");
    const model = config.extraResources.find((entry) => entry.to === "privacy-model");
    assert.equal(model.from, "resources/privacy-model");
    assert.ok(model.filter.includes("manifest.json") && model.filter.includes("*.onnx") && model.filter.includes("tokenizer.json"));
    const drop = config.files.indexOf("!node_modules/onnxruntime-node/bin/**");
    const keep = config.files.indexOf("node_modules/onnxruntime-node/bin/napi-v6/${platform}/${arch}/**");
    assert.ok(drop !== -1 && keep > drop, "the platform's own binaries are re-included after all are dropped");
    assert.ok(config.asarUnpack.includes("node_modules/onnxruntime-node/bin/**"));
    // Live co-working's native binding is loaded with dlopen too.
    assert.ok(config.asarUnpack.includes("node_modules/@number0/**"));
    const packageMetadata = JSON.parse(await readFile(path.resolve(dirname, "..", "package.json"), "utf8"));
    const serverMetadata = JSON.parse(await readFile(path.resolve(dirname, "..", "..", "server", "package.json"), "utf8"));
    assert.equal(packageMetadata.dependencies["onnxruntime-node"], serverMetadata.dependencies["onnxruntime-node"]);
  });

  it("keeps the public artifact and protocol unchanged", async () => {
    const config = await readConfig("electron-builder.yml");
    assert.equal(config.extends, "./electron-builder.base.yml");
    assert.equal(config.appId, "io.redrob.work");
    assert.equal(config.productName, "Redrob Cowork");
    assert.equal(config.protocols[0].schemes[0], "redrob");
    assert.equal(config.artifactName, "redrob-${os}-${arch}-${version}.${ext}");
  });

  /**
   * electron-builder filters the sidecar directory by exact filename, so a name
   * the sidecar writer produces and this filter omits is a file that silently
   * never reaches the package: the build stays green and the installed app
   * reports no engine. This ties the two together per platform.
   */
  it("ships every sidecar filename the writer produces, per platform", async () => {
    const config = await readConfig("electron-builder.base.yml");

    for (const [platform, triples] of Object.entries({
      win: ["aarch64-pc-windows-msvc", "x86_64-pc-windows-msvc"],
      mac: ["aarch64-apple-darwin", "x86_64-apple-darwin"],
      linux: ["aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu"],
    })) {
      const entry = config[platform].extraResources.find(resource => resource.to === "sidecars");
      assert.ok(entry, `${platform} packages no sidecars directory`);

      const written = new Set();
      for (const targetTriple of triples) {
        const engine = packagedSidecarNames({ targetTriple });
        const metadata = packagedSidecarMetadataNames({ targetTriple });
        written.add(engine.alias).add(engine.target);
        written.add(metadata.alias).add(metadata.target);
      }

      for (const name of written) {
        assert.ok(
          entry.filter.includes(name),
          `${platform} writes ${name} into resources/sidecars but never packages it`,
        );
      }
      // And nothing is filtered in that no writer produces, which would make
      // afterPack demand a file that is never there.
      assert.deepEqual([...entry.filter].sort(), [...written].sort(), `${platform} filter drifted`);
    }
  });
});
