import moment from "moment";
import * as mathjs from 'mathjs'

export enum Interval {
    day = 'day',
    week = 'week',
    month = 'month',
    year = 'year',
    ALL = 'ALL',
}

enum QueryType {
    QUERY = 'query',
    STORESTATE = 'storeState',
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
    timestamp: number;   // Startzeitpunkt (ms seit Epoch)
    duration: number;    // Dauer in ms
}

export class SqlInterface {
    private logPrefix: string = 'SqlInterface'

    private adapter: ioBroker.myAdapter;
    private log: ioBroker.Logger;

    private sqlInstance: string;
    private dbName: string;

    private metrics: SqlMetric[] = [];

    private lastMetricTs: number = null;

    constructor(adapter: ioBroker.myAdapter) {
        this.adapter = adapter;
        this.log = adapter.log;
        this.sqlInstance = adapter.config.sqlInstance;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.getDatabaseName();

        this.lastMetricTs = moment().valueOf();
    }

    public async getDatabaseName(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.getDatabaseName]:`

        try {
            const sqlObj = await this.adapter.getForeignObjectAsync(`system.adapter.${this.sqlInstance}`);

            if (sqlObj && sqlObj.native && sqlObj.native.dbname) {
                this.dbName = sqlObj.native.dbname;
                this.log.debug(`${logPrefix} database name: ${this.dbName}`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, logPrefixAppend: string, timestampStart: number = 0, timestampEnd: number = 0, historyItem: ioBroker.AdapterConfigTypes.HistoryItem | null = null): Promise<SqlCounter | null> {
        const logPrefix = `[${this.logPrefix}.getCounter] ${logPrefixAppend}:`

        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM ${this.dbName}.datapoints
                    WHERE name = '${this.adapter.namespace}.${item.idSql}'
                    LIMIT 1
                )
                SELECT
                    DATE_FORMAT(Min(FROM_UNIXTIME(ts / 1000)),'%d.%m.%Y - %H:%i') AS 'start',
                    DATE_FORMAT(Max(FROM_UNIXTIME(ts / 1000)),'%d.%m.%Y - %H:%i') AS 'end',
                    COUNT(*) AS 'count'
                FROM (
                    SELECT
                        ts,
                        val,
                        LAG(val) OVER (PARTITION BY id ORDER BY ts) AS prev_val
                    FROM ${this.dbName}.ts_bool
                    WHERE 
                    id = (SELECT id FROM dp)
                    ${interval === Interval.ALL ? '' : `AND ts >= ${timestampStart} AND ts <  ${timestampEnd}`}
                    ${item.sqlWhereAppend ? item.sqlWhereAppend : ''}
                ) n
                WHERE
                    n.prev_val = 0 AND
                    n.val = 1
                ORDER BY ts DESC;
            `;

            this.adapter.itemDebug(historyItem ? historyItem : item, `${logPrefix} ${interval === Interval.ALL ? '' : `start: ${moment(timestampStart).format(`${this.adapter.dateFormat} - HH:mm`)}, end: ${moment(timestampEnd).format(`${this.adapter.dateFormat} - HH:mm`)}`}, query: ${query}`);

            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);

            if (data) {
                // can only have one row
                if (data.length === 1) {
                    return data[0] as SqlCounter;
                } else {
                    if (data.length === 0) {
                        this.log.info(`${logPrefix} no data for this range available. Change the settings for this interval to supress this info`);
                    } else {
                        this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    /**
     * @deprecated old function
     * @param item 
     * @param interval
     * @param timestampStart
     * @param timestampEnd
     * @param logPrefixAppend 
     */
    public async getTotal2(item: ioBroker.AdapterConfigTypes.HistoryItem, interval: string, timestampStart: number, timestampEnd: number, logPrefixAppend: string): Promise<SqlTotal | null> {
        const logPrefix = `[${this.logPrefix}.getTotal2] ${logPrefixAppend}:`

        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM ${this.dbName}.datapoints
                    WHERE name = '${this.adapter.namespace}.${item.id as string}'
                    LIMIT 1
                )
                SELECT
                    DATE_FORMAT(FROM_UNIXTIME(result.start / 1000), '%d.%m.%Y - %H:%i') as 'start',
                    result.min,
                    DATE_FORMAT(FROM_UNIXTIME(result.end / 1000), '%d.%m.%Y - %H:%i') as 'end',
                    result.max,
                    result.max - result.min as 'delta'
                FROM (
                    SELECT
                        MIN(ts) AS 'start',
                        MIN(val) AS 'min',
                        MAX(ts) AS 'end',
                        MAX(val) AS 'max'
                    FROM ${this.dbName}.ts_number
                    WHERE id = (SELECT id FROM dp)
                    AND ts >= ${timestampStart}
                    AND ts <  ${timestampEnd}
                ) result;
            `;

            this.adapter.itemDebug(item, `${logPrefix} ${interval === Interval.ALL ? '' : `start: ${moment(timestampStart).format(`${this.adapter.dateFormat} - HH:mm`)}, end: ${moment(timestampEnd).format(`${this.adapter.dateFormat} - HH:mm`)}`}, query: ${query}`);

            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);

            if (data) {
                // can only have one row as result
                if (data.length === 1) {
                    return data[0] as SqlTotal;
                } else {
                    if (data.length === 0) {
                        this.log.info(`${logPrefix} no data for this range available. Change the settings for this interval to supress this info`);
                    } else {
                        this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                    }
                }

            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    public async getTotal(item: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, timestampStart: number, timestampEnd: number, logPrefixAppend: string): Promise<SqlTotal | null> {
        const logPrefix = `[${this.logPrefix}.getTotal] ${logPrefixAppend}:`

        try {
            const query = `
                            WITH state AS (
                                SELECT id
                                FROM ${this.dbName}.datapoints
                                WHERE name = '${this.adapter.namespace}.${item.id as string}'
                                LIMIT 1
                            )
                            SELECT
                                DATE_FORMAT(FROM_UNIXTIME(start.ts / 1000), '%d.%m.%Y - %H:%i') AS 'start',
                                start.val AS 'min',
                                DATE_FORMAT(FROM_UNIXTIME(end.ts / 1000), '%d.%m.%Y - %H:%i') AS 'end',
                                end.val AS 'max',
                                end.val - start.val AS 'delta'
                            FROM
                            (
                                SELECT ts, val
                                FROM ${this.dbName}.ts_number
                                WHERE id = (SELECT id FROM state)
                                AND ts >= ${timestampStart}
                                AND val IS NOT NULL
                                ${datapointItem.sqlWhereAppend ? datapointItem.sqlWhereAppend : ''}
                                ORDER BY ts ASC
                                LIMIT 1
                            ) start
                            CROSS JOIN
                            (
                                SELECT ts, val
                                FROM ${this.dbName}.ts_number
                                WHERE id = (SELECT id FROM state)
                                AND ts <  ${moment(timestampEnd).endOf('day').valueOf()}
                                AND val IS NOT NULL
                                ${datapointItem.sqlWhereAppend ? datapointItem.sqlWhereAppend : ''}
                                ORDER BY ts DESC
                                LIMIT 1
                            ) end;
                        `;

            this.adapter.itemDebug(item, `${logPrefix} ${interval === Interval.ALL ? '' : `start: ${moment(timestampStart).format(`${this.adapter.dateFormat} - HH:mm`)}, end: ${moment(timestampEnd).format(`${this.adapter.dateFormat} - HH:mm`)}`}, query: ${query}`);

            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);

            if (data) {
                // can only have one row as result
                if (data.length === 1) {
                    return data[0] as SqlTotal;
                } else {
                    if (data.length === 0) {
                        this.log.info(`${logPrefix} no data for this range available. Change the settings for this interval to supress this info`);
                    } else {
                        this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                    }

                    return null;
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    public async getLastValue(item: ioBroker.AdapterConfigTypes.DatapointsItem, logPrefixAppend: string): Promise<number | null> {
        const logPrefix = `[${this.logPrefix}.getLastValue] ${logPrefixAppend}:`

        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM ${this.dbName}.datapoints
                    WHERE name = '${this.adapter.namespace}.${item.idSql}' 
                    LIMIT 1
                )
                Select 
                    *
                FROM 
                    ${this.dbName}.ts_number
                WHERE 
                    id = (SELECT id FROM dp)
                ORDER BY ts DESC
                LIMIT 1
            `;

            this.adapter.itemDebug(item, `${logPrefix} query: ${query}`);

            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);

            if (data) {
                // can only have one row as result
                if (data.length === 1) {
                    return data[0].val as number;
                } else {
                    if (data.length === 0) {
                        this.log.warn(`${logPrefix} no data available. You can use a sql append role to supress this warning.`);
                    } else {
                        this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    public async storeState(item: ioBroker.AdapterConfigTypes.DatapointsItem, state: ioBroker.State): Promise<any> {
        const logPrefix = `[${this.logPrefix}.storeState] - '${item.idSql}':`

        try {
            await this.retrieve(QueryType.STORESTATE, {
                id: `${this.adapter.namespace}.${item.idSql}`,
                state: {
                    ts: moment().valueOf(),
                    val: state.val,
                    ack: state.ack,
                    from: `system.adapter.${this.adapter.namespace}`,
                    q: state.q ? state.q : 0
                }
            }, item, logPrefix);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async retrieve(queryType: QueryType, query: any, item: ioBroker.AdapterConfigTypes.DatapointsItem | ioBroker.AdapterConfigTypes.HistoryItem, logPrefixAppend: string): Promise<any | null> {
        const logPrefix = `[${this.logPrefix}.retrieve] ${logPrefixAppend}:`

        try {
            const sqlAlive = await this.adapter.getForeignStateAsync(`${this.sqlInstance}.info.connection`);

            if (sqlAlive?.val) {
                const now = moment();

                // ToDo: Statistik Abfragen pro Minute oder pro Sekunde

                const data = await this.adapter.sendToAsync(this.sqlInstance, queryType, query)
                    .catch((result) => {
                        this.log.error(`${logPrefix} sql error: ${result}`);
                        return null;
                    });

                const duration = moment().diff(now, 'milliseconds');

                this.adapter.itemDebug(item, `${logPrefix} duration: ${duration / 1000}s, data: ${JSON.stringify(data)}`);

                if (duration / 1000 > 1 && !this.adapter.config.fastStart) {
                    this.log.warn(`${logPrefix} query took ${duration / 1000}s (query: ${typeof query === 'string' ? query : JSON.stringify(query)})`);
                }

                if (duration / 1000 > 2 && this.adapter.config.fastStart) {
                    this.log.warn(`${logPrefix} query took ${duration / 1000}s (query: ${typeof query === 'string' ? query : JSON.stringify(query)})`);
                }

                this.metricsHandler(now.valueOf(), duration);

                if (data.error) {
                    this.log.error(`${logPrefix} data error: ${data.error}`);
                    return null;
                } else {
                    if (data && (data.result || data.success)) {
                        return data.result
                    } else {
                        this.log.error(`${logPrefix} no result exists in data: ${JSON.stringify(data)}`);
                    }
                }
            } else {
                this.log.error(`${logPrefix} SQL instance '${this.sqlInstance}' is not alive`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    private metricsHandler(now: number, duration: number): void {
        const logPrefix = `[${this.logPrefix}.metricsHandler]:`

        try {
            const cutoff = Date.now() - this.adapter.config.metricsMinUpdateInterval * 1000;

            while (this.metrics.length && this.metrics[0].timestamp < cutoff) {
                this.metrics.shift();
            }

            this.metrics.push({
                timestamp: now,
                duration: duration,
            });

            if (moment().diff(moment(this.lastMetricTs), 'second') >= this.adapter.config.metricsMinUpdateInterval) {
                this.lastMetricTs = moment().valueOf();

                void this.getMetricsAbsolutePeaks();
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private getMetricsPeaksPerSecond(): Record<number, { requests: number; peakDuration: number; }> {
        const logPrefix = `[${this.logPrefix}.getPeaksPerSecond]:`

        try {
            const result: Record<number, { requests: number; peakDuration: number }> = {};

            for (const m of this.metrics) {
                const second = Math.floor(m.timestamp / 1000);

                if (!result[second]) {
                    result[second] = { requests: 0, peakDuration: 0 };
                }

                result[second].requests++;

                if (m.duration > result[second].peakDuration) {
                    result[second].peakDuration = m.duration;
                }
            }

            return result;
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    private async getMetricsAbsolutePeaks(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.getAbsolutePeaks]:`

        try {
            const perSecond = this.getMetricsPeaksPerSecond();

            let peakRps = 0;
            let peakDuration = 0;

            if (perSecond) {
                for (const sec in perSecond) {
                    peakRps = Math.max(peakRps, perSecond[sec].requests);
                    peakDuration = Math.max(peakDuration, perSecond[sec].peakDuration / 1000);
                }

                await this.adapter.setState('info.requests', peakRps, true);
                await this.adapter.setState('info.duration', mathjs.round(peakDuration, 3), true);

                this.log.silly(`${logPrefix} update metrics: rps: ${peakRps}, duration: ${mathjs.round(peakDuration, 3)}s, metircs data: ${this.metrics.length} entries`);

                return;
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        await this.adapter.setState('info.requests', 0, true);
        await this.adapter.setState('info.duration', 0, true);
    }
}