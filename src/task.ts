import type { ChalkColor, StringLike } from "./util.js";
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
	new(prefix: string): Task;
	new(color: ChalkColor, prefix: string): Task;
}

type ColoredArgs = readonly [color: ChalkColor, text: StringLike];
type ColorableArgs = readonly [text: StringLike] | ColoredArgs;

function unwrapArgs(fallback: ChalkColor, args: ColorableArgs): ColoredArgs {
	return args.length === 2 ? args : [fallback, args[0]];
}

class TaskImpl implements TaskBase {
	readonly #prefix: string;
	readonly #initiated: number;
	#text: string;
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

	constructor(...args: ColorableArgs) {
		const now = Date.now();
		const [color, prefix] = unwrapArgs("blue", args);
		const text =  chalk[color](prefix);
		this.#prefix = text;
		this.#text = text;
		this.#initiated = now;
		this.#initiatedText = new Date(now).toISOString().substring(11, 23);
		this.#completed = null;
	}

	#setText(color: ChalkColor, text: StringLike) {
		this.#text = this.#prefix + " - " + chalk[color](text);
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
}

export var Task: TaskConstructor = TaskImpl as any;
export default Task;