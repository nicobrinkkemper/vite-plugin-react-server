type CreateWorkerOptions = {
    workerPath: string;
    nodePath: string;
    mode: "production" | "development";
    workerOptions?: WorkerOptions;
};
export declare function createWorker(options: CreateWorkerOptions): Promise<any>;
export {};
//# sourceMappingURL=createWorker.d.ts.map