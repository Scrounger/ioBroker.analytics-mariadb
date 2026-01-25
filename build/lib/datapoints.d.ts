export declare class Datapoints {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    private idTotal;
    private idOldValue;
    private idStorageValue;
    private idBooleanValue;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    private createStates;
    private createState;
    private createStateNumber;
    private createStateBoolean;
    private updateState;
    onObjectChange(id: string): Promise<void>;
    onStateChange(item: ioBroker.AdapterConfigTypes.DatapointsItem, id: string, state: ioBroker.State): Promise<void>;
}
