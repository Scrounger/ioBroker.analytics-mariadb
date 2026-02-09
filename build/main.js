/*
 * Created with @iobroker/create-adapter v3.1.2
 */
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import { scheduleJob } from 'node-schedule';
// Load your modules here, e.g.:
// import * as fs from 'fs';
import { SqlInterface } from './lib/sqlInterface.js';
import { History } from './lib/history.js';
import { Datapoints } from './lib/datapoints.js';
import { Costs } from './lib/costs.js';
import { Billing } from './lib/billing.js';
class AnalyticsMariadb extends utils.Adapter {
    sourceToDatapoint = {};
    timeoutDebounceList = {};
    sql;
    datapoints;
    history;
    costs;
    billing;
    scheduleUpdateHistoryAtDayChange;
    scheduleSaveValueBeforeDayChange;
    scheduleSaveValueAfterDayChange;
    initComplete = false;
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
                const sqlObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`);
                if (sqlObj && sqlObj.native && sqlObj.native.dbtype === 'mysql') {
                    moment.locale(this.language);
                    await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);
                    this.sql = new SqlInterface(this);
                    this.datapoints = new Datapoints(this, utils);
                    await this.datapoints.init();
                    this.costs = new Costs(this);
                    this.costs.init();
                    this.history = new History(this, utils);
                    await this.history.init();
                    this.billing = new Billing(this, utils);
                    await this.billing.init();
                    this.initComplete = true;
                    // Historische Werte einmal täglich aktualisieren (_Tag, _Woche, _Monat, _Jahr)
                    this.scheduleUpdateHistoryAtDayChange = scheduleJob(this.config.cronUpdateHistoryAtDayChange, async () => {
                        this.log.debug(`${logPrefix} cron job to update name of history states at day change started...`);
                        await this.history.updateNameOfStates();
                        this.log.debug(`${logPrefix} cron job to update history values at day change started...`);
                        await this.history.updateStates();
                    });
                    // Beim Tageswechsel, Wert kurz vor und nach 0:00 in Datenbank schreiben, damit der Verbrauch zwischen Tageswechsel korrekt erfasst wird
                    this.scheduleSaveValueBeforeDayChange = scheduleJob('59 59 23 * * *', () => {
                        this.log.debug(`${logPrefix} cron job to to save values in database before day change started...`);
                        this.datapoints.saveStatesToDatabase();
                    });
                    this.scheduleSaveValueAfterDayChange = scheduleJob('1 0 0 * * *', () => {
                        this.log.debug(`${logPrefix} cron job to to save values in database after day change started...`);
                        this.datapoints.saveStatesToDatabase();
                    });
                    // const item = { ... this.config.historyList[0] };
                    // const datapointItem = this.datapoints.getByIdTarget(item.id as string);
                    // item.debug = true;
                    // await this.costs.getCostOfRange(item, datapointItem, moment('01.01.2022', 'DD.MM.YYYY'), moment('31.12.2022', 'DD.MM.YYYY').endOf('day'));
                }
                else {
                    this.log.error(`${logPrefix} only dbtype mysql is supported by this adapter (currently configured: ${(sqlObj && sqlObj.native && sqlObj.native.dbtype) || 'undefined'})!`);
                }
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
            for (const id in this.timeoutDebounceList) {
                if (this.timeoutDebounceList[id]) {
                    this.clearTimeout(this.timeoutDebounceList[id]);
                }
            }
            if (this.scheduleUpdateHistoryAtDayChange) {
                this.scheduleUpdateHistoryAtDayChange.cancel();
            }
            if (this.scheduleSaveValueBeforeDayChange) {
                this.scheduleSaveValueBeforeDayChange.cancel();
            }
            if (this.scheduleSaveValueAfterDayChange) {
                this.scheduleSaveValueAfterDayChange.cancel();
            }
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
                // if adapter objects changed from outside of this adapter
                if (id.endsWith(`.${this.datapoints.idTotal}`) || id.endsWith(`.${this.datapoints.idOldValue}`) || id.endsWith(`.${this.datapoints.idBooleanValue}`)) {
                    await this.datapoints.onObjectChange(id);
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
                if (this.initComplete) {
                    if (!state.from.includes(this.namespace)) {
                        // source states changed
                        const item = this.sourceToDatapoint[id];
                        if (item) {
                            await this.datapoints.onStateChange(item, id, state);
                        }
                        else {
                            this.log.warn(`${logPrefix} state '${id}' changed but is not in configured source list, ignoring change.`);
                        }
                    }
                    else if (state.from.includes(this.namespace)) {
                        // adapter states changed 
                        if (id.endsWith(`.${this.datapoints.idTotal}`)) {
                            const targetId = id.replace(`${this.namespace}.`, '');
                            // Update History and costs if enabled
                            const historyItem = this.history.getByIdTarget(targetId) || this.history.getByIdTarget(targetId.replace(`.${this.datapoints.idTotal}`, `.${this.datapoints.idBooleanValue}`));
                            if (historyItem) {
                                await this.history.onStateChange(historyItem, state, false);
                            }
                            // Update calcualted History items
                            const calcHistoryItemsList = this.history.getCalculationByIdTarget(targetId) || this.history.getCalculationByIdTarget(targetId.replace(`.${this.datapoints.idTotal}`, `.${this.datapoints.idBooleanValue}`));
                            if (calcHistoryItemsList && calcHistoryItemsList.length > 0) {
                                for (const item of calcHistoryItemsList) {
                                    await this.history.onStateChange(item, state, true);
                                }
                            }
                            if (historyItem) {
                                // Update Billing if enabled
                                const billingList = this.billing.getListByIdTarget(targetId, true);
                                if (billingList && billingList.length > 0) {
                                    for (const billingItem of billingList) {
                                        await this.billing.onStateChange(billingItem, historyItem);
                                    }
                                }
                            }
                        }
                    }
                }
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
                    const data = obj.message.data;
                    const result = data.filter(p => p.type === 'number')
                        .map(p => p.idPreset)
                        .sort();
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getDatapointsBooleanSqlPresetsList') {
                    const data = obj.message.data;
                    const result = data.filter(p => p.type === 'boolean')
                        .map(p => p.idPreset)
                        .sort();
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getDatapointsList') {
                    const dataNumber = obj.message.dataNumber;
                    const numberLists = dataNumber.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.datapoints.idTotal}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.datapoints.idTotal})` : `${item.idChannelTarget}.${this.datapoints.idTotal}`
                        };
                    });
                    const dataBoolean = obj.message.dataBoolean;
                    const booleanLists = dataBoolean.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.datapoints.idBooleanValue}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.datapoints.idBooleanValue})` : `${item.idChannelTarget}.${this.datapoints.idBooleanValue}`
                        };
                    });
                    const result = [...numberLists, ...booleanLists]
                        .sort((a, b) => {
                        if (a.label < b.label)
                            return -1;
                        if (a.label > b.label)
                            return 1;
                        return 0;
                    });
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getHistoryList') {
                    const data = obj.message.data;
                    const result = data.map(item => {
                        if (item.id) {
                            const dpItem = this.datapoints.getByIdTarget(item.id);
                            return {
                                value: `${item.id}`,
                                label: dpItem ? `${dpItem.name} (${item.id})` : `${item.id}`
                            };
                        }
                        return null;
                    })
                        .filter(item => item !== null)
                        .sort((a, b) => {
                        if (a.label < b.label)
                            return -1;
                        if (a.label > b.label)
                            return 1;
                        return 0;
                    });
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getCostsContractTypes') {
                    const data = obj.message.data;
                    const result = data.map(p => p.id)
                        .sort();
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getCalculationCostContractTypes') {
                    const ids = obj.message.ids;
                    const historyList = obj.message.historyList;
                    const hasContratcs = historyList.filter(h => ids.includes(h.id) && h.idContractType).length > 0;
                    const result = obj.message.contractTypesList.map(item => {
                        return {
                            value: item.id,
                            label: item.id
                        };
                    }).sort((a, b) => {
                        if (a.label < b.label)
                            return -1;
                        if (a.label > b.label)
                            return 1;
                        return 0;
                    });
                    if (hasContratcs) {
                        result.unshift({ value: 'fromCalculation', label: utils.I18n.getTranslatedObject('from calculation')[this.language] });
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                }
                else if (obj.command === 'getBillingList') {
                    const historyList = obj.message.history;
                    const result = historyList.filter(x => x.idContractType).map(item => {
                        const dpItem = obj.message.datapoints.find(d => item.id.includes(d.idChannelTarget));
                        if (dpItem) {
                            return {
                                value: `${item.id}`,
                                label: dpItem ? `${dpItem.name} (${item.idContractType})` : `ERROR !!! ${item.id}`
                            };
                        }
                        return null;
                    })
                        .filter(item => item !== null)
                        .sort((a, b) => {
                        if (a.label < b.label)
                            return -1;
                        if (a.label > b.label)
                            return 1;
                        return 0;
                    });
                    ;
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
