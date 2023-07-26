import path from "node:path";

/**
 * Custom error reporter for
 * @type {import("rollup").WarningHandlerWithDefault}
 */
export function onwarn(warning, handler) {
	if (warning.plugin !== "typescript" || !warning.pluginCode)
		return handler(warning);

	const { file, column, line } = warning.loc ?? Object.prototype;
	const relative = path.relative(".", file);
	//remove the "@rollup/plugin-typescript TS####" prefix
	const pluginMessage = warning.message.substring(28 + warning.pluginCode.length);
	console.log("\u001b[31m%s\u001b[39m \u001b[34m%s:%s:%s\u001b[39m: %s", warning.pluginCode, relative, line, column, pluginMessage);
	console.log(warning.frame);
}

export default onwarn;