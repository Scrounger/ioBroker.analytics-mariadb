export declare class History {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    private idChannelHistory;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    private createStates;
    updateNameOfStates(): Promise<void>;
    private _updateNameOfStates;
    updateStates(): Promise<void>;
    private _updateStates;
    private updateThisYear;
    private updateThePast;
    private updateHistory;
    private updateCalculatedStates;
    onStateChange(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State): Promise<void>;
    private getDatesFromInterval;
}
