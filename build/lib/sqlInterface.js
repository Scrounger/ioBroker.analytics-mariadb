import moment from "moment";
export var Interval;
(function (Interval) {
    Interval["day"] = "day";
    Interval["week"] = "week";
    Interval["month"] = "month";
    Interval["year"] = "year";
    Interval["ALL"] = "ALL";
})(Interval || (Interval = {}));
var QueryTaype;
(function (QueryTaype) {
    QueryTaype["QUERY"] = "query";
})(QueryTaype || (QueryTaype = {}));
export class SqlInterface {
    adapter;
    log;
    sqlInstance;
    dbName;
    constructor(adapter) {
        this.adapter = adapter;
        this.log = adapter.log;
        this.sqlInstance = adapter.config.sqlInstance;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.getDatabaseName();
    }
    async getDatabaseName() {
        const logPrefix = '[getDatabaseName]:';
        try {
            const sqlObj = await this.adapter.getForeignObjectAsync(`system.adapter.${this.sqlInstance}`);
            if (sqlObj && sqlObj.native && sqlObj.native.dbname) {
                this.dbName = sqlObj.native.dbname;
                this.log.debug(`${logPrefix} database name: ${this.dbName}`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async getCounter(item, interval) {
        const logPrefix = `[getCounter] [${interval}] - '${item.idSql}':`;
        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM ${this.dbName}.datapoints
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
                    FROM ${this.dbName}.ts_bool
                    WHERE id = (SELECT id FROM dp)
                    ${item.sqlWhereAppend ? item.sqlWhereAppend : ''}
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
                }
                else {
                    if (interval === Interval.ALL) {
                        // can only have one row
                        if (data.result.length === 1) {
                            return data.result[0];
                        }
                        else {
                            this.log.error(`${logPrefix} unexpected number of data rows: ${data.result.length} (data: ${JSON.stringify(data.result)})`);
                            return null;
                        }
                    }
                    else {
                        return data.result;
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
    async retrieve(queryType, query, item, logP) {
        const logPrefix = `[retrieve] ${logP}`;
        try {
            const sqlAlive = await this.adapter.getForeignStateAsync(`system.adapter.${this.sqlInstance}.alive`);
            if (sqlAlive?.val) {
                const now = moment();
                const data = await this.adapter.sendToAsync(this.sqlInstance, queryType, query)
                    .catch((result) => {
                    this.log.error(`${logPrefix} sql error: ${result}`);
                    return null;
                });
                this.adapter.itemDebug(item, `${logPrefix} duration: ${moment().diff(now, 'milliseconds') / 1000}s, data: ${JSON.stringify(data)}`);
                return data;
            }
            else {
                this.log.error(`${logPrefix} SQL instance '${this.sqlInstance}' is not alive`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
}
