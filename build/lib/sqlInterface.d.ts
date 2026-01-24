export declare enum Interval {
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
    YEARLY = "yearly",
    ALL = "all"
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
