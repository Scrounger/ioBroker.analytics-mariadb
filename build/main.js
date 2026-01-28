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
class AnalyticsMariadb extends utils.Adapter {
    sourceToDatapoint = {};
    timeoutBoolean = {};
    idTotal = 'total';
    idOldValue = 'oldValue';
    idStorageValue = 'storageValue';
    idBooleanValue = 'value';
    sql;
    datapoints;
    history;
    scheduleUpdateHistoryAtDayChange;
    scheduleSaveValueBeforeDayChange;
    scheduleSaveValueAfterDayChange;
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
                this.datapoints = new Datapoints(this, utils);
                await this.datapoints.init();
                this.history = new History(this, utils);
                await this.history.init();
                // Historische Werte einmal täglich aktualisieren (_Tag, _Woche, _Monat, _Jahr)
                this.scheduleUpdateHistoryAtDayChange = scheduleJob(this.config.cronUpdateHistoryAtDayChange, async () => {
                    this.log.debug(`${logPrefix} cron job to update name of history states at day change started...`);
                    await this.history.updateNameOfStates();
                    this.log.debug(`${logPrefix} cron job to update history values at day change started...`);
                    await this.history.updateStates();
                });
                // Beim Tageswechsel, Wert kurz vor und nach 0:00 in Datenbank schreiben, damit der Verbrauch zwischen Tageswechsel korrekt erfasst wird
                this.scheduleSaveValueBeforeDayChange = scheduleJob('55 59 23 * * *', async () => {
                    this.log.debug(`${logPrefix} cron job to to save values in database before day change started...`);
                    await this.datapoints.writeValuesAtDayChangeToDatabase();
                });
                this.scheduleSaveValueAfterDayChange = scheduleJob('5 0 0 * * *', async () => {
                    this.log.debug(`${logPrefix} cron job to to save values in database after day change started...`);
                    await this.datapoints.writeValuesAtDayChangeToDatabase();
                });
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
            for (const id in this.timeoutBoolean) {
                if (this.timeoutBoolean[id]) {
                    this.clearTimeout(this.timeoutBoolean[id]);
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
                if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOldValue}`) || id.endsWith(`.${this.idBooleanValue}`)) {
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
                    const item = this.config.historyList.find(item => item.id === id.replace(`${this.namespace}.`, '') ||
                        item.id === id.replace(`${this.namespace}.`, '').replace(`.${this.datapoints.idTotal}`, `.${this.datapoints.idBooleanValue}`));
                    if (item && this.history) {
                        await this.history.onStateChange(item, state);
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
