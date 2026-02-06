export declare class History {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    private idChannelHistory;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.HistoryItem;
    getCalculationByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.HistoryItem[];
    private createStates;
    updateNameOfStates(): Promise<void>;
    private _updateNameOfStates;
    updateStates(): Promise<void>;
    private _updateStates;
    private updateThisYear;
    private updateThePast;
    private updateHistory;
    private checkCalculationConditions;
    private updateCalculatedThisYear;
    private updateCalculatedThePast;
    private getCalculation;
    onStateChange(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State, isCalculation: boolean, force?: boolean): Promise<void>;
    private getDatesFromInterval;
}
