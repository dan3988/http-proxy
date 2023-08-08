import * as util from "node:util";
import ConsoleString, { ConsoleColor, ConsoleWriter } from "./console-string.js";
import type { StringLike } from "./util.js";

export interface TaskFactory {
	start(text: string): Task;
}

export type DefaultFields = "progress" | "initiated";

export interface TaskFieldInitBase {
	format?: string;
	color?: ConsoleColor;
}

export interface TaskDefaultFieldInit extends TaskFieldInitBase {
	field: DefaultFields;
}

export interface TaskValueFieldInit extends TaskFieldInitBase {
	value: StringLike;
}

export type TaskFieldInit = TaskDefaultFieldInit | TaskValueFieldInit;

type TaskGetter = (task: TaskImpl) => null | undefined | string

interface TaskField {
	write(out: ConsoleWriter, task: TaskImpl): void;
}

type TaskFieldFactory = (init: TaskFieldInitBase) => TaskField;

interface TaskFieldRef {
	replace(init: TaskFieldInit): TaskFieldRef;
}

export interface TaskBase {
	readonly initiated: number;
	readonly duration: null | number;
	readonly isCompleted: boolean;

	complete(): void;
	addField(init: TaskFieldInit): TaskFieldRef;

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
	new(anim: string[]): Task;
}

type ColoredArgs = readonly [color: ConsoleColor, text: StringLike];
type ColorableArgs = readonly [text: StringLike] | ColoredArgs;

function divRem(dividend: number, divisor: number): [number, number] {
	const result = dividend / divisor;
	const rounded = Math.trunc(result);
	return [rounded, dividend - (rounded * divisor)];
}

function durationToString(ms: number) {
	let seconds = ms / 1000;
	if (seconds < 60)
		return seconds.toFixed(3) + "s";
	
	let mins: number;
	[mins, seconds] = divRem(seconds, 60);
	if (mins < 60)
		return `${mins}m ${seconds}s`;

	let hours: number;
	[hours, mins] = divRem(mins, 60);
	return `${hours}h ${mins}m`;
}

function expand(value: StringLike | null | undefined, { color, format }: TaskFieldInitBase) {
	const text = format ? util.format(format, value) : String(value);
	return color ? new ConsoleString(text, color) : text;
}

function write(writer: ConsoleWriter, value: string | ConsoleString) {
	typeof value === "string" ? writer.write(value) : value.writeTo(writer);
}

class ProgressTaskField implements TaskField {
	readonly #anim: string[];
	#index: number;

	constructor(anim: string[]) {
		this.#anim = anim;
		this.#index = 0;
	}

	write(out: ConsoleWriter): void {
		const anim = this.#anim;
		const index = (this.#index + 1) % anim.length;
		this.#index = index;
		out.write(anim[index]);
	}
}

class DefaultTaskField implements TaskField {
	readonly #init: TaskFieldInitBase;
	readonly #getter: TaskGetter;
	
	constructor(init: TaskFieldInitBase, getter: TaskGetter) {
		this.#init = init;
		this.#getter = getter;
	}

	write(out: ConsoleWriter, task: TaskImpl): void {
		const value = this.#getter.call(undefined, task);
		const text = expand(value, this.#init);
		write(out, text);
	}
}

class ValueTaskField implements TaskField {
	readonly #value: string | ConsoleString;

	constructor(init: TaskFieldInitBase, value: StringLike) {
		this.#value = expand(value, init);
	}

	write(out: ConsoleWriter): void {
		write(out, this.#value);
	}
}

class TaskImpl implements TaskBase {
	static readonly #defaultFields: Record<DefaultFields, TaskFieldFactory> = {
		progress: i => new DefaultTaskField(i, v => v.#progress()),
		initiated: i => new DefaultTaskField(i, v => v.#initiatedText)
	}

	static readonly #FieldRef = class TaskFieldRefImpl implements TaskFieldRef {
		#owner: null | TaskImpl;
		#index: number;

		constructor(owner: TaskImpl, index: number) {
			this.#owner = owner;
			this.#index = index;
		}

		replace(init: TaskFieldInit): TaskFieldRef {
			if (this.#owner == null)
				throw new TypeError("Reference has already been replaced.");

			const ref = this.#owner.#addField(init, this.#index);
			this.#owner = null;
			return ref;
		}
	}

	readonly #loading: string[];
	#loadingIndex: number;
	readonly #initiated: number;
	readonly #initiatedText: string;
	readonly #fields: TaskField[];
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

	constructor(loading: string[]) {
		const now = Date.now();
		this.#loading = loading;
		this.#loadingIndex = 0;
		this.#fields = [];
		this.#initiated = now;
		this.#initiatedText = new Date(now).toISOString().substring(11, 23);
		this.#completed = null;
	}

	#addField(init: TaskFieldInit, index: number) {
		let field: TaskField;
		if ("field" in init) {
			field = TaskImpl.#defaultFields[init.field](init);
		} else {
			field = new ValueTaskField(init, init.value);
 		}

		this.#fields[index] = field;
		return new TaskImpl.#FieldRef(this, index);
	}

	addField(init: TaskFieldInit): TaskFieldRef {
		return this.#addField(init, this.#fields.length);
	}

	#progress() {
		const dur = this.duration;
		if (dur == null) {
			return this.#tickLoader();
		} else {
			return durationToString(dur).padStart(7, " ");
		}
	}

	#tickLoader() {
		const anim = this.#loading;
		const index = this.#loadingIndex;
		this.#loadingIndex = (index + 1) % anim.length;
		return anim[index];
	}

	complete(...args: ColorableArgs) {
		if (this.#completed == null)
			this.#completed = Date.now();
	}

	write(writer: ConsoleWriter): void {
		const fields = this.#fields;
		if (fields.length === 0)
			return;

		fields[0].write(writer, this);

		for (let i = 1; i < fields.length; i++) {
			writer.write(" ");
			fields[i].write(writer, this);
		}
	}
}

export var Task: TaskConstructor = TaskImpl as any;
export default Task;