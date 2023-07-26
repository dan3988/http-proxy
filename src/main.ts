import chalk from "chalk";
import * as http from "node:http";
import * as https  from "node:https";
import * as util from "./util.js";
import Task, { TaskComplete } from "./task.js";

const port = 8081;
const server = http.createServer();
const targetUrl = new URL("http://127.0.0.1:8080");
const driver = targetUrl.protocol === "http:" ? http : https;
const endopt = { end: true };

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

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	const { url, headers, method = "GET" } = req;
	if (headers["host"])
		headers["host"] = targetUrl.host;

	const summary = `${method} ${url}`;
	const task = startTask(summary);
	const outgoing = driver.request(targetUrl, {
		path: url,
		method,
		headers
	});

	res.on("close", () => task.abort());

	outgoing.on("error", (err) => {
		const txt = `${err.name}: ${err.message}`;
		task.error(txt);
		res.writeHead(500, { "content-type": "text/plain" });
		res.write(txt);
		res.end();
	});
	
	outgoing.on("response", (incoming) => {
		const { headers, statusCode = -1, statusMessage } = incoming;
		const color = getColor(statusCode);

		task.update(`${summary} ${statusCode} - writing response`);

		res.writeHead(statusCode, statusMessage, headers);

		incoming.pipe(res, { end: false });
		incoming.on("end", () => {
			res.end();
			task.complete(color, `${summary} ${statusCode}`);
		})
	});

	req.pipe(outgoing, endopt);
}

server.on("listening", () => console.log("listening on %s", chalk.yellow(port)));
server.on("request", handleRequest);
server.listen(port, () => render());
