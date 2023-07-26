import type * as ns from "stream";
import type * as http from "http"

export namespace stream {
	export function write(output: ns.Writable, data: string | Uint8Array, end: boolean) {
		return new Promise<void>((resolve, reject) => {
			output.write(data, e => {
				if (e) return reject(e);
				end ? output.end(resolve) : resolve();
			});
		})
	}

	export function pipe(input: ns.Readable, output: ns.Writable, end: boolean, signal?: AbortSignal) {
		if (!input.readable)
			return end ? close(output) : Promise.resolve();
	
		input.pause();
	
		return new Promise<void>((resolve, reject) => {
			if (signal != null)
				[resolve, reject] = abortable(signal, resolve, reject, () => {
					reject(new Error("Request aborted"));
					input.destroy();
				});

			input.on("data", c => output.write(c));
			input.on("error", reject);
			input.on("end", end ? () => output.end(resolve) : resolve);
			input.resume();
		});
	}

	export function close(input: ns.Writable) {
		return new Promise<void>(r => input.end(r));
	}

	export function respond(res: http.ServerResponse, code: number, message: string, contentType: string = "text/plain") {
		return new Promise<void>((resolve, reject) => {
			res.writeHead(code, { "content-type": contentType });
			res.write(message, e => e ? reject(e) : resolve());
		});
	}
		
	export function getResponse(req: http.ClientRequest, signal?: AbortSignal) {
		return new Promise<http.IncomingMessage>((resolve, reject) => {
			if (signal != null)
				[resolve, reject] = abortable(signal, resolve, reject, () => {
					reject(new Error("Request aborted"));
					req.destroy();
				});

			req.on("error", reject);
			req.on("response", resolve);
			req.end();
		});
	}
}

function abortable<T>(signal: AbortSignal, resolve: Resolver<T>, reject: Rejector, onAbort: Action, ): ResolveReject<T> {
	signal.addEventListener("abort", onAbort);

	return [
		resolve = finish.bind(signal, onAbort, resolve as any),
		reject = finish.bind(signal, onAbort, reject)
	]
}

function finish<T>(this: AbortSignal, handler: () => any, fn: (arg: T) => any, arg: T) {
	this.removeEventListener("abort", handler);
	fn(arg);
}

export default stream;