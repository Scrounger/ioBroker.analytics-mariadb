import * as mathjs from 'mathjs';
import * as objectHandler from './objectHandler.js';
import { Interval } from './sqlInterface.js';
import * as helper from './helper.js';
export class Datapoints {
    logPrefix = 'Datapoints';
    adapter;
    utils;
    log;
    idTotal = 'total';
    idOldValue = 'oldValue';
    idStorageValue = 'storageValue';
    idBooleanValue = 'value';
    constructor(adapter, utils) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }
    async init() {
        const logPrefix = `[${this.logPrefix}.init]`;
        try {
            await this.createStates(true);
            await this.writeValuesAtDayChangeToDatabase();
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getByIdTarget(idTarget) {
        return Object.values(this.adapter.sourceToDatapoint).find((item) => item.idChannelTarget === helper.getIdWithoutLastPart(idTarget));
    }
    async createStates(isAdapterStart) {
        const logPrefix = `[${this.logPrefix}.createStates]:`;
        try {
            const list = [...this.adapter.config.datapointsNumberList, ...this.adapter.config.datapointsBooleanList];
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
                        // ToDo: indcators onlineId, errorId probably implementation
                        if (structure.indexOf(id) !== structure.length - 1) {
                            await objectHandler.createChannel(this.adapter, this.utils, idChannel, id);
                        }
                        else {
                            await objectHandler.createChannel(this.adapter, this.utils, idChannel, item.name || id);
                        }
                    }
                    await this.createState(idChannel, item, isAdapterStart);
                }
            }
            this.log.debug(`${logPrefix} finished creating datapoints for configured sources: ${JSON.stringify(this.adapter.sourceToDatapoint)}`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createState(idChannel, item, isAdapterStart) {
        const logPrefix = `[${this.logPrefix}.createState] - '${idChannel}':`;
        try {
            if (await this.adapter.foreignObjectExists(item.idSource)) {
                const sourceObj = await this.adapter.getForeignObjectAsync(item.idSource);
                const sourceState = await this.adapter.getForeignStateAsync(item.idSource);
                if (sourceObj?.common.type === 'number') {
                    await this.createStateNumber(idChannel, item, isAdapterStart, sourceObj, sourceState);
                }
                else if (sourceObj?.common.type === 'boolean') {
                    await this.createStateBoolean(idChannel, item, isAdapterStart, sourceObj, sourceState);
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
    async createStateNumber(idChannel, item, isAdapterStart, sourceObj, sourceState) {
        const logPrefix = `[${this.logPrefix}.createStateNumber] - '${idChannel}':`;
        try {
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idTotal}`, 'cumulative total value', sourceState.val, sourceObj?.common, item, true, false);
            // oldValue & storageValue must have the same value as total at state creation
            const totalState = await this.adapter.getStateAsync(`${idChannel}.${this.idTotal}`);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idOldValue}`, 'old meter reading', totalState.val, sourceObj?.common, item, false, true);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idStorageValue}`, 'helper cumulative total value', totalState.val, sourceObj?.common, item, false, true);
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
                    await this.updateState(item, item.idSource, sourceState);
                    // old value nach verarbeiteter Änderung setzen
                    await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idOldValue}`, sourceState);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async createStateBoolean(idChannel, item, isAdapterStart, sourceObj, sourceState) {
        const logPrefix = `[${this.logPrefix}.createStateBoolean] - '${idChannel}':`;
        try {
            const common = {
                name: 'total number',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            };
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idTotal}`, 'total number', 0, common, item, false, false);
            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBooleanValue}`, 'value', sourceState.val, sourceObj?.common, item, true, true);
            if (item.enable) {
                this.adapter.sourceToDatapoint[item.idSource] = item;
                this.adapter.sourceToDatapoint[item.idSource].type = sourceObj?.common.type;
                this.adapter.sourceToDatapoint[item.idSource].idSql = `${idChannel}.${this.idBooleanValue}`;
                await this.adapter.subscribeForeignStatesAsync(item.idSource);
                await this.adapter.subscribeStatesAsync(`${idChannel}.${this.idTotal}`); // react on total changes is needed, because it's changed from the adapter
                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idTotal}`);
                await this.adapter.subscribeObjectsAsync(`${idChannel}.${this.idBooleanValue}`);
                if (isAdapterStart) {
                    // beim Start des Adapter's die Werte aktualisieren
                    await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idBooleanValue}`, sourceState);
                    const counter = (await this.adapter.sql.getCounter(item, Interval.ALL));
                    if (counter) {
                        await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idTotal}`, counter.count, true);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateState(item, id, state) {
        const logPrefix = `[${this.logPrefix}.updateState] - '${id}':`;
        try {
            if (item.enable) {
                const total = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idTotal}`);
                const oldState = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idOldValue}`);
                if (state.val !== null || oldState.val !== null) {
                    total.val = total.val;
                    state.val = state.val;
                    oldState.val = oldState.val;
                    if (state.lc - total.lc > this.adapter.config.totalDebounceTime * 1000) {
                        // entprellen
                        const storageState = await this.adapter.getStateAsync(`${item.idChannelTarget}.${this.idStorageValue}`);
                        storageState.val = storageState.val;
                        let delta = 0;
                        if ((oldState.val > storageState.val)) {
                            // Rückfalllösung, wenn z.B. Skript oder LXC beendet wurde / crasht
                            delta = (state.val - storageState.val);
                            this.adapter.itemDebug(item, `${logPrefix} calculated delta from storage: (val: ${state.val} - storageVal: ${storageState.val}) = ${mathjs.round(delta, 5)}`);
                        }
                        else {
                            delta = (state.val - oldState.val);
                            this.adapter.itemDebug(item, `${logPrefix} calculated delta: (val: ${state.val} - oldVal: ${oldState.val}) = ${mathjs.round(delta, 5)}`);
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
                            await this.adapter.setState(`${item.idChannelTarget}.${this.idTotal}`, sum, true);
                            this.adapter.itemDebug(item, `${logPrefix} set new total value: (old total: ${total.val} + delta: ${mathjs.round(delta, 5)}) = ${sum}`);
                        }
                        else {
                            this.log.warn(`${logPrefix} calculated new total value ${sum} is lower than oldVal ${oldState.val} (val: ${state.val} oldVal: ${oldState.val} storageVal: ${storageState.val}, delta: ${mathjs.round(delta, 5)}) -> got a reset`);
                        }
                        await this.adapter.setState(`${item.idChannelTarget}.${this.idStorageValue}`, sum, true);
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
    async onObjectChange(id) {
        const logPrefix = `[${this.logPrefix}.onObjectChange] - '${id}':`;
        try {
            this.log.error(`${logPrefix} changing object '${id}' is not allowed, please use the adapter configuration! Changes will be undone !`);
            const idChannel = id.replace(`${this.adapter.namespace}.`, '').replace(`.${this.idTotal}`, '').replace(`.${this.idOldValue}`, '').replace(`.${this.idBooleanValue}`, '');
            const item = this.adapter.config.datapointsNumberList.find(i => i.idChannelTarget === idChannel) || this.adapter.config.datapointsBooleanList.find(i => i.idChannelTarget === idChannel);
            await this.createState(idChannel, item, false);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async onStateChange(item, id, state) {
        const logPrefix = `[${this.logPrefix}.onStateChange] - '${id}':`;
        try {
            if (item.type === 'number') {
                await this.updateState(item, id, state);
                await this.adapter.setState(`${item.idChannelTarget}.${this.idOldValue}`, state);
            }
            else if (item.type === 'boolean') {
                const idTarget = `${item.idChannelTarget}.${this.idBooleanValue}`;
                const targetState = await this.adapter.getStateAsync(idTarget);
                if (state.val !== targetState.val) {
                    // nur ausführen, wenn sich der Wert / ack auch geändert hat
                    if (this.adapter.timeoutBoolean[id]) {
                        this.adapter.clearTimeout(this.adapter.timeoutBoolean[id]);
                    }
                    this.adapter.timeoutBoolean[idTarget] = this.adapter.setTimeout(async () => {
                        // we need a timeout, because sql need some time to write the new value in the database
                        const counter = (await this.adapter.sql.getCounter(item, Interval.ALL));
                        if (counter) {
                            await this.adapter.setStateChangedAsync(`${item.idChannelTarget}.${this.idTotal}`, { val: counter.count, lc: state.lc, ack: true });
                        }
                        this.adapter.clearTimeout(this.adapter.timeoutBoolean[id]);
                        delete this.adapter.timeoutBoolean[id];
                    }, this.adapter.config.sqlWriteTimeout);
                }
                await this.adapter.setState(idTarget, state);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async writeValuesAtDayChangeToDatabase() {
        const logPrefix = `[${this.logPrefix}.writeValuesAtDayChangeToDatabase]':`;
        try {
            const list = [...this.adapter.config.datapointsNumberList, ...this.adapter.config.datapointsBooleanList];
            if (list && list.length > 0) {
                for (const item of list) {
                    if (item.enable) {
                        let state = await this.adapter.getStateAsync(item.idSql);
                        this.adapter.log.info(`${logPrefix} '${item.idSql}' - save state to database`);
                        this.adapter.sql.storeState(item, state);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
