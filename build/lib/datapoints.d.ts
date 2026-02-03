export declare class Datapoints {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idTotal: string;
    idOldValue: string;
    private idStorageValue;
    idBooleanValue: string;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.DatapointsItem;
    private createStates;
    private createState;
    private createStateNumber;
    private createStateBoolean;
    private updateStateNumber;
    private updateStateBoolean;
    onObjectChange(id: string): Promise<void>;
    onStateChange(item: ioBroker.AdapterConfigTypes.DatapointsItem, id: string, state: ioBroker.State): Promise<void>;
    saveStatesToDatabase(): Promise<void>;
    /**
     * Write item asynchronously to database at day change
     *
     * @param item Datapoint item
     */
    private saveStateToDatabase;
}
