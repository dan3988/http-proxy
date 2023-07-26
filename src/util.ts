type ChalkColorBase = "red" | "green" | "blue" | "yellow" | "magenta" | "white" | "black";
type ChalkColorAll = ChalkColorBase | `${ChalkColorBase}Bright`;
type Prefix<Prefix extends string, Name extends string> = `${Prefix}${Capitalize<Name>}`;

export type ChalkColor = "gray" | ChalkColorAll | Prefix<"bg", ChalkColorAll>

export function delay(ms: number, signal?: AbortSignal): Promise<boolean> {
	if ((ms = Number(ms)) === 0)
		return Promise.resolve(true);

	if (!signal)
		return new Promise(r => setTimeout(r, ms, false));

	if (ms < 0) {
		return new Promise(r => signal.addEventListener("abort", () => r(true), { once: true }));
	} else {
		return new Promise(r => {
			const timeout = setTimeout(() => {
				signal.removeEventListener("abort", handler);
				r(false);
			}, ms);
			const handler = function () {
				clearTimeout(timeout);
				r(true);
			};
			signal.addEventListener("abort", handler, { once: true });
		});
	}
}

export function makeLoaing(ws: string, char: string, length: number): string[] {
	const parts = Array(length).fill(ws);
	const result = Array<string>(length * 2);
	result[0] = parts.join("");
	let count = 0;
	for (let i = 0; i < length; i++) {
		parts[i] = char;
		result[++count] = parts.join("");
	}

	length--;
	for (let i = 0; i < length; i++) {
		parts[i] = ws;
		result[++count] = parts.join("");
	}

	return result;
}