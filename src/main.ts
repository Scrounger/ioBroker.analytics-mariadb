/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';
import { Job, scheduleJob } from 'node-schedule';


// Load your modules here, e.g.:
// import * as fs from 'fs';
import { SqlInterface } from './lib/sqlInterface.js';
import { History } from './lib/history.js';
import { Datapoints } from './lib/datapoints.js';
import { Costs } from './lib/costs.js';
import { Billing } from './lib/billing.js';


class AnalyticsMariadb extends utils.Adapter {

    sourceToDatapoint: Record<string, ioBroker.AdapterConfigTypes.DatapointsItem> = {};

    timeoutDebounceList: Record<string, ioBroker.Timeout> = {};

    idTotal = 'total';
    idOldValue = 'oldValue';
    idStorageValue = 'storageValue';
    idBooleanValue = 'value'

    sql: SqlInterface;
    datapoints: Datapoints;
    history: History;
    costs: Costs;
    billing: Billing;

    scheduleUpdateHistoryAtDayChange: Job;
    scheduleSaveValueBeforeDayChange: Job;
    scheduleSaveValueAfterDayChange: Job;

    public initComplete: boolean = false;

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
                const sqlObj = await this.getForeignObjectAsync(`system.adapter.${this.config.sqlInstance}`);

                if (sqlObj && sqlObj.native && (sqlObj.native as { dbtype?: string }).dbtype === 'mysql') {
                    moment.locale(this.language);
                    await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

                    this.sql = new SqlInterface(this);

                    this.datapoints = new Datapoints(this, utils);
                    await this.datapoints.init();

                    this.costs = new Costs(this)
                    await this.costs.init();

                    this.history = new History(this, utils);
                    await this.history.init();

                    this.billing = new Billing(this, utils);
                    await this.billing.init();

                    this.initComplete = true;

                    // Historische Werte einmal täglich aktualisieren (_Tag, _Woche, _Monat, _Jahr)
                    this.scheduleUpdateHistoryAtDayChange = scheduleJob(this.config.cronUpdateHistoryAtDayChange, async () => {
                        this.log.debug(`${logPrefix} cron job to update name of history states at day change started...`);
                        await this.history.updateNameOfStates()

                        this.log.debug(`${logPrefix} cron job to update history values at day change started...`);
                        await this.history.updateStates();
                    });

                    // Beim Tageswechsel, Wert kurz vor und nach 0:00 in Datenbank schreiben, damit der Verbrauch zwischen Tageswechsel korrekt erfasst wird
                    this.scheduleSaveValueBeforeDayChange = scheduleJob('59 59 23 * * *', async () => {
                        this.log.debug(`${logPrefix} cron job to to save values in database before day change started...`);
                        await this.datapoints.saveStatesToDatabase();
                    });
                    this.scheduleSaveValueAfterDayChange = scheduleJob('1 0 0 * * *', async () => {
                        this.log.debug(`${logPrefix} cron job to to save values in database after day change started...`);
                        await this.datapoints.saveStatesToDatabase();
                    });

                    // const item = { ... this.config.historyList[0] };
                    // const datapointItem = this.datapoints.getByIdTarget(item.id as string);
                    // item.debug = true;

                    // await this.costs.getCostOfRange(item, datapointItem, moment('01.01.2022', 'DD.MM.YYYY'), moment('31.12.2022', 'DD.MM.YYYY').endOf('day'));
                } else {
                    this.log.error(`${logPrefix} only dbtype mysql is supported by this adapter (currently configured: ${(sqlObj && sqlObj.native && (sqlObj.native as { dbtype?: string }).dbtype) || 'undefined'})!`);
                }
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
                // if adapter objects changed from outside of this adapter

                if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOldValue}`) || id.endsWith(`.${this.idBooleanValue}`)) {
                    await this.datapoints.onObjectChange(id);

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
                if (this.initComplete) {
                    if (!state.from.includes(this.namespace)) {
                        // source states changed
                        const item = this.sourceToDatapoint[id];

                        if (item) {
                            await this.datapoints.onStateChange(item, id, state);
                        } else {
                            this.log.warn(`${logPrefix} state '${id}' changed but is not in configured source list, ignoring change.`);
                        }
                    } else if (state.from.includes(this.namespace)) {
                        // adapter states changed 

                        if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOldValue}`)) {
                            const targetId = id.replace(`${this.namespace}.`, '');

                            // Update History and costs if enabled
                            const datapointItem = this.datapoints.getByIdTarget(targetId);
                            const historyItem = this.history.getByIdTarget(targetId || targetId.replace(`.${this.datapoints.idTotal}`, `.${this.datapoints.idBooleanValue}`));

                            if (historyItem) {
                                await this.history.onStateChange(historyItem, state, false);
                            }

                            // Update calcualted History items
                            const calcHistoryItemsList = this.history.getCalculationByIdTarget(targetId || targetId.replace(`.${this.datapoints.idTotal}`, `.${this.datapoints.idBooleanValue}`));

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
            } else {
                // The object was deleted or the state value has expired
                this.log.info(`state ${id} deleted`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private isBetweenDayChange(start: string, end: string): Boolean {
        return moment().isSameOrAfter(moment(start, 'HH:mm')) || moment().isSameOrBefore(moment(end, 'HH:mm'));
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
                    const data = obj.message.data as ioBroker.AdapterConfigTypes.DatapointsSqlPresetsItem[];

                    const result = data.filter(p => p.type === 'number').map(p => p.idPreset);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }

                } else if (obj.command === 'getDatapointsBooleanSqlPresetsList') {
                    const data = obj.message.data as ioBroker.AdapterConfigTypes.DatapointsSqlPresetsItem[];

                    const result = data.filter(p => p.type === 'boolean').map(p => p.idPreset);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }

                } else if (obj.command === 'getDatapointsList') {
                    const dataNumber = obj.message.dataNumber as ioBroker.AdapterConfigTypes.DatapointsItem[];
                    const numberLists = dataNumber.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idTotal}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idTotal})` : `${item.idChannelTarget}.${this.idTotal}`
                        }
                    });

                    const dataBoolean = obj.message.dataBoolean as ioBroker.AdapterConfigTypes.DatapointsItem[];
                    const booleanLists = dataBoolean.map(item => {
                        return {
                            value: `${item.idChannelTarget}.${this.idBooleanValue}`,
                            label: item.name ? `${item.name} (${item.idChannelTarget}.${this.idBooleanValue})` : `${item.idChannelTarget}.${this.idBooleanValue}`
                        }
                    });

                    const result = [...numberLists, ...booleanLists];

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else if (obj.command === 'getHistoryList') {
                    const data = obj.message.data as ioBroker.AdapterConfigTypes.HistoryItem[];

                    const result = data.map(item => {
                        const dpItem = this.datapoints.getByIdTarget(item.id as string);
                        return {
                            value: `${item.id}`,
                            label: dpItem ? `${dpItem.name} (${item.id})` : `${item.id}`
                        }
                    });

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }

                } else if (obj.command === 'getCostsContractTypes') {
                    const data = obj.message.data as ioBroker.AdapterConfigTypes.CostContractType[];

                    const result = data.map(p => p.id);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } else if (obj.command === 'getBillingList') {
                    const historyList = obj.message.history as ioBroker.AdapterConfigTypes.HistoryItem[];

                    const result = historyList.filter(x => x.idContractType).map(item => {
                        const dpItem = (obj.message.datapoints as ioBroker.AdapterConfigTypes.DatapointsItem[]).find(d => item.id.includes(d.idChannelTarget));
                        if (dpItem) {
                            return {
                                value: `${item.id}`,
                                label: dpItem ? `${dpItem.name} (${item.idContractType})` : `ERROR !!! ${item.id}`
                            }
                        }
                        return null;
                    }).filter(item => item !== null);;

                    this.log.warn(JSON.stringify(result));

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

    public itemDebug(item: ioBroker.AdapterConfigTypes.DatapointsItem | ioBroker.AdapterConfigTypes.HistoryItem | ioBroker.AdapterConfigTypes.CostContractType, message: string): void {
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
