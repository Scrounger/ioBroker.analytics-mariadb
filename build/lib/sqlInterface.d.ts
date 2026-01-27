export declare enum Interval {
    day = "day",
    week = "week",
    month = "month",
    year = "year",
    ALL = "ALL"
}
export interface SqlCounter {
    start: string;
    end: string;
    count: number;
}
export interface SqlTotal {
    start: string;
    min: number;
    end: string;
    max: number;
    delta: number;
}
export declare class SqlInterface {
    private logPrefix;
    private adapter;
    private log;
    private sqlInstance;
    private dbName;
    constructor(adapter: ioBroker.myAdapter);
    getDatabaseName(): Promise<void>;
    getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, timestampStart?: number, timestampEnd?: number): Promise<SqlCounter | null>;
    getTotal(item: ioBroker.AdapterConfigTypes.HistoryItem, interval: string, timestampStart: number, timestampEnd: number): Promise<SqlTotal | null>;
    storeState(item: ioBroker.AdapterConfigTypes.DatapointsItem, state: ioBroker.State): Promise<any>;
    private retrieve;
}
