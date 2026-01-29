import moment from "moment";
export declare class Cost {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelCost: string;
    private costList;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    private prepareAndCheckCostList;
    getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType;
    getCostOfRange(item: ioBroker.AdapterConfigTypes.HistoryItem, rangeStart: moment.Moment, rangeEnde: moment.Moment, interval?: string): Promise<void>;
}
