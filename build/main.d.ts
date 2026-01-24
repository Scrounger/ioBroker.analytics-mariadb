import * as utils from '@iobroker/adapter-core';
import { SqlInterface } from './lib/sqlInterface.js';
declare class AnalyticsMariadb extends utils.Adapter {
    sourceToTarget: Record<string, ioBroker.AdapterConfigTypes.DatapointsItem>;
    idTotal: string;
    idOldValue: string;
    idStorageValue: string;
    idBooleanValue: string;
    idChannelHistory: string;
    sql: SqlInterface;
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
    private onMessage;
    private createDatapointsTotal;
    private createDatapointsTotalSingle;
    private totalChanges;
    private createDatapointsHistory;
    private updateNamesOfDatapointsHistory;
    private _updateNamesOfDatapointsHistory;
    itemDebug(item: ioBroker.AdapterConfigTypes.DatapointsItem, message: string): void;
}
export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): AnalyticsMariadb;
export {};
