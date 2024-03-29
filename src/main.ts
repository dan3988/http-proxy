import http from "node:http";
import https  from "node:https";
import path from "node:path";
import fs from "node:fs";
import * as util from "./util.js";
import * as ws from "ws";
import Task, { TaskComplete } from "./task.js";
import stream from "./stream-helper.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import ConsoleString, { ConsoleColor, ConsoleWriter } from "./console-string.js";
import type { WriteStream } from "node:tty";

const argv = hideBin(process.argv);
const parser = yargs(argv)
	.wrap(100)
	.usage("Usage:\n  http-proxy [options]")
	.alias("?", "help")
	.option("target", {
		desc: "The URL target of the proxy, or a number for a localhost port.",
		alias: "t",
		type: "string",
		demandOption: true
	})
	.option("port", {
		desc: "The port for the server to listen to.",
		alias: "p",
		type: "number",
		defaultDescription: "8080"
	})
	.option("ip", {
		desc: "Show the IP address of requests in the console.",
		type: "boolean"
	})
	.option("active-only", {
		desc: "Don't log completed requests to the console",
		type: "boolean"
	})
	.option("secure", {
		desc: "Run the server in HTTPS mode. Can optionally be used to specify the base directory for --key and --cert.",
		alias: "S",
		type: "string",
		defaultDescription: "false"
	})
	.option("key", {
		desc: "The path to the private key for the HTTPS server",
		alias: "K",
		type: "string",
		defaultDescription: '"key.pem"',
		implies: [ "secure" ]
	})
	.option("cert", {
		desc: "The path to the public key for the HTTPS server",
		alias: "C",
		type: "string",
		defaultDescription: '"cert.pem"',
		implies: [ "secure" ]
	})

function exit(msg: string): never {
	console.log(ConsoleString(msg, "red"))
	process.exit(-1);
}

function tryReadFile(key: keyof ArgsOfType<string | undefined | null>, defaultValue: string, baseDir: string) {
	const value = args[key];
	const file = path.resolve(baseDir, value ?? defaultValue);
	if (!fs.existsSync(file))
		exit(`--${key}: file not found: "${file}".`);

	return fs.readFileSync(file);
}

type ArgsType = typeof parser extends import("yargs").Argv<infer A> ? A : never;
type ArgsOfType<T> = { [P in keyof ArgsType as ArgsType[P] extends T ? P : never]: ArgsType[P] };

const args = parser.parseSync();
const { port = 8080, target, ip, secure, ["active-only"]: activeOnly } = args;
const server = (() => {
	if (secure == null) {
		return http.createServer();
	} else {
		const baseDir = secure || ".";
		return https.createServer({ 
			key: tryReadFile("key", "key.pem", baseDir),
			cert: tryReadFile("cert", "cert.pem", baseDir)
		});
	}
})();

const wss = new ws.WebSocketServer({ server });
const targetUrl = isNaN(+target) ? new URL(target) : new URL("http://localhost:" + target);
if ((targetUrl.hostname === "127.0.0.1" || targetUrl.hostname === "localhost") && targetUrl.port == String(port))
	exit("Target url is the same as this server");

const driver = targetUrl.protocol === "http:" ? http : https;
const statusColors: Record<string, ConsoleColor> = {
	"1": "blueBright",
	"2": "greenBright",
	"3": "greenBright",
	"4": "redBright",
	"5": "redBright"
}

const loadingAnim = util.makeLoaing(" ", "=", 7);
const tasks: Task[] = [];
const signal = (() => {
	const ac = new AbortController();
	function cancel() {
		ac.abort();
		server.close();
	}

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

/**
 * Writer that truncates text if it's longer than the width of the console 
 */
class ConsoleLineWriter implements ConsoleWriter {
	readonly #out: WriteStream;
	#done: boolean;
	#len: number;

	constructor(out: WriteStream) {
		this.#out = out;
		this.#len = 0;
		this.#done = false;
	}

	writeEsc(value: string): void {
		this.#out.write(value);
	}

	write(value: string): void {
		if (this.#done)
			return;

		const out = this.#out;
		const remaining = out.columns - this.#len - 4;
		if (remaining >= value.length) {
			out.write(value);
			this.#len += value.length;
		} else {
			const txt = value.substring(0, remaining);
			out.write(txt);
			out.write("...");
			this.#len += remaining;
			this.#done = true;
		}
	}

	next() {
		this.#out.write("\n");
		this.#done = false;
		this.#len = 0;
	}
}

async function render() {
	const out = process.stdout;
	out.write(ConsoleString`listening on ${{ value: port, fg: "yellow" }}\n`);
	out.write("\nNo active requests.\n");
	let loadingIndex = 0;
	let timeout = -1;
	let messageCount = 0;

	while (!signal.aborted) {
		const signalled = await util.delay(timeout, renderController.signal);
		if (signalled)
			renderController = new AbortController();
	
		out.moveCursor(0, -messageCount - 2);
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

		const writer = new ConsoleLineWriter(out);

		if (!activeOnly) {
			for (const task of completed) {
				task.write(writer);
				writer.next();
			}
		}

		if ((messageCount = tasks.length) === 0) {
			loadingIndex = 0;
			timeout = -1;
			out.write("\nNo active requests.\n");
			continue;
		}
		
		out.write("\n");
		out.write(messageCount === 1 ? "1 active request." : `${messageCount} active requests.`);
		out.write("\n");

		for (const task of tasks) {
			task.write(writer);
			writer.next();
		}
		
		loadingIndex = (loadingIndex + 1) % loadingAnim.length;
		timeout = 100;
	}

	out.write(ConsoleString("Server stopped\n", "red"));
}

function startTask() {
	const task = new Task(loadingAnim);
	task.addField({ field: "initiated", format: "[%s]" });
	task.addField({ field: "progress", format: "[%s]" });
	tasks.push(task);
	renderController.abort();
	return task;
}

function fixHeaders(headers: http.IncomingHttpHeaders) {
	if (headers["host"])
		headers["host"] = targetUrl.host;

	if (headers["origin"])
		headers["origin"] = targetUrl.host;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	const { url, headers, method = "GET" } = req;
	fixHeaders(headers);
	let closedHere = false;

	const task = startTask();
	const ac =  new AbortController();
	const { signal } = ac;
	const outgoing = driver.request(targetUrl, {
		path: url,
		method,
		headers
	});

	if (ip) {
		const addr = req.socket.remoteAddress!;
		task.addField({ value: addr, color: "magentaBright" });
	}

	task.addField({ value: `${method} "${url}"`, color: "blueBright" });
	let status = task.addField({ value: "processing request" });

	function complete(value: util.StringLike, color?: ConsoleColor) {
		update(value, color);
		task.complete();
	}

	function update(value: util.StringLike, color?: ConsoleColor) {
		status = status.replace({ value, color });
	}

	res.on("close", () => {
		if (!closedHere) {
			ac.abort();
			complete("Request aborted by client", "blackBright");
		}
	});

	try {
		await stream.pipe(req, outgoing, true, signal);
		const response = await stream.getResponse(outgoing, signal);
		const { headers, statusCode = -1, statusMessage } = response;
		update(`${statusCode} - writing response`, "greenBright");
		res.writeHead(statusCode, statusMessage, headers);
		const color = getColor(statusCode);
		await stream.pipe(response, res, false, signal);
		complete(statusCode, color);
	} catch (e) {
		complete(String(e), "redBright");
	} finally {
		closedHere = true;
		res.end();
	}
}

function onSocketOpened(socket: ws.WebSocket, req: http.IncomingMessage) {
	delete req.headers["sec-websocket-key"];
	fixHeaders(req.headers);
	const task = startTask();
	const url = new URL(req.url!, targetUrl);
	url.protocol = url.protocol.replace("http", "ws");
	const queue: { data?: ws.RawData, binary: boolean }[] = [];
	const target = new ws.WebSocket(url, {
		headers: req.headers
	});

	if (ip) {
		const addr = req.socket.remoteAddress!;
		task.addField({ value: addr, color: "magentaBright" });
	}

	task.addField({ value: `WS "${req.url}"`, color: "blueBright" });
	let status = task.addField({ value: "processing request" });
	let serverClosed = false;

	function complete(value: util.StringLike, color?: ConsoleColor) {
		update(value, color);
		task.complete();
	}

	function update(value: util.StringLike, color?: ConsoleColor) {
		status = status.replace({ value, color });
	}

	function onAbort() {
		target.close();
		complete("socket closed by client", "blackBright");
	}

	signal.addEventListener("abort", onAbort);

	socket.on("close", () => {
		signal.removeEventListener("abort", onAbort);
		serverClosed || onAbort();
	});

	socket.on("message", (data, binary) => {
		if (target.readyState === ws.WebSocket.OPEN) {
			target.send(data, { binary });
		} else {
			queue.push({ data, binary });
		}
	});

	target.on("error", e => {
		complete(String(e), "redBright");
		socket.close(1011, String(e));
	});

	target.on("message", (data, binary) => {
		socket.send(data, { binary })
	});

	target.on("open", () => {
		update("socket open", "green");
		let message;
		while ((message = queue.shift())) {
			const { data } = message;
			delete message.data;
			socket.send(data!, message);
		}
	});

	target.on("close", (code, reason) => {
		serverClosed = true;
		if (code === 1005) {
			complete("CLOSE_ABNORMAL", "redBright");
			socket.close(1011, "CLOSED_NO_STATUS");
		} else if (code === 1006) {
			complete("CLOSE_ABNORMAL", "redBright");
			socket.close(1011, "CLOSE_ABNORMAL");
		} else {
			complete("socket closed by server", "blackBright");
			socket.close(code, reason);
		}
	})
}

wss.on("connection", onSocketOpened);

server.on("request", handleRequest);
server.listen(port, () => render());
