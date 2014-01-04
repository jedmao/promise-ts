﻿export class Deferred {

	private doneCallbacks: Function[] = [];
	private failCallbacks: Function[] = [];
	private progressCallbacks: Function[] = [];
	private _promise: Promise;
	private _state: string;
	private _result: any[];
	private _notifyContext: any;
	private _notifyArgs: any[];

	constructor() {
		this._promise = new Promise(this);
		this._state = 'pending';
	}

	get promise(): Promise {
		return this._promise;
	}

	get state(): string {
		return this._state;
	}

	get rejected(): boolean {
		return this.state === 'rejected';
	}

	get resolved(): boolean {
		return this.state === 'resolved';
	}

	resolve(...args: any[]): Deferred {
		args.unshift(this);
		return this.resolveWith.apply(this, args);
	}

	resolveWith(context: any, ...args: any[]): Deferred {
		this._result = args;
		this.doneCallbacks.forEach(callback => {
			callback.apply(context, args);
		});
		this.doneCallbacks = [];
		this._state = 'resolved';
		return this;
	}

	reject(...args: any[]): Deferred {
		args.unshift(this);
		return this.rejectWith.apply(this, args);
	}

	rejectWith(context: any, ...args: any[]): Deferred {
		this.failCallbacks.forEach(callback => {
			callback.apply(context, args);
		});
		this.failCallbacks = [];
		this._state = 'rejected';
		return this;
	}

	progress(...callbacks: Function[]): Deferred {
		var d = new Deferred();
		if (this.resolved || this.rejected) {
			callbacks.forEach(callback => {
				callback.apply(this._notifyContext, this._notifyArgs);
			});
			return d;
		}
		callbacks.forEach(callback => {
			this.progressCallbacks.push(this.wrap(d, callback, d.notify));
		});
		this.checkStatus();
		return d;
	}

	notify(...args: any[]): Deferred {
		args.unshift(this);
		return this.notifyWith.apply(this, args);
	}

	notifyWith(context: any, ...args: any[]): Deferred {
		if (this.resolved || this.rejected) {
			return this;
		}
		this._notifyContext = context;
		this._notifyArgs = args;
		this.progressCallbacks.forEach(callback => {
			callback.apply(context, args);
		});
		return this;
	}

	private checkStatus() {
		if (this.resolved) {
			this.resolve.apply(this, this._result);
		} else if (this.rejected) {
			this.reject.apply(this, this._result);
		}
	}

	then(doneFilter: Function, failFilter?: Function, progressFilter?: Function): Deferred {
		var d = new Deferred();
		this.progressCallbacks.push(this.wrap(d, progressFilter, d.progress));
		this.doneCallbacks.push(this.wrap(d, doneFilter, d.resolve));
		this.failCallbacks.push(this.wrap(d, failFilter, d.reject));
		this.checkStatus();
		return this;
	}

	private wrap(d: Deferred, f: Function, method: Function): Function {
		return (...args: any[]) => {
			var result = f.apply(f, args);
			if (result && result instanceof Promise) {
				result.then(
					() => { d.resolve(); },
					() => { d.reject(); }
				);
			} else {
				method.apply(d, [result]);
			}
		};
	}

	done(...callbacks: Function[]): Deferred {
		var d = new Deferred();
		callbacks.forEach(callback => {
			this.doneCallbacks.push(this.wrap(d, callback, d.resolve));
		});
		this.checkStatus();
		return d;
	}

	fail(...callbacks: Function[]): Deferred {
		var d = new Deferred();
		callbacks.forEach(callback => {
			this.failCallbacks.push(this.wrap(d, callback, d.reject));
		});
		this.checkStatus();
		return d;
	}

	always(...callbacks: Function[]): Deferred {
		var d = new Deferred();
		callbacks.forEach(callback => {
			this.doneCallbacks.push(this.wrap(d, callback, d.resolve));
			this.failCallbacks.push(this.wrap(d, callback, d.reject));
		});
		this.checkStatus();
		return d;
	}

}

export class Promise {

	constructor(private deferred: Deferred) {
	}

	then(doneFilter: Function, failFilter?: Function, progressFilter?: Function): Promise {
		return this.deferred.then(doneFilter, failFilter, progressFilter).promise;
	}

	done(...callbacks: Function[]): Promise {
		return (<Deferred>this.deferred.done.apply(this.deferred, callbacks)).promise;
	}

	fail(...callbacks: Function[]): Promise {
		return (<Deferred>this.deferred.fail.apply(this.deferred, callbacks)).promise;
	}

	always(...callbacks: Function[]): Promise {
		return (<Deferred>this.deferred.always.apply(this.deferred, callbacks)).promise;
	}

	get resolved(): boolean {
		return this.deferred.resolved;
	}

	get rejected(): boolean {
		return this.deferred.rejected;
	}

}

export interface IWhen {
	(deferred: Deferred): Promise;
	(promise: Promise): Promise;
	(object: any): Promise;
	(...args: Deferred[]): Promise;
}

export var when: IWhen = (...args: any[]): Promise => {
	if (args.length === 1) {
		var arg = args[0];
		if (arg instanceof Deferred) {
			return (<Deferred>arg).promise;
		}
		if (arg instanceof Promise) {
			return arg;
		}
	}
	var done = new Deferred();
	if (args.length === 1) {
		done.resolve(args[0]);
		return done.promise;
	}
	var pending = args.length;
	var results = [];
	var onDone = (...resultArgs: any[]) => {
		results.push(resultArgs);
		if (--pending === 0) {
			done.resolve.apply(done, results);
		}
	};
	var onFail = () => {
		done.reject();
	};
	args.forEach(a => {
		(<Deferred>a).then(onDone, onFail);
	});
	return done.promise;
};
