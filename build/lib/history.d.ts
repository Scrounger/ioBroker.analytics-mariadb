export declare class History {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    private idChannelHistory;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    private createStates;
    private updateNameOfStates;
    private _updateNameOfStates;
    private updateStates;
    updateState(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State, isAdapterStart?: boolean): Promise<void>;
    private updateCalcedStates;
    private getDatesFromInterval;
}
