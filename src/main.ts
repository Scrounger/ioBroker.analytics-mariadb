/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import * as mathjs from 'mathjs'

// Load your modules here, e.g.:
// import * as fs from 'fs';
import * as objectHandler from './lib/objectHandler.js';

class AnalyticsMariadb extends utils.Adapter {

    sourceToTarget: Record<string, ioBroker.AdapterConfigTypes.DatapointsItem> = {};

    idTotal = 'total';
    idOldValue = 'oldValue';
    idStorageValue = 'storageValue';
    idBooleanValue = 'value'

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'analytics-mariadb',
            useFormatDate: true
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        const logPrefix = '[onReady]:';

        try {
            if (this.config.sqlInstance) {
                moment.locale(this.language);
                await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

                await this.createDatapointsTotal(true);


            } else {
                this.log.error(`${logPrefix} No SQL instance configured in adapter configuration!`);
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        const logPrefix = '[onObjectChange]:';

        try {
            if (obj && !obj.from.includes(this.namespace)) {
                // if objects changed outside of this adapter

                if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOldValue}`)) {
                    this.log.error(`${logPrefix} changing object '${id}' is not allowed, please use the adapter configuration! Changes will be undone !`);

                    const idChannel = id.replace(`${this.namespace}.`, '').replace(`.${this.idTotal}`, '').replace(`.${this.idOldValue}`, '');
                    const item = this.config.datapointsNumberList.find(i => i.idChannelTarget === idChannel);

                    await this.createDatapointsTotalSingle(idChannel, item, false);

                } else {
                    // The object was changed
                    this.log.warn(`object ${id} changed: ${JSON.stringify(obj)}`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id - State ID
     * @param state - State object
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        const logPrefix = '[onStateChange]:';

        try {

            if (state) {
                if (!state.from.includes(this.namespace)) {
                    // if state changed outside of this adapter

                    const item = this.sourceToTarget[id];

                    if (item) {
                        if (item.type === 'number') {
                            await this.totalChanges(item, id, state);

                            await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idOldValue}`, state);
                        } else if (item.type === 'boolean') {
                            // currently no processing for boolean values

                        }
                    } else {
                        this.log.warn(`${logPrefix} state '${id}' changed but is not in configured source list, ignoring change.`);
                    }
                }

                // // The state was changed
                // this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

                // if (state.ack === false) {
                //     // This is a command from the user (e.g., from the UI or other adapter)
                //     // and should be processed by the adapter
                //     this.log.info(`User command received for ${id}: ${state.val}`);

                //     // TODO: Add your control logic here
                // }
            } else {
                // The object was deleted or the state value has expired
                this.log.info(`state ${id} deleted`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires 'common.messagebox' property to be set to true in io-package.json
    //  */
    //
    private onMessage(obj: ioBroker.Message): void {
        const logPrefix = '[onMessage]:';

        try {
            if (typeof obj === 'object') {
                if (obj.command === 'getDatapointsNumberSqlPresetsList') {
                    const result = this.config.datapointsSqlPresetsList.filter(p => p.type === 'number').map(p => p.idPreset);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else if (obj.command === 'getDatapointsBooleanSqlPresetsList') {
                    const result = this.config.datapointsSqlPresetsList.filter(p => p.type === 'boolean').map(p => p.idPreset);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else if (obj.command === 'getDatapointsList') {
                    const numberLists = this.config.datapointsNumberList.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idTotal}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idTotal})` : `${item.idChannelTarget}.${this.idTotal}`
                        }
                    });

                    const booleanLists = this.config.datapointsBooleanList.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idBooleanValue}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idBooleanValue})` : `${item.idChannelTarget}.${this.idBooleanValue}`
                        }
                    });

                    const result = [...numberLists, ...booleanLists];

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else {
                    this.log.warn(`${logPrefix} Unknown command: ${JSON.stringify(obj)}`);
                }
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createDatapointsTotal(isAdapterStart: boolean): Promise<void> {
        const logPrefix = '[createDatapointsTotal]:';

        try {
            if (this.config.datapointsNumberList && this.config.datapointsNumberList.length > 0) {
                for (const item of this.config.datapointsNumberList) {
                    const structure = item.idChannelTarget.split('.');

                    let idChannel = '';
                    for (const id of structure) {
                        if (!idChannel) {
                            idChannel = id;
                        } else {
                            idChannel = `${idChannel}.${id}`;
                        }

                        if (structure.indexOf(id) !== structure.length - 1) {
                            await objectHandler.createChannel(this, idChannel, id);
                        } else {
                            await objectHandler.createChannel(this, idChannel, item.name || id);
                        }
                    }

                    await this.createDatapointsTotalSingle(idChannel, item, isAdapterStart);
                }

                this.log.debug(`${logPrefix} finished creating datapoints for configured sources: ${JSON.stringify(this.sourceToTarget)}`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createDatapointsTotalSingle(idChannel: string, item: ioBroker.AdapterConfigTypes.DatapointsItem, isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[createDatapointsTotalSingle] - ${idChannel}:`;

        try {
            if (await this.foreignObjectExists(item.idSource)) {
                const sourceObj = await this.getForeignObjectAsync(item.idSource);
                const sourceState = await this.getForeignStateAsync(item.idSource);

                await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idTotal}`, 'cumulative total value', sourceState.val, sourceObj?.common as ioBroker.StateCommon, item, true, false);

                // oldValue & storageValue must have the same value as total at state creation
                const totalState = await this.getStateAsync(`${idChannel}.${this, this.idTotal}`);
                await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idOldValue}`, 'old meter reading', totalState.val, sourceObj?.common as ioBroker.StateCommon, item, false, true);
                await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idStorageValue}`, 'helper cumulative total value', totalState.val, sourceObj?.common as ioBroker.StateCommon, item, false, true);

                if (item.enable) {
                    this.sourceToTarget[item.idSource] = item;
                    this.sourceToTarget[item.idSource].type = sourceObj?.common.type;

                    await this.subscribeForeignStatesAsync(item.idSource);

                    await this.subscribeObjectsAsync(`${idChannel}.${this, this.idTotal}`);
                    await this.subscribeObjectsAsync(`${idChannel}.${this, this.idOldValue}`);

                    if (isAdapterStart) {
                        // beim Start des Adapter's die Werte aktualisieren
                        await this.totalChanges(item, item.idSource, sourceState);

                        await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idOldValue}`, sourceState);
                    }
                }
            } else {
                this.log.warn(`${logPrefix} source state '${item.idSource}' does not exist, cannot processing functions for '${item.name}' ('${idChannel}')`);
                item.enable = false;
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async totalChanges(item: ioBroker.AdapterConfigTypes.DatapointsItem, idState: string, state: ioBroker.State): Promise<void> {
        const logPrefix = `[totalChanges] '${idState}': `;

        try {
            if (item.enable) {
                const total = await this.getStateAsync(`${item.idChannelTarget}.${this.idTotal}`);
                const oldState = await this.getStateAsync(`${item.idChannelTarget}.${this.idOldValue}`);

                if (state.val !== null || oldState.val !== null) {
                    total.val = total.val as number;
                    state.val = state.val as number;
                    oldState.val = oldState.val as number;

                    if (state.lc - total.lc > this.config.totalDebounceTime * 1000) {
                        // entprellen
                        const storageState = await this.getStateAsync(`${item.idChannelTarget}.${this.idStorageValue}`);
                        storageState.val = storageState.val as number;

                        let delta = 0;

                        if ((oldState.val > storageState.val)) {
                            // Rückfalllösung, wenn z.B. Skript oder LXC beendet wurde / crasht
                            delta = (state.val - storageState.val);
                            this.debug(item, `${logPrefix} calculated delta from storage: (val: ${state.val} - storageVal: ${storageState.val}) = ${mathjs.round(delta, 5)}`);
                        } else {
                            delta = (state.val - oldState.val);
                            this.debug(item, `${logPrefix} calculated delta: (val: ${state.val} - oldVal: ${oldState.val}) = ${mathjs.round(delta, 5)}`);
                        }

                        if (delta >= item.maxDelta && item.maxDelta !== 0) {
                            // wenn delta > maxDelta ist, wird ignoriert (kann z.B. bei springenden Scale Faktoren passieren)
                            this.log.warn(`${logPrefix} delta ${mathjs.round(delta, 5)} is bigger than configured max. delta ${item.maxDelta} (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}) -> ignore on this run`);
                            return;
                        }

                        if (item.ignoreReset) {
                            if (delta <= 0) {
                                // delta ist kleiner 0, d.h. Wert liegt unter altem Wert
                                this.log.warn(`${logPrefix} delta ${mathjs.round(delta, 5)} is <= 0 and ignore reset is active (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}) -> ignore on this run`);
                                return;
                            } else if (oldState.val < storageState.val) {
                                // solange oldVal nicht über altem gespeichertem Wert liegt wird ignoriert
                                this.log.warn(`${logPrefix} oldVal ${oldState.val} < storageVal ${storageState.val} and ignore reset is active (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}) -> ignore on this run`);
                                return;
                            }
                        }

                        const sum = mathjs.round((total.val + delta), 3);

                        if (sum >= total.val) {
                            await this.setState(`${item.idChannelTarget}.${this.idTotal}`, sum, true);
                            this.debug(item, `${logPrefix} set new total value: (old total: ${total.val} + delta: ${mathjs.round(delta, 5)}) = ${sum}`);
                        } else {
                            this.log.warn(`${logPrefix} calculated new total value ${sum} is lower than oldVal ${oldState.val} (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}, delta: ${mathjs.round(delta, 5)}) -> got a reset`);
                        }

                        await this.setState(`${item.idChannelTarget}.${this.idStorageValue}`, sum, true);
                    }
                } else {
                    console.warn(`${logPrefix} val / oldVal is null (val: ${state.val} oldVal: ${total.val})' -> ignore values on this run`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private debug(item: ioBroker.AdapterConfigTypes.DatapointsItem, message: string): void {
        if (item.debug) {
            this.log.debug(message);
        }
    }
}

// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');

if (process.argv[1] === modulePath) {
    // start the instance directly
    new AnalyticsMariadb();
}

export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): AnalyticsMariadb {
    // compact mode
    return new AnalyticsMariadb(options);
}
