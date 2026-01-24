/*
 * Created with @iobroker/create-adapter v3.1.2
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import * as mathjs from 'mathjs';
// Load your modules here, e.g.:
// import * as fs from 'fs';
import * as objectHandler from './lib/objectHandler.js';
import { Interval, SqlInterface } from './lib/sqlInterface.js';
import * as helper from './lib/helper.js';
class AnalyticsMariadb extends utils.Adapter {
    sourceToTarget = {};
    idTotal = 'total';
    idOldValue = 'oldValue';
    idStorageValue = 'storageValue';
    idBooleanValue = 'value';
    idChannelHistory = 'history';
    sql;
    constructor(options = {}) {
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
    async onReady() {
        const logPrefix = '[onReady]:';
        try {
            if (this.config.sqlInstance) {
                moment.locale(this.language);
                await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);
                this.sql = new SqlInterface(this);
                await this.createDatapointsTotal(true);
                this.log.debug(`${logPrefix} finished creating datapoints for configured sources: ${JSON.stringify(this.sourceToTarget)}`);
                await this.createDatapointsHistory(true);
                await this.updateNamesOfDatapointsHistory();
            }
            else {
                this.log.error(`${logPrefix} No SQL instance configured in adapter configuration!`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            callback();
        }
        catch (error) {
            this.log.error(`Error during unloading: ${error.message}`);
            callback();
        }
    }
    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    async onObjectChange(id, obj) {
        const logPrefix = '[onObjectChange]:';
        try {
            if (obj && !obj.from.includes(this.namespace)) {
                // if objects changed outside of this adapter
                if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOldValue}`) || id.endsWith(`.${this.idBooleanValue}`)) {
                    this.log.error(`${logPrefix} changing object '${id}' is not allowed, please use the adapter configuration! Changes will be undone !`);
                    const idChannel = id.replace(`${this.namespace}.`, '').replace(`.${this.idTotal}`, '').replace(`.${this.idOldValue}`, '').replace(`.${this.idBooleanValue}`, '');
                    const item = this.config.datapointsNumberList.find(i => i.idChannelTarget === idChannel) || this.config.datapointsBooleanList.find(i => i.idChannelTarget === idChannel);
                    await this.createDatapointsTotalSingle(idChannel, item, false);
                }
                else {
                    // The object was changed
                    this.log.warn(`object ${id} changed: ${JSON.stringify(obj)}`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    /**
     * Is called if a subscribed state changes
     *
     * @param id - State ID
     * @param state - State object
     */
    async onStateChange(id, state) {
        const logPrefix = '[onStateChange]:';
        try {
            if (state) {
                if (!state.from.includes(this.namespace)) {
                    // if state changed outside of this adapter
                    const item = this.sourceToTarget[id];
                    if (item) {
                        if (item.type === 'number') {
                            await this.totalChanges(item, id, state);
                            await this.setState(`${item.idChannelTarget}.${this.idOldValue}`, state);
                        }
                        else if (item.type === 'boolean') {
                            // currently no processing for boolean values
                            await this.setState(`${item.idChannelTarget}.${this.idBooleanValue}`, state);
                            const counter = (await this.sql.getCounter(item, Interval.ALL));
                            if (counter) {
                                await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idTotal}`, counter.count, true);
                            }
                        }
                    }
                    else {
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
            }
            else {
                // The object was deleted or the state value has expired
                this.log.info(`state ${id} deleted`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires 'common.messagebox' property to be set to true in io-package.json
    //  */
    //
    onMessage(obj) {
        const logPrefix = '[onMessage]:';
        try {
            if (typeof obj === 'object') {
                if (obj.command === 'getDatapointsNumberSqlPresetsList') {
                    const result = this.config.datapointsSqlPresetsList.filter(p => p.type === 'number').map(p => p.idPreset);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getDatapointsBooleanSqlPresetsList') {
                    const result = this.config.datapointsSqlPresetsList.filter(p => p.type === 'boolean').map(p => p.idPreset);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getDatapointsList') {
                    const numberLists = this.config.datapointsNumberList.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idTotal}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idTotal})` : `${item.idChannelTarget}.${this.idTotal}`
                        };
                    });
                    const booleanLists = this.config.datapointsBooleanList.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idBooleanValue}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idBooleanValue})` : `${item.idChannelTarget}.${this.idBooleanValue}`
                        };
                    });
                    const result = [...numberLists, ...booleanLists];
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else {
                    this.log.warn(`${logPrefix} Unknown command: ${JSON.stringify(obj)}`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createDatapointsTotal(isAdapterStart) {
        const logPrefix = '[createDatapointsTotal]:';
        try {
            const list = [...this.config.datapointsNumberList, ...this.config.datapointsBooleanList];
            if (list && list.length > 0) {
                for (const item of list) {
                    const structure = item.idChannelTarget.split('.');
                    let idChannel = '';
                    for (const id of structure) {
                        if (!idChannel) {
                            idChannel = id;
                        }
                        else {
                            idChannel = `${idChannel}.${id}`;
                        }
                        if (structure.indexOf(id) !== structure.length - 1) {
                            await objectHandler.createChannel(this, utils, idChannel, id);
                        }
                        else {
                            await objectHandler.createChannel(this, utils, idChannel, item.name || id);
                        }
                    }
                    await this.createDatapointsTotalSingle(idChannel, item, isAdapterStart);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createDatapointsTotalSingle(idChannel, item, isAdapterStart) {
        const logPrefix = `[createDatapointsTotalSingle] - ${idChannel}:`;
        try {
            if (await this.foreignObjectExists(item.idSource)) {
                const sourceObj = await this.getForeignObjectAsync(item.idSource);
                const sourceState = await this.getForeignStateAsync(item.idSource);
                if (sourceObj?.common.type === 'number') {
                    await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idTotal}`, 'cumulative total value', sourceState.val, sourceObj?.common, item, true, false);
                    // oldValue & storageValue must have the same value as total at state creation
                    const totalState = await this.getStateAsync(`${idChannel}.${this, this.idTotal}`);
                    await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idOldValue}`, 'old meter reading', totalState.val, sourceObj?.common, item, false, true);
                    await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idStorageValue}`, 'helper cumulative total value', totalState.val, sourceObj?.common, item, false, true);
                    if (item.enable) {
                        this.sourceToTarget[item.idSource] = item;
                        this.sourceToTarget[item.idSource].type = sourceObj?.common.type;
                        this.sourceToTarget[item.idSource].idSql = `${this.namespace}.${idChannel}.${this, this.idTotal}`;
                        await this.subscribeForeignStatesAsync(item.idSource);
                        await this.subscribeObjectsAsync(`${idChannel}.${this, this.idTotal}`);
                        await this.subscribeObjectsAsync(`${idChannel}.${this, this.idOldValue}`);
                        if (isAdapterStart) {
                            // beim Start des Adapter's die Werte aktualisieren
                            await this.totalChanges(item, item.idSource, sourceState);
                            // old value nach verarbeiteter Änderung setzen
                            await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idOldValue}`, sourceState);
                        }
                    }
                }
                else if (sourceObj?.common.type === 'boolean') {
                    const common = {
                        name: 'total number',
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                    };
                    await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idTotal}`, 'total number', 0, common, item, false, false);
                    await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idBooleanValue}`, 'value', sourceState.val, sourceObj?.common, item, true, true);
                    if (item.enable) {
                        this.sourceToTarget[item.idSource] = item;
                        this.sourceToTarget[item.idSource].type = sourceObj?.common.type;
                        this.sourceToTarget[item.idSource].idSql = `${this.namespace}.${idChannel}.${this, this.idBooleanValue}`;
                        await this.subscribeForeignStatesAsync(item.idSource);
                        await this.subscribeObjectsAsync(`${idChannel}.${this, this.idTotal}`);
                        await this.subscribeObjectsAsync(`${idChannel}.${this, this.idBooleanValue}`);
                        if (isAdapterStart) {
                            // beim Start des Adapter's die Werte aktualisieren
                            await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idBooleanValue}`, sourceState);
                            const counter = (await this.sql.getCounter(item, Interval.ALL));
                            if (counter) {
                                await this.setStateChangedAsync(`${item.idChannelTarget}.${this.idTotal}`, counter.count, true);
                            }
                        }
                    }
                }
                else {
                    this.log.error(`${logPrefix} source state '${item.idSource}' has unsupported type '${sourceObj?.common.type}', cannot processing functions for '${item.name}'`);
                }
            }
            else {
                this.log.warn(`${logPrefix} source state '${item.idSource}' does not exist, cannot processing functions for '${item.name}' ('${idChannel}')`);
                item.enable = false;
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async totalChanges(item, idState, state) {
        const logPrefix = `[totalChanges] '${idState}': `;
        try {
            if (item.enable) {
                const total = await this.getStateAsync(`${item.idChannelTarget}.${this.idTotal}`);
                const oldState = await this.getStateAsync(`${item.idChannelTarget}.${this.idOldValue}`);
                if (state.val !== null || oldState.val !== null) {
                    total.val = total.val;
                    state.val = state.val;
                    oldState.val = oldState.val;
                    if (state.lc - total.lc > this.config.totalDebounceTime * 1000) {
                        // entprellen
                        const storageState = await this.getStateAsync(`${item.idChannelTarget}.${this.idStorageValue}`);
                        storageState.val = storageState.val;
                        let delta = 0;
                        if ((oldState.val > storageState.val)) {
                            // Rückfalllösung, wenn z.B. Skript oder LXC beendet wurde / crasht
                            delta = (state.val - storageState.val);
                            this.itemDebug(item, `${logPrefix} calculated delta from storage: (val: ${state.val} - storageVal: ${storageState.val}) = ${mathjs.round(delta, 5)}`);
                        }
                        else {
                            delta = (state.val - oldState.val);
                            this.itemDebug(item, `${logPrefix} calculated delta: (val: ${state.val} - oldVal: ${oldState.val}) = ${mathjs.round(delta, 5)}`);
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
                            }
                            else if (oldState.val < storageState.val) {
                                // solange oldVal nicht über altem gespeichertem Wert liegt wird ignoriert
                                this.log.warn(`${logPrefix} oldVal ${oldState.val} < storageVal ${storageState.val} and ignore reset is active (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}) -> ignore on this run`);
                                return;
                            }
                        }
                        const sum = mathjs.round((total.val + delta), 3);
                        if (sum >= total.val) {
                            await this.setState(`${item.idChannelTarget}.${this.idTotal}`, sum, true);
                            this.itemDebug(item, `${logPrefix} set new total value: (old total: ${total.val} + delta: ${mathjs.round(delta, 5)}) = ${sum}`);
                        }
                        else {
                            this.log.warn(`${logPrefix} calculated new total value ${sum} is lower than oldVal ${oldState.val} (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}, delta: ${mathjs.round(delta, 5)}) -> got a reset`);
                        }
                        await this.setState(`${item.idChannelTarget}.${this.idStorageValue}`, sum, true);
                    }
                }
                else {
                    console.warn(`${logPrefix} val / oldVal is null (val: ${state.val} oldVal: ${total.val})' -> ignore values on this run`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createDatapointsHistory(isAdapterStart) {
        const logPrefix = `[createDatapointsHistory]:`;
        try {
            const list = [...this.config.historyList];
            const commonHistory = {
                name: 'generic',
                type: 'number',
                role: 'state',
                read: true,
                write: false,
                def: 0,
            };
            for (const item of list) {
                const idChannel = helper.getIdWithoutLastPart(item.id);
                objectHandler.createChannel(this, utils, `${idChannel}.${this.idChannelHistory}`, 'historical values');
                const itemObj = await this.getObjectAsync(item.id);
                commonHistory.unit = itemObj?.common.unit;
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this.idChannelHistory}.${interval}`, `tbd`, 0, commonHistory, undefined, false, false);
                        objectHandler.createChannel(this, utils, `${idChannel}.${this.idChannelHistory}._${interval}`, `past ${interval}s`);
                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, `tbd`, 0, commonHistory, undefined, false, false);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateNamesOfDatapointsHistory() {
        const logPrefix = `[updateNamesOfDatapointsHistory]:`;
        try {
            const list = [...this.config.historyList];
            this.log.warn(this.dateFormat);
            for (const item of list) {
                const idChannel = helper.getIdWithoutLastPart(item.id);
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        let name = '';
                        if (interval === Interval.day) {
                            name = `${utils.I18n.translate('today')} ${moment().format('DD.MM.')}`;
                        }
                        else if (interval === Interval.week) {
                            name = `${utils.I18n.translate('this week')} (${moment().startOf('week').format('DD.MM.')} - ${moment().format('DD.MM.')})`;
                        }
                        else if (interval === Interval.month) {
                            name = moment().format('MMMM YYYY');
                        }
                        else if (interval === Interval.year) {
                            name = moment().format('YYYY');
                        }
                        else {
                            continue;
                        }
                        await this._updateNamesOfDatapointsHistory(`${idChannel}.${this.idChannelHistory}.${interval}`, name, logPrefix);
                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                if (interval === Interval.day) {
                                    if (i === 1) {
                                        name = `Gestern ${moment().add(-i, 'days').format('DD.MM.')}`;
                                    }
                                    else {
                                        name = moment().add(-i, 'days').format('dddd DD.MM.');
                                    }
                                }
                                else if (interval === Interval.week) {
                                    if (i === 1) {
                                        name = `letzte Woche (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`;
                                    }
                                    else {
                                        name = `vor ${i} Wochen (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`;
                                    }
                                }
                                else if (interval === Interval.month) {
                                    name = moment().add(-i, 'month').format('MMMM YYYY');
                                }
                                else if (interval === Interval.year) {
                                    name = moment().add(-i, 'year').format('YYYY');
                                }
                                else {
                                    continue;
                                }
                                await this._updateNamesOfDatapointsHistory(`${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, name, logPrefix);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async _updateNamesOfDatapointsHistory(id, name, logPrefix) {
        try {
            let obj = await this.getObjectAsync(id);
            if (obj && obj.common && obj.common.name !== name) {
                obj.common.name = name;
                await this.setObject(id, obj);
                this.log.debug(`${logPrefix} update name of '${id}' to '${name}'`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    itemDebug(item, message) {
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
export default function startAdapter(options) {
    // compact mode
    return new AnalyticsMariadb(options);
}
