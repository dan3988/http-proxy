import type { ChalkColor } from "./util.js";
import chalk from "chalk";

export interface TaskFactory {
	start(text: string): Task;
}

export interface TaskBase {
	readonly initiated: number;
	readonly initiatedText: string;
	readonly text: string;
	readonly duration: null | number;
	readonly isCompleted: boolean;
	readonly abortSignal: AbortSignal;

	abort(): void;
	update(...args: ColorableArgs): void;
	complete(...args: ColorableArgs): void;
	error(e: any): void;
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
	new(text: string): Task;
}

type ColoredArgs = readonly [color: ChalkColor, text: string];
type ColorableArgs = readonly [text: string] | ColoredArgs;

function unwrapArgs(fallback: ChalkColor, args: ColorableArgs): ColoredArgs {
	return args.length === 2 ? args : [fallback, args[0]];
}

class TaskImpl implements TaskBase {
	#text: string;
	#controller: AbortController;
	#initiated: number;
	#initiatedText: string;
	#completed: null | number;

	get initiated() {
		return this.#initiated;
	}

	get initiatedText() {
		return this.#initiatedText;
	}

	get text() {
		return this.#text;
	}

	get duration() {
		return this.#completed && (this.#completed - this.#initiated);
	}

	get isCompleted() {
		return this.#completed != null;
	}

	get abortSignal() {
		return this.#controller.signal;
	}

	constructor(text: string) {
		const now = Date.now();
		this.#text = chalk.blue(text);
		this.#controller = new AbortController();
		this.#initiated = now;
		this.#initiatedText = new Date(now).toISOString().substring(11, 23);
		this.#completed = null;
	}

	abort() {
		if (this.#completed == null) {
			this.#text = chalk.redBright("Request aborted");
			this.#completed = Date.now();
			this.#controller.abort();
		}
	}

	update(...args: ColorableArgs): void {
		if (this.#completed != null)
			return;
			
		const [color, text] = unwrapArgs("green", args);
		this.#text = chalk[color](text);
	}

	complete(...args: ColorableArgs) {
		if (this.#completed != null)
			return;

		const [color, text] = unwrapArgs("green", args);
		this.#text = chalk[color](text);
		this.#completed = Date.now();
		this.#controller.abort();
	}

	error(e: any) {
		if (this.#completed != null)
			return;

		this.#text = chalk.red(e);
		this.#completed = Date.now();
		this.#controller.abort();
	}
}

export var Task: TaskConstructor = TaskImpl as any;
export default Task;