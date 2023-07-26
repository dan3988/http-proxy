import chalk from "chalk";
import * as http from "node:http";
import * as https  from "node:https";
import * as util from "./util.js";
import Task, { TaskComplete } from "./task.js";
import stream from "./stream-helper.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = hideBin(process.argv);
const parser = yargs(argv)
	.wrap(100)
	.alias("?", "help")
	.option("target", {
		desc: "The URL target of the proxy, or a number for a localhost port.",
		alias: "t",
		type: "string",
		demandOption: true
	})
	.option("port", {
		desc: "The port to start a server on.",
		alias: "p",
		type: "number",
		default: 80
	})

const { port, target } = parser.parseSync();
const server = http.createServer();
const targetUrl = (() => {
	if (isNaN(+target)) {
		const url = new URL(target);
		if (url.hostname === "localhost")
			url.hostname = "127.0.0.1";

		return url;
	} else {
		return new URL("http://127.0.0.1:" + target);
	}
})();

if (targetUrl.hostname === "127.0.0.1" && targetUrl.port == String(port)) {
	console.log("%s", chalk.red("Target url is the same as this server"));
	process.exit(-1);
}

const driver = targetUrl.protocol === "http:" ? http : https;
const statusColors: Record<string, util.ChalkColor> = {
	"1": "blue",
	"2": "green",
	"3": "yellow",
	"4": "magenta",
	"5": "red"
}

const loadingAnim = util.makeLoaing(" ", "=", 7);
const tasks: Task[] = [];
const signal = (() => {
	const ac = new AbortController();
	const cancel = AbortController.prototype.abort.bind(ac);
	process.on("SIGABRT", cancel);
	process.on("SIGBREAK", cancel);
	process.on("SIGINT", cancel);
	return ac.signal;
})();

let renderController = new AbortController();

function getColor(statusCode: number) {
	const key = Math.floor(statusCode / 100);
	return statusColors[key] ?? String;
}

async function render() {
	const out = process.stdout;
	out.cursorTo(0, 0);
	out.clearScreenDown();
	out.write(`listening on ${chalk.yellow(port)}\n`);

	let loadingIndex = 0;
	let timeout = -1;
	let messageCount = 0;

	while (!signal.aborted) {
		const signalled = await util.delay(timeout, renderController.signal);
		if (signalled)
			renderController = new AbortController();
	
		out.moveCursor(0, -messageCount);
		out.clearScreenDown();
		
		const completed: TaskComplete[] = [];
		for (let i = 0; i < tasks.length; ) {
			const task = tasks[i];
			if (task.isCompleted) {
				tasks.splice(i, 1);
				completed.push(task);
			} else {
				i++;
			}
		}

		for (const task of completed)
			out.write(`[${task.initiatedText}] [${(task.duration / 1000).toFixed(3).padStart(6, " ")}s] ${task.text}\n`);

		if ((messageCount = tasks.length) === 0) {
			loadingIndex = 0;
			timeout = -1;
			continue;
		}

		for (const task of tasks)
			out.write(`[${task.initiatedText}] [${loadingAnim[loadingIndex]}] ${task.text}\n`);
		
		loadingIndex = (loadingIndex + 1) % loadingAnim.length;
		timeout = 100;
	}

	out.write(chalk.red("Server stopped\n"));
}

function startTask(text: string) {
	const task = new Task(text);
	tasks.push(task);
	renderController.abort();
	return task;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	const { url, headers, method = "GET" } = req;
	if (headers["host"])
		headers["host"] = targetUrl.host;

	let closedHere = false;

	const summary = `${method} ${url}`;
	const task = startTask(summary);
	const outgoing = driver.request(targetUrl, {
		path: url,
		method,
		headers
	});

	res.on("close", () => closedHere || task.abort());

	try {
		await stream.pipe(req, outgoing, true, signal);
		const response = await stream.getResponse(outgoing, signal);
		const { headers, statusCode = -1, statusMessage } = response;
		task.update(`${summary} ${statusCode} - writing response`);
		res.writeHead(statusCode, statusMessage, headers);
		const color = getColor(statusCode);
		await stream.pipe(response, res, false, signal);
		task.complete(color, `${summary} ${statusCode}`);
	} catch (e) {
		task.error(e);
	} finally {
		closedHere = true;
		res.end();
	}
}

server.on("listening", () => console.log("listening on %s", chalk.yellow(port)));
server.on("request", handleRequest);
server.listen(port, () => render());
