import moment from 'moment';
import * as mathjs from 'mathjs'

import * as helper from './helper.js';
import * as objectHandler from './objectHandler.js';

export class Billing {
    private logPrefix: string = 'Billing'

    private adapter: ioBroker.myAdapter;
    private utils: typeof import("@iobroker/adapter-core")
    private log: ioBroker.Logger;

    public idChannelBilling = 'billing';
    private idConsumption = '00_consumption';
    private idCosts = '01_costs';
    private idPrePayment = '02_prepayment';
    private idBackPayment = '03_backpayment';

    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core")) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }

    public async init(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.init]:`

        try {
            await this.createStates(true);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public getListByIdTarget(idTarget: string, futureOnly: boolean = false): ioBroker.AdapterConfigTypes.billingItem[] {
        return this.adapter.config.billingList.filter(
            item => futureOnly ? item.id === idTarget && (moment(item.end).isAfter(moment()) || moment(item.end).isSame(moment())) : item.id === idTarget
        );
    }

    private async createStates(isAdapterStart: boolean): Promise<void> {
        let logPrefix = `[${this.logPrefix}.createStates]:`

        try {
            const list = this.adapter.config.billingList;

            if (list && list.length > 0) {
                for (const item of list) {
                    logPrefix = `[${this.logPrefix}.updateState] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`

                    let idChannel = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelBilling}`

                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, 'billing period');

                    const start = moment(item.start);
                    const end = moment(item.end);
                    idChannel = `${idChannel}.${start.format('YYYY_MM_DD').replace(/[./]/g, "_")}_to_${end.format('YYYY_MM_DD').replace(/[./]/g, "_")}`;

                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, `${start.format(this.adapter.dateFormat)} - ${end.format(this.adapter.dateFormat)}: ${item.provider}`);

                    const sourceObj = await this.adapter.getObjectAsync(item.id);

                    const datapointItem = this.adapter.datapoints.getByIdTarget(item.id);
                    const historyItem = this.adapter.history.getByIdTarget(item.id);

                    const unit = this.adapter.costs.getContractType(historyItem.idContractType).currency;

                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idConsumption}`, 'consumption', null, sourceObj?.common as ioBroker.StateCommon);
                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idCosts}`, 'Costs', null, { ...sourceObj?.common as ioBroker.StateCommon, ...{ role: 'state', unit: unit } });

                    if (item.prePayment) {
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idPrePayment}`, item.prePayment > 0 ? 'pre payment' : 'advance reimbursement', null, { ...sourceObj?.common as ioBroker.StateCommon, ...{ role: 'state', unit: unit } });

                        const curState = await this.adapter.getStateAsync(`${idChannel}.${this.idBackPayment}`);
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBackPayment}`, curState && curState.val as number >= 0 ? 'back payment' : 'refund', null, { ...sourceObj?.common as ioBroker.StateCommon, ...{ role: 'state', unit: unit } });
                    }

                    await this.updateState(item, historyItem, datapointItem);

                    this.log.debug(`${logPrefix} '${item.provider}' billing states created and updated`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }

    private async updateState(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateState] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`

        try {
            if (datapointItem && datapointItem.enable) {
                const start = moment(item.start);
                const end = moment(item.end);
                const idChannel = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelBilling}.${start.format('YYYY_MM_DD').replace(/[./]/g, "_")}_to_${end.format('YYYY_MM_DD').replace(/[./]/g, "_")}`;

                const result = await this.adapter.costs.getCostOfRange(historyItem, datapointItem, start, end, `${item.provider}`);

                if (result) {
                    await this.adapter.setStateChangedAsync(`${idChannel}.${this.idConsumption}`, { val: result.consumption, ack: true });
                    await this.adapter.setStateChangedAsync(`${idChannel}.${this.idCosts}`, { val: result.sum, ack: true });

                    if (item.prePayment) {
                        const daysOfPeriod = end.diff(start, 'days') + 1;
                        let prePayment = item.prePayment;

                        if (end.isAfter(moment()) || end.isSame(moment(), 'day')) {
                            const daysUntilNow = moment().diff(start, 'days') + 1;

                            prePayment = (item.prePayment / daysOfPeriod) * daysUntilNow;
                        }

                        const oldState = await this.adapter.getStateAsync(`${idChannel}.${this.idBackPayment}`);
                        const obj = await this.adapter.getObjectAsync(`${idChannel}.${this.idBackPayment}`);
                        const oldValue = oldState.val as number;
                        const res = mathjs.round(result.sum - prePayment, 2);

                        await this.adapter.setStateChangedAsync(`${idChannel}.${this.idPrePayment}`, { val: mathjs.round(prePayment), ack: true });

                        // Objekt Name auf Erstattung / Nachzahlung ggf. anpassen
                        if (oldValue < 0 && res >= 0) {
                            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBackPayment}`, 'back payment', null, obj.common as ioBroker.StateCommon);
                        } else if (oldValue >= 0 && res < 0) {
                            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBackPayment}`, 'refund', null, obj.common as ioBroker.StateCommon);
                        }

                        await this.adapter.setStateChangedAsync(`${idChannel}.${this.idBackPayment}`, { val: res, ack: true });
                    }
                }
            } else {

            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }

    public async onStateChange(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.onStateChange] [${helper.getIdWithoutLastPart(item.id)}] [${moment(item.start).format(this.adapter.dateFormat)} - ${moment(item.end).format(this.adapter.dateFormat)}]:`

        try {
            await this.updateState(item, historyItem, this.adapter.datapoints.getByIdTarget(item.id));

            this.log.silly(`${logPrefix} '${item.provider}' billing data updated`);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}