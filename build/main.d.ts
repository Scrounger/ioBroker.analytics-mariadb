import * as utils from '@iobroker/adapter-core';
import { Job } from 'node-schedule';
import { SqlInterface } from './lib/sqlInterface.js';
import { History } from './lib/history.js';
import { Datapoints } from './lib/datapoints.js';
import { Costs } from './lib/costs.js';
import { Billing } from './lib/billing.js';
declare class AnalyticsMariadb extends utils.Adapter {
    sourceToDatapoint: Record<string, ioBroker.AdapterConfigTypes.DatapointsItem>;
    timeoutDebounceList: Record<string, ioBroker.Timeout>;
    idTotal: string;
    idOldValue: string;
    idStorageValue: string;
    idBooleanValue: string;
    sql: SqlInterface;
    datapoints: Datapoints;
    history: History;
    costs: Costs;
    billing: Billing;
    scheduleUpdateHistoryAtDayChange: Job;
    scheduleSaveValueBeforeDayChange: Job;
    scheduleSaveValueAfterDayChange: Job;
    initComplete: boolean;
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload;
    private onObjectChange;
    /**
     * Is called if a subscribed state changes
     *
     * @param id - State ID
     * @param state - State object
     */
    private onStateChange;
    private isBetweenDayChange;
    private onMessage;
    itemDebug(item: ioBroker.AdapterConfigTypes.DatapointsItem | ioBroker.AdapterConfigTypes.HistoryItem | ioBroker.AdapterConfigTypes.CostContractType, message: string): void;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): AnalyticsMariadb;
export {};
