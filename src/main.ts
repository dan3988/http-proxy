import chalk, { ChalkInstance } from "chalk";
import * as http from "node:http";
import * as https  from "node:https";

const port = 8081;
const server = http.createServer();
const targetUrl = new URL("http://127.0.0.1:8080");
const driver = targetUrl.protocol === "http:" ? http : https;
const endopt = { end: true };

const statusFormatters: Record<string, ChalkInstance> = {
	"1": chalk.blue,
	"2": chalk.green,
	"3": chalk.yellow,
	"4": chalk.magenta,
	"5": chalk.red
}

function getFormatter(statusCode: number) {
	const key = Math.floor(statusCode / 100);
	return statusFormatters[key] ?? String;
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
	const start = Date.now();
	const { url, headers, method } = req;
	if (headers["host"])
		headers["host"] = targetUrl.host;

	const prefix = `${chalk.yellow(method)} ${url}`;

	console.log(prefix);

	const outgoing = driver.request(targetUrl, {
		path: url,
		method,
		headers
	});

	outgoing.on("error", (err) => {
		const txt = `${err.name}: ${err.message}`;
		console.error("%s %s%s", prefix, chalk.red("Request error - "), txt);
		res.writeHead(500, { "content-type": "text/plain" });
		res.write(txt);
		res.end();
	});
	
	outgoing.on("response", (incoming) => {
		const dur = Date.now() - start;
		const { headers, statusCode = -1, statusMessage } = incoming;
		const formatter = getFormatter(statusCode);
		console.log("%s %s (%ss)", prefix, formatter(statusCode), chalk.red(dur / 1000));
		res.writeHead(statusCode, statusMessage, headers);
		incoming.pipe(res, endopt);
	});

	req.pipe(outgoing, endopt);
	req.on("close", () => req.destroy());
}

server.on("listening", () => console.log("listening on %s", chalk.yellow(port)));
server.on("request", handleRequest);
server.listen(port);
