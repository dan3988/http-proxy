import { StringLike } from "./util.js";

type ConsoleColorBase = "red" | "magenta" | "blue" | "cyan" | "green" | "yellow" | "white" | "black";

export type ConsoleColor = ConsoleColorBase | `${ConsoleColorBase}Bright`;

const closeBg = "\u001b[49m";
const closeFg = "\u001b[39m";

const openCodes: Record<ConsoleColor, [fg: string, bg: string]> = {
	"black":			[ "\u001b[30m", "\u001b[40m" ],
	"blackBright":		[ "\u001b[90m", "\u001b[100m" ],
	"white":			[ "\u001b[37m", "\u001b[47m" ],
	"whiteBright":		[ "\u001b[97m", "\u001b[107m" ],
	"red":				[ "\u001b[31m", "\u001b[41m" ],
	"redBright":		[ "\u001b[91m", "\u001b[101m" ],
	"magenta":			[ "\u001b[35m", "\u001b[45m" ],
	"magentaBright":	[ "\u001b[95m", "\u001b[105m" ],
	"blue":				[ "\u001b[34m", "\u001b[44m" ],
	"blueBright":		[ "\u001b[94m", "\u001b[104m" ],
	"cyan":				[ "\u001b[36m", "\u001b[46m" ],
	"cyanBright":		[ "\u001b[96m", "\u001b[106m" ],
	"green":			[ "\u001b[32m", "\u001b[42m" ],
	"greenBright":		[ "\u001b[92m", "\u001b[102m" ],
	"yellow":			[ "\u001b[33m", "\u001b[43m" ],
	"yellowBright":		[ "\u001b[93m", "\u001b[103m" ]
};

export interface ConsoleWriter {
	writeEsc(value: string): void;
	write(value: string): void;
}

export class ConsoleString {
	static readonly EMPTY = new this("");
	static readonly SPACE = new this(" ");

	readonly #text: string;
	readonly #open: string;
	readonly #close: string;

	constructor(text: StringLike, fg?: ConsoleColor, bg?: ConsoleColor) {
		let open = "";
		let close = "";
		if (fg) {
			const p = openCodes[fg];
			open += p[0];
			close += closeFg;
		}
		if (bg) {
			const p = openCodes[bg];
			open += p[1];
			close += closeBg;
		}

		this.#text = String(text);
		this.#open = open;
		this.#close = close;
	}

	writeTo(output: ConsoleWriter) {
		output.writeEsc(this.#open);
		output.write(this.#text);
		output.writeEsc(this.#close);
	}
}

export default ConsoleString;