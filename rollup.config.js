import * as fs from "node:fs";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve"
import { defineConfig } from "rollup";
import onwarn from "./rollup-log.js";

const production = !process.env.ROLLUP_WATCH;
const buildDir = "lib";
const r = { recursive: true };

if (fs.existsSync(buildDir))
	fs.rmSync(buildDir, r);

export default defineConfig({
	onwarn,
	input: "src/main.ts",
	output: {
		dir: buildDir,
		format: "esm",
		sourcemap: true
	},
	plugins: [
		typescript(),
		commonjs(),
		resolve({
			browser: false,
			resolveOnly: () => false
		}),
		production && terser()
	]
});