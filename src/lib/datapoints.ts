import * as mathjs from 'mathjs'

import * as objectHandler from './objectHandler.js';
import { Interval, SqlCounter } from './sqlInterface.js';
import * as helper from './helper.js';


export class Datapoints {
    private logPrefix: string = 'Datapoints'

    private adapter: ioBroker.myAdapter;
    private utils: typeof import("@iobroker/adapter-core")
    private log: ioBroker.Logger;

    public idTotal = 'total';
    public idOldValue = 'oldValue';
    private idStorageValue = 'storageValue';
    public idBooleanValue = 'value'

    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core")) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }

    public async init(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.init]`

        try {
            await this.createStates(true);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public getByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.DatapointsItem {
        return Object.values(this.adapter.sourceToDatapoint).find(
            item => item.idChannelTarget === helper.getIdWithoutLastPart(idTarget)
        );
    }

    private async createStates(isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createStates]:`

        try {
            const list = [...this.adapter.config.datapointsNumberList, ...this.adapter.config.datapointsBooleanList];

            if (list && list.length > 0) {
                for (const item of list) {
                    const structure = item.idChannelTarget.split('.');

                    let idChannel = '';
                    for (const id of structure) {
                        if (!idChannel) {
                            idChannel = id;
                        } else {
                            idChannel = `${idChannel}.${id}`;
                        }

                        // ToDo: indcators onlineId, errorId probably implementation
                        if (structure.indexOf(id) !== structure.length - 1) {
                            await objectHandler.createChannel(this.adapter, this.utils, idChannel, id);
                        } else {
                            await objectHandler.createChannel(this.adapter, this.utils, idChannel, item.name || id);
                        }
                    }

                    await this.createState(idChannel, item, isAdapterStart);
                }
            }

            this.log.debug(`${logPrefix} finished creating datapoints for configured sources: ${JSON.stringify(this.adapter.sourceToDatapoint)}`);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createState(idChannel: string, item: ioBroker.AdapterConfigTypes.DatapointsItem, isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createState] - '${idChannel}':`

        try {
            if (await this.adapter.foreignObjectExists(item.idSource)) {
                const sourceObj = await this.adapter.getForeignObjectAsync(item.idSource);
                const sourceState = await this.adapter.getForeignStateAsync(item.idSource);

                if (sourceObj?.common.type === 'number') {
                    await this.createStateNumber(idChannel, item, isAdapterStart, sourceObj, sourceState);

                } else if (sourceObj?.common.type === 'boolean') {
                    await this.createStateBoolean(idChannel, item, isAdapterStart, sourceObj, sourceState);

                } else {
                    this.log.error(`${logPrefix} source state '${item.idSource}' has unsupported type '${sourceObj?.common.type}', cannot processing functions for '${item.name}'`);
                }

            } else {
                this.log.warn(`${logPrefix} source state '${item.idSource}' does not exist, cannot processing functions for '${item.name}' ('${idChannel}')`);
                item.enable = false;
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createStateNumber(idChannel: string, item: ioBroker.AdapterConfigTypes.DatapointsItem, isAdapterStart: boolean, sourceObj: ioBroker.Object, sourceState: ioBroker.State): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createStateNumber] - '${idChannel}':`

        try {
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idTotal}`, 'cumulative total value', sourceState.val, sourceObj?.common as ioBroker.StateCommon, item, true, false);

            // oldValue & storageValue must have the same value as total at state creation
            const totalState = await this.adapter.getStateAsync(`${idChannel}.${this.idTotal}`);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idOldValue}`, 'old meter reading', totalState.val, sourceObj?.common as ioBroker.StateCommon, item, true, true);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idStorageValue}`, 'helper cumulative total value', totalState.val, sourceObj?.common as ioBroker.StateCommon, item, false, true);

            if (item.enable) {
                item.type = sourceObj?.common.type;
                this.adapter.sourceToDatapoint[item.idSource] = item;
                this.adapter.sourceToDatapoint[item.idSource].type = sourceObj?.common.type;
                this.adapter.sourceToDatapoint[item.idSource].idSql = `${idChannel}.${this.idTotal}`;

                await this.adapter.subscribeForeignStatesAsync(item.idSource);
                await this.adapter.subscribeStatesAsync(`${idChannel}.${this.idTotal}`);

                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idTotal}`);
                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idOldValue}`);

                if (isAdapterStart) {
                    // beim Start des Adapter's die Werte aktualisieren
                    await this.updateStateNumber(item, item.idSource, sourceState, isAdapterStart);

                    // old value nach verarbeiteter Änderung setzen, hier da fkt return hat
                    await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idOldValue}`, sourceState);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createStateBoolean(idChannel: string, item: ioBroker.AdapterConfigTypes.DatapointsItem, isAdapterStart: boolean, sourceObj: ioBroker.Object, sourceState: ioBroker.State): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createStateBoolean] - '${idChannel}':`

        try {
            const common: ioBroker.StateCommon = {
                name: 'total number',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            };

            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idTotal}`, 'total number', 0, common, item, false, false);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBooleanValue}`, 'value', sourceState.val, sourceObj?.common as ioBroker.StateCommon, item, true, true);

            if (item.enable) {
                this.adapter.sourceToDatapoint[item.idSource] = item;
                this.adapter.sourceToDatapoint[item.idSource].type = sourceObj?.common.type;
                this.adapter.sourceToDatapoint[item.idSource].idSql = `${idChannel}.${this.idBooleanValue}`;

                await this.adapter.subscribeForeignStatesAsync(item.idSource);
                await this.adapter.subscribeStatesAsync(`${idChannel}.${this.idTotal}`);    // react on total changes is needed, because it's changed from the adapter

                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idTotal}`);
                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idBooleanValue}`);

                await this.updateStateBoolean(item, `${idChannel}.${this.idBooleanValue}`, sourceState, isAdapterStart);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateStateNumber(item: ioBroker.AdapterConfigTypes.DatapointsItem, idSource: string, sourceState: ioBroker.State, force: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateStateNumber] [${item.idChannelTarget}]:`

        try {
            if (item.enable) {
                const oldState = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idOldValue}`);

                if (sourceState.val !== null || oldState.val !== null) {

                    sourceState.val = sourceState.val as number;
                    oldState.val = oldState.val as number;

                    // entprellen
                    const storageState = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idStorageValue}`);
                    storageState.val = storageState.val as number;

                    let delta = 0;

                    if ((oldState.val > storageState.val)) {
                        // Rückfalllösung, wenn z.B. Skript oder LXC beendet wurde / crasht
                        delta = (sourceState.val - storageState.val);
                        this.adapter.itemDebug(item, `${logPrefix} calculated delta from storage: (val: ${sourceState.val} - storageVal: ${storageState.val}) = ${mathjs.round(delta, 5)}`);
                    } else {
                        delta = (sourceState.val - oldState.val);
                        this.adapter.itemDebug(item, `${logPrefix} calculated delta: (val: ${sourceState.val} - oldVal: ${oldState.val}) = ${mathjs.round(delta, 5)}`);
                    }

                    if (delta >= item.maxDelta && item.maxDelta !== 0) {
                        // wenn delta > maxDelta ist, wird ignoriert (kann z.B. bei springenden Scale Faktoren passieren)
                        this.log.warn(`${logPrefix} delta ${mathjs.round(delta, 5)} is bigger than configured max. delta ${item.maxDelta} (val: ${sourceState.val}, oldVal: ${oldState.val}, storageVal: ${storageState.val}) -> ignore on this run`);
                        return;
                    }

                    if (item.ignoreReset) {
                        if (delta <= 0) {
                            // delta ist kleiner 0, d.h. Wert liegt unter altem Wert
                            if (delta === 0 && !this.adapter.initComplete) {
                                // suppress login at adapter start, if value not changed
                                return;
                            }

                            this.log.warn(`${logPrefix} delta ${mathjs.round(delta, 5)} is <= 0 and ignore reset is active (val: ${sourceState.val}, oldVal: ${oldState.val}, storageVal: ${storageState.val}) -> ignore on this run`);

                            return;
                        } else if (oldState.val < storageState.val) {
                            // solange oldVal nicht über altem gespeichertem Wert liegt wird ignoriert
                            this.log.warn(`${logPrefix} oldVal ${oldState.val} < storageVal ${storageState.val} and ignore reset is active (val: ${sourceState.val}, oldVal: ${oldState.val}, storageVal: ${storageState.val}) -> ignore on this run`);
                            return;
                        }
                    }

                    const total = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idTotal}`);
                    total.val = total.val as number;

                    const sum = mathjs.round((total.val + delta), 3);

                    if (sum >= total.val) {
                        if (item.ignoreReset) {
                            // double check für ignore reset - neuer Gesamtwert darf nicht unter dem in der DB liegen
                            const oldValInDatabase = await this.adapter.sql.getLastValue(item, logPrefix);

                            if (oldValInDatabase && sum < oldValInDatabase) {
                                this.log.warn(`${logPrefix} new total value ${sum} is lower than value in database ${oldValInDatabase} (val: ${sourceState.val}, oldVal: ${oldState.val}, delta: ${mathjs.round(delta, 5)}) -> ignore on this run`);
                                return;
                            }
                        }

                        await this.adapter.setState(`${item.idChannelTarget}.${this.idTotal}`, sum, true);
                        this.adapter.itemDebug(item, `${logPrefix} set new total value: (old total: ${total.val} + delta: ${mathjs.round(delta, 5)}) = ${sum}`);

                    } else {
                        this.log.warn(`${logPrefix} calculated new total value ${sum} is lower than oldVal ${oldState.val} (val: ${sourceState.val}, oldVal: ${oldState.val}, storageVal: ${storageState.val}, delta: ${mathjs.round(delta, 5)}) -> got a reset`);
                    }

                    await this.adapter.setState(`${item.idChannelTarget}.${this.idStorageValue}`, sum, true);

                    // old value nach verarbeiteter Änderung setzen, hier da fkt return hat
                    await this.adapter.setState(`${item.idChannelTarget}.${this.idOldValue}`, sourceState);

                } else {
                    console.warn(`${logPrefix} val / oldVal is null (val: ${sourceState.val} oldVal: ${oldState.val})' -> ignore values on this run`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateStateBoolean(item: ioBroker.AdapterConfigTypes.DatapointsItem, idSource: string, sourceState: ioBroker.State, force: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateStateBoolean] - '${idSource}':`

        try {
            const idTarget = `${item.idChannelTarget}.${this.idBooleanValue}`

            if (item.enable) {
                const targetState = await this.adapter.getStateAsync(idTarget);

                if (sourceState.val !== targetState.val || force) {
                    // nur ausführen, wenn sich der Wert / ack auch geändert hat
                    if (this.adapter.timeoutDebounceList[idSource]) {
                        this.adapter.clearTimeout(this.adapter.timeoutDebounceList[idSource]);
                    }

                    this.adapter.timeoutDebounceList[idSource] = this.adapter.setTimeout(async () => {
                        // we need a timeout, because sql need some time to write the new value in the database
                        const counter = (await this.adapter.sql.getCounter(item, Interval.ALL, `'${item.idChannelTarget}.${this.idTotal}'`));
                        if (counter) {
                            await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idTotal}`, { val: counter.count, lc: sourceState.lc, ack: true });
                        }

                        this.adapter.clearTimeout(this.adapter.timeoutDebounceList[idSource]);
                        delete this.adapter.timeoutDebounceList[idSource];

                    }, (this.adapter.config.sqlWriteTimeout || 5000));
                }
            }

            if (force) {
                // prevent sql adapter errors caused by duplicate entries
                await this.adapter.setStateChangedAsync(idTarget, sourceState);
            } else {
                await this.adapter.setState(idTarget, sourceState);
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async onObjectChange(id: string): Promise<void> {
        const logPrefix = `[${this.logPrefix}.onObjectChange] - '${id}':`

        try {
            this.log.error(`${logPrefix} changing object '${id}' is not allowed, please use the adapter configuration! Changes will be undone !`);

            const idChannel = id.replace(`${this.adapter.namespace}.`, '').replace(`.${this.idTotal}`, '').replace(`.${this.idOldValue}`, '').replace(`.${this.idBooleanValue}`, '');

            const item = this.adapter.config.datapointsNumberList.find(i => i.idChannelTarget === idChannel) || this.adapter.config.datapointsBooleanList.find(i => i.idChannelTarget === idChannel);

            await this.createState(idChannel, item, false);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async onStateChange(item: ioBroker.AdapterConfigTypes.DatapointsItem, id: string, state: ioBroker.State): Promise<void> {
        const logPrefix = `[${this.logPrefix}.onStateChange] - '${id}':`

        try {
            if (item.type === 'number') {
                await this.updateStateNumber(item, id, state);
            } else if (item.type === 'boolean') {
                await this.updateStateBoolean(item, id, state);

            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public saveStatesToDatabase(): void {
        const logPrefix = `[${this.logPrefix}.saveStatesToDatabase]':`

        try {
            const list = [...this.adapter.config.datapointsNumberList, ...this.adapter.config.datapointsBooleanList];

            if (list && list.length > 0) {
                for (const item of list) {
                    if (item.enable) {
                        void this.saveStateToDatabase(item);
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Write item asynchronously to database at day change
     * 
     * @param item Datapoint item
     */
    private async saveStateToDatabase(item: ioBroker.AdapterConfigTypes.DatapointsItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.saveStateToDatabase]':`

        try {
            const state = await this.adapter.getStateAsync(item.idSql);

            this.adapter.log.info(`${logPrefix} save state to database: ${item.idSql}`);

            void this.adapter.sql.storeState(item, state);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}