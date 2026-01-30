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
export interface SqlMetric {
    timestamp: number;
    duration: number;
}
export declare class SqlInterface {
    private logPrefix;
    private adapter;
    private log;
    private sqlInstance;
    private dbName;
    private metrics;
    private lastMetricTs;
    constructor(adapter: ioBroker.myAdapter);
    getDatabaseName(): Promise<void>;
    getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, logPrefixAppend: string, timestampStart?: number, timestampEnd?: number): Promise<SqlCounter | null>;
    /**
     * @deprecated old function
     *
     */
    getTotal2(item: ioBroker.AdapterConfigTypes.HistoryItem, interval: string, timestampStart: number, timestampEnd: number, logPrefixAppend: string): Promise<SqlTotal | null>;
    getTotal(item: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, timestampStart: number, timestampEnd: number, logPrefixAppend: string): Promise<SqlTotal | null>;
    storeState(item: ioBroker.AdapterConfigTypes.DatapointsItem, state: ioBroker.State): Promise<any>;
    private retrieve;
    private metricsHandler;
    private getMetricsPeaksPerSecond;
    private getMetricsAbsolutePeaks;
}
