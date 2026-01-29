export declare class Cost {
    private logPrefix;
    private adapter;
    private utils;
    private log;
    idChannelCost: string;
    private costList;
    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core"));
    init(): Promise<void>;
    prepareAndCheckCostList(): Promise<void>;
    getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType;
}
