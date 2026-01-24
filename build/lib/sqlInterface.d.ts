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
    constructor(adapter: ioBroker.myAdapter);
    getQuery(): Promise<any>;
    getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: Interval): Promise<SqlCounter | SqlCounter[] | null>;
    private retrieve;
}
