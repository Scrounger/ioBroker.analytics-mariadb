import moment from "moment";

export enum Interval {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    MONTHLY = 'monthly',
    YEARLY = 'yearly',
    ALL = 'all',
}

enum QueryTaype {
    QUERY = 'query',
}

export interface SqlCounter {
    start: string;
    end: string;
    count: number;
}

export class SqlInterface {
    private adapter: ioBroker.myAdapter;
    private log: ioBroker.Logger;

    constructor(adapter: ioBroker.myAdapter) {
        this.adapter = adapter;
        this.log = adapter.log;
    }

    public async getQuery(): Promise<any> {
        const logPrefix = '[getQuery]:';

        try {
            const result = await this.adapter.sendToAsync(this.adapter.config.sqlInstance, 'query', 'SELECT * FROM devBroker.datapoints')
                .catch((result) => {
                    this.log.error(`${logPrefix} sql error: ${result}`);
                });

            this.log.warn(JSON.stringify(result));
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async getCounter(item: ioBroker.AdapterConfigTypes.DatapointsItem, interval: Interval): Promise<SqlCounter | SqlCounter[] | null> {
        const logPrefix = `[getCounter] [${interval}] - '${item.idSql}':`;

        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM devBroker.datapoints
                    WHERE name = '${item.idSql}'
                )
                SELECT
                    DATE_FORMAT(Min(FROM_UNIXTIME(ts / 1000)),'%d.%m.%Y') AS 'start',
                    DATE_FORMAT(Max(FROM_UNIXTIME(ts / 1000)),'%d.%m.%Y') AS 'end',
                    COUNT(*) AS 'count'
                FROM (
                    SELECT
                        ts,
                        val,
                        LAG(val) OVER (PARTITION BY id ORDER BY ts) AS prev_val
                    FROM devBroker.ts_bool
                    WHERE id = (SELECT id FROM dp)
                ) n
                WHERE
                    n.prev_val = 0 AND
                    n.val = 1
                ORDER BY ts DESC;
            `;

            this.adapter.itemDebug(item, `${logPrefix} query: ${query}`);

            const data = await this.retrieve(QueryTaype.QUERY, query, item, logPrefix);

            if (data && data.result) {
                if (data.error) {
                    this.log.error(`${logPrefix} data error: ${data.error}`);
                    return null;
                } else {
                    if (interval === Interval.ALL) {
                        // can only have one row
                        if (data.result.length === 1) {
                            return data.result[0] as SqlCounter;
                        } else {
                            this.log.error(`${logPrefix} unexpected number of data rows: ${data.result.length} (data: ${JSON.stringify(data.result)})`);
                            return null;
                        }
                    } else {
                        return data.result as SqlCounter[];
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    private async retrieve(queryType: QueryTaype, query: string, item: ioBroker.AdapterConfigTypes.DatapointsItem, logP: string): Promise<any | null> {
        const logPrefix = `[retrieve] ${logP}`;

        try {
            const now = moment();

            const data = await this.adapter.sendToAsync(this.adapter.config.sqlInstance, queryType, query)
                .catch((result) => {
                    this.log.error(`${logPrefix} sql error: ${result}`);
                    return null;
                });

            this.adapter.itemDebug(item, `${logPrefix} duration: ${moment().diff(now, 'milliseconds') / 1000}s, data: ${JSON.stringify(data)}`);

            return data

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }
}