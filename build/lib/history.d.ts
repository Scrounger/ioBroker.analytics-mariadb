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
    private updateStateOfThisYear;
    private updateStatesOfThePast;
    private updateCalcedStates;
    onStateChange(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State): Promise<void>;
    private getDatesFromInterval;
}
