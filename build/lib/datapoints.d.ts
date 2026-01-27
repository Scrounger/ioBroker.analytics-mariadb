export declare class Datapoints {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idTotal: string;
    private idOldValue;
    private idStorageValue;
    idBooleanValue: string;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.DatapointsItem;
    private createStates;
    private createState;
    private createStateNumber;
    private createStateBoolean;
    private updateState;
    onObjectChange(id: string): Promise<void>;
    onStateChange(item: ioBroker.AdapterConfigTypes.DatapointsItem, id: string, state: ioBroker.State): Promise<void>;
    writeValuesAtDayChangeToDatabase(): Promise<void>;
}
