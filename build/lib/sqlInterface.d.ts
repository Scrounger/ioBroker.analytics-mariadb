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
export declare class SqlInterface {
    private adapter;
    private log;
    private sqlInstance;
    private dbName;
    constructor(adapter: ioBroker.myAdapter);
    getDatabaseName(): Promise<void>;
    getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: Interval): Promise<SqlCounter | SqlCounter[] | null>;
    private retrieve;
}
