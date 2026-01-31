import moment from 'moment';
import * as mathjs from 'mathjs';
import * as helper from './helper.js';
import * as objectHandler from './objectHandler.js';
export class Billing {
    logPrefix = 'Billing';
    adapter;
    utils;
    log;
    idChannelBilling = 'billing';
    idConsumption = 'consumption';
    idCosts = 'cost';
    idBackPayment = 'backpayment';
    constructor(adapter, utils) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }
    async init() {
        const logPrefix = `[${this.logPrefix}.init]:`;
        try {
            await this.createStates(true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getListByIdTarget(idTarget, futureOnly = false) {
        return this.adapter.config.billingList.filter(item => futureOnly ? item.id === idTarget && (moment(item.end).isAfter(moment()) || moment(item.end).isSame(moment())) : item.id === idTarget);
    }
    async createStates(isAdapterStart) {
        let logPrefix = `[${this.logPrefix}.createStates]:`;
        try {
            const list = this.adapter.config.billingList;
            if (list && list.length > 0) {
                for (const item of list) {
                    logPrefix = `[${this.logPrefix}.updateState] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`;
                    let idChannel = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelBilling}`;
                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, 'billing period');
                    const start = moment(item.start);
                    const end = moment(item.end);
                    idChannel = `${idChannel}.${start.format('YYYY_MM_DD').replace(/[./]/g, "_")}_to_${end.format('YYYY_MM_DD').replace(/[./]/g, "_")}`;
                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, `${start.format(this.adapter.dateFormat)} - ${end.format(this.adapter.dateFormat)}: ${item.provider}`);
                    const sourceObj = await this.adapter.getObjectAsync(item.id);
                    const datapointItem = this.adapter.datapoints.getByIdTarget(item.id);
                    const historyItem = this.adapter.history.getByIdTarget(item.id);
                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idConsumption}`, 'consumption', null, sourceObj?.common);
                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idCosts}`, 'Costs', null, { ...sourceObj?.common, ...{ role: 'state', unit: this.adapter.cost.getContractType(historyItem.idContractType).currency } });
                    if (item.prePayment) {
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBackPayment}`, 'back payment', null, { ...sourceObj?.common, ...{ role: 'state', unit: this.adapter.cost.getContractType(historyItem.idContractType).currency } });
                    }
                    await this.updateState(item, historyItem, datapointItem);
                    this.log.debug(`${logPrefix} '${item.provider}' billing states created and updated`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }
    async updateState(item, historyItem, datapointItem) {
        const logPrefix = `[${this.logPrefix}.updateState] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`;
        try {
            if (datapointItem && datapointItem.enable) {
                const start = moment(item.start);
                const end = moment(item.end);
                const idChannel = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelBilling}.${start.format('YYYY_MM_DD').replace(/[./]/g, "_")}_to_${end.format('YYYY_MM_DD').replace(/[./]/g, "_")}`;
                const result = await this.adapter.cost.getCostOfRange(historyItem, datapointItem, start, end, `${item.provider}`);
                if (result) {
                    await this.adapter.setStateChangedAsync(`${idChannel}.${this.idConsumption}`, { val: result.consumption, ack: true });
                    await this.adapter.setStateChangedAsync(`${idChannel}.${this.idCosts}`, { val: result.sum, ack: true });
                    if (item.prePayment) {
                        const daysOfPeriod = end.diff(start, 'days') + 1;
                        let res = result.sum - item.prePayment;
                        if (end.isAfter(moment()) || end.isSame(moment(), 'day')) {
                            const daysUntilNow = moment().diff(start, 'days') + 1;
                            res = mathjs.round(result.sum - ((item.prePayment / daysOfPeriod) * daysUntilNow), 3);
                        }
                        await this.adapter.setStateChangedAsync(`${idChannel}.${this.idBackPayment}`, { val: res, ack: true });
                    }
                }
            }
            else {
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }
    async onStateChange(item, historyItem) {
        const logPrefix = `[${this.logPrefix}.onStateChange] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`;
        try {
            await this.updateState(item, historyItem, this.adapter.datapoints.getByIdTarget(item.id));
            this.log.debug(`${logPrefix} '${item.provider}' billing data updated`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
