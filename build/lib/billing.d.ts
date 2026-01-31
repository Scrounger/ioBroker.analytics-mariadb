export declare class Billing {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelBilling: string;
    private idConsumption;
    private idCosts;
    private idBackPayment;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getListByIdTarget(idTarget: string, futureOnly?: boolean): ioBroker.AdapterConfigTypes.billingItem[];
    private createStates;
    private updateState;
    onStateChange(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem): Promise<void>;
}
