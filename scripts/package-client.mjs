import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const releaseRoot = path.join(repositoryRoot, "release");
const packageName = "BM-FontMixer";
const packageDirectory = path.join(releaseRoot, packageName);
const zipPath = path.join(releaseRoot, `${packageName}.zip`);

rmSync(packageDirectory, { recursive: true, force: true });
rmSync(zipPath, { force: true });

mkdirSync(path.join(packageDirectory, "dist"), { recursive: true });
mkdirSync(path.join(packageDirectory, "src"), { recursive: true });

copyFileSync(path.join(repositoryRoot, "manifest.json"), path.join(packageDirectory, "manifest.json"));
copyFileSync(path.join(repositoryRoot, "dist", "code.js"), path.join(packageDirectory, "dist", "code.js"));
copyFileSync(path.join(repositoryRoot, "src", "ui.html"), path.join(packageDirectory, "src", "ui.html"));
copyFileSync(path.join(repositoryRoot, "CLIENT-GUIDE.md"), path.join(packageDirectory, "START-HERE.md"));

execFileSync("zip", ["-q", "-r", zipPath, packageName], {
  cwd: releaseRoot,
  stdio: "inherit"
});

console.log(`Client package created: ${zipPath}`);
