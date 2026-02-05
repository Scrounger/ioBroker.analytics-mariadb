import moment from "moment";
export interface CostResult {
    start?: moment.Moment;
    end?: moment.Moment;
    consumption?: number;
    variableCosts?: number;
    basicPrice?: number;
    bonusPrice?: number;
    days?: number;
    sum?: number;
}
export declare class Costs {
    private logPrefix;
    private adapter;
    private log;
    idSuffix: string;
    private costList;
    constructor(adapter: ioBroker.myAdapter);
    init(): Promise<void>;
    getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType;
    private prepareAndCheckCostList;
    getCostOfRange(item: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, rangeStart: moment.Moment, rangeEnd: moment.Moment, interval?: string): Promise<CostResult>;
    private calculationOfRange;
}
