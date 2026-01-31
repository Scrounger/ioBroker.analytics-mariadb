import moment from "moment";
export interface CostResult {
    consumption?: number;
    variableCosts?: number;
    basicPrice?: number;
    bonusPrice?: number;
    days?: number;
    sum?: number;
}
export declare class Cost {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelCost: string;
    private costList;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType;
    private prepareAndCheckCostList;
    getCostOfRange(item: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, rangeStart: moment.Moment, rangeEnde: moment.Moment, interval?: string): Promise<CostResult>;
    private calculationOfRange;
}
