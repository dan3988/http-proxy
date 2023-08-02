import ConsoleString, { ConsoleColor, ConsoleWriter } from "./console-string.js";
import type { StringLike } from "./util.js";

export interface TaskFactory {
	start(text: string): Task;
}

export interface TaskBase {
	readonly initiated: number;
	readonly duration: null | number;
	readonly isCompleted: boolean;

	abort(): void;
	update(...args: ColorableArgs): void;
	complete(...args: ColorableArgs): void;
	error(e: any): void;

	write(writer: ConsoleWriter): void;
}

export interface TaskIncomplete extends TaskBase {
	readonly isCompleted: false;
	readonly duration: null;
}

export interface TaskComplete extends TaskBase {
	readonly isCompleted: true;
	readonly duration: number;
}

export type Task = TaskIncomplete | TaskComplete;

export interface TaskConstructor {
	readonly prototype: Task;
	new(anim: string[], prefix: string, color?: ConsoleColor): Task;
}

type ColoredArgs = readonly [color: ConsoleColor, text: StringLike];
type ColorableArgs = readonly [text: StringLike] | ColoredArgs;

function unwrapArgs(fallback: ConsoleColor, args: ColorableArgs): ColoredArgs {
	return args.length === 2 ? args : [fallback, args[0]];
}

class TaskImpl implements TaskBase {
	readonly #loading: string[];
	#loadingIndex: number;
	readonly #initiated: number;
	readonly #initiatedText: string;
	readonly #text: ConsoleString[];
	#completed: null | number;

	get initiated() {
		return this.#initiated;
	}

	get initiatedText() {
		return this.#initiatedText;
	}

	get duration() {
		return this.#completed && (this.#completed - this.#initiated);
	}

	get isCompleted() {
		return this.#completed != null;
	}

	constructor(loading: string[], prefix: string, color?: ConsoleColor) {
		const now = Date.now();
		const first =  new ConsoleString(prefix, color);
		this.#loading = loading;
		this.#loadingIndex = 0;
		this.#text = [first];
		this.#initiated = now;
		this.#initiatedText = new Date(now).toISOString().substring(11, 23);
		this.#completed = null;
	}

	#setText(color: ConsoleColor, text: StringLike) {
		this.#text[1] = new ConsoleString(text, color);
	}

	abort() {
		if (this.#completed == null) {
			this.#setText("redBright", "Request aborted");
			this.#completed = Date.now();
		}
	}

	update(...args: ColorableArgs): void {
		if (this.#completed != null)
			return;
			
		const [color, text] = unwrapArgs("green", args);
		this.#setText(color, text);
	}

	complete(...args: ColorableArgs) {
		if (this.#completed != null)
			return;

		const [color, text] = unwrapArgs("green", args);
		this.#setText(color, text);
		this.#completed = Date.now();
	}

	error(e: any) {
		if (this.#completed != null)
			return;

		this.#setText("red", e);
		this.#completed = Date.now();
	}

	write(writer: ConsoleWriter): void {
		writer.write("[");
		writer.write(this.initiatedText);
		writer.write("] [");

		const text = this.#text;
		const dur = this.duration;
		if (dur == null) {
			const anim = this.#loading;
			const index = this.#loadingIndex;
			this.#loadingIndex = (index + 1) % anim.length;
			writer.write(anim[index]);
		} else {
			const txt = (dur / 1000).toFixed(3).padStart(6, " ");
			writer.write(txt);
			writer.write("s");
		}

		writer.write("]");

		for (let i = 0; i < text.length; i++) {
			writer.write(" ");
			text[i].writeTo(writer);
		}
	}
}

export var Task: TaskConstructor = TaskImpl as any;
export default Task;