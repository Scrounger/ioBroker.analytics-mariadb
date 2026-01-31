export declare class Billing {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelBilling: string;
    private idConsumption;
    private idCosts;
    private idBackPayment;
    private costList;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    private createStates;
    updateState(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem): Promise<void>;
}
