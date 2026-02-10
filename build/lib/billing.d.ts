export declare class Billing {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelBilling: string;
    private idDays;
    private idConsumption;
    private idCosts;
    private idPrePayment;
    private idBackPayment;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getListByIdTarget(idTarget: string, futureOnly?: boolean): ioBroker.AdapterConfigTypes.BillingItem[];
    private createStates;
    private updateState;
    onStateChange(item: ioBroker.AdapterConfigTypes.BillingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem): Promise<void>;
}
