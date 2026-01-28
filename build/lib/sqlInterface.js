import moment from "moment";
export var Interval;
(function (Interval) {
    Interval["day"] = "day";
    Interval["week"] = "week";
    Interval["month"] = "month";
    Interval["year"] = "year";
    Interval["ALL"] = "ALL";
})(Interval || (Interval = {}));
var QueryType;
(function (QueryType) {
    QueryType["QUERY"] = "query";
    QueryType["STORESTATE"] = "storeState";
})(QueryType || (QueryType = {}));
export class SqlInterface {
    logPrefix = 'SqlInterface';
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
        const logPrefix = `[${this.logPrefix}.getDatabaseName]:`;
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
    async getCounter(item, interval, logPrefixAppend, timestampStart = 0, timestampEnd = 0) {
        const logPrefix = `[${this.logPrefix}.getCounter] ${logPrefixAppend}:`;
        try {
            const query = `
                WITH dp AS (
                    SELECT id
                    FROM ${this.dbName}.datapoints
                    WHERE name = '${this.adapter.namespace}.${item.idSql}'
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
            this.adapter.itemDebug(item, `${logPrefix} start: ${moment(timestampStart).format('DD.MM.YYYY - HH:mm')}, end: ${moment(timestampEnd).format('DD.MM.YYYY - HH:mm')}, query: ${query}`);
            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);
            if (data) {
                // can only have one row
                if (data.length === 1) {
                    return data[0];
                }
                else {
                    this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                    return null;
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
    async getTotal(item, interval, timestampStart, timestampEnd, logPrefixAppend) {
        const logPrefix = `[${this.logPrefix}.getTotal] ${logPrefixAppend}:`;
        try {
            const query = `
                WITH dp AS (
                SELECT id
                FROM ${this.dbName}.datapoints
                WHERE name = '${this.adapter.namespace}.${item.id}'
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
            this.adapter.itemDebug(item, `${logPrefix} start: ${moment(timestampStart).format('DD.MM.YYYY - HH:mm')}, end: ${moment(timestampEnd).format('DD.MM.YYYY - HH:mm')}, query: ${query}`);
            const data = await this.retrieve(QueryType.QUERY, query, item, logPrefixAppend);
            if (data) {
                if (interval) {
                    // can only have one row as result
                    if (data.length === 1) {
                        return data[0];
                    }
                    else {
                        this.log.error(`${logPrefix} unexpected number of data rows: ${data.length} (data: ${JSON.stringify(data)})`);
                        return null;
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
    async storeState(item, state) {
        const logPrefix = `[${this.logPrefix}.storeState] - '${item.idSql}':`;
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
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async retrieve(queryType, query, item, logPrefixAppend) {
        const logPrefix = `[${this.logPrefix}.retrieve] ${logPrefixAppend}:`;
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
                this.adapter.itemDebug(item, `${logPrefix} duration: ${moment().diff(now, 'milliseconds') / 1000}s, data: ${JSON.stringify(data)}`);
                if (data.error) {
                    this.log.error(`${logPrefix} data error: ${data.error}`);
                    return null;
                }
                else {
                    if (data && (data.result || data.success)) {
                        return data.result;
                    }
                    else {
                        this.log.error(`${logPrefix} no result exists in data: ${JSON.stringify(data)}`);
                    }
                }
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
