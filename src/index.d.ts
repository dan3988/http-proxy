declare type Action<T extends any[] = []> = (...args: T) => void;

declare type Resolver<T> = Action<[result: T]>;
declare type Rejector = Action<[error: any]>;

declare type ResolveReject<T> = [resolve: Resolver<T>, reject: Rejector];
