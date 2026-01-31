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
    private idConsumption = 'consumption';
    private idCosts = 'cost';
    private idBackPayment = 'backpayment';

    private costList: ioBroker.AdapterConfigTypes.CostList = {};

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
        const logPrefix = `[${this.logPrefix}.createStates]:`

        try {
            const list = this.adapter.config.billingList;

            if (list && list.length > 0) {
                for (const item of list) {
                    let idChannel = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelBilling}`

                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, 'billing period');

                    const start = moment(item.start);
                    const end = moment(item.end);
                    idChannel = `${idChannel}.${start.format('YYYY_MM_DD').replace(/[./]/g, "_")}_to_${end.format('YYYY_MM_DD').replace(/[./]/g, "_")}`;

                    await objectHandler.createChannel(this.adapter, this.utils, idChannel, `${start.format(this.adapter.dateFormat)} - ${end.format(this.adapter.dateFormat)}: ${item.provider}`);

                    const sourceObj = await this.adapter.getObjectAsync(item.id);

                    const datapointItem = this.adapter.datapoints.getByIdTarget(item.id);
                    const historyItem = this.adapter.history.getByIdTarget(item.id);

                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idConsumption}`, 'consumption', null, sourceObj?.common as ioBroker.StateCommon);
                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idCosts}`, 'Costs', null, { ...sourceObj?.common as ioBroker.StateCommon, ...{ role: 'state', unit: this.adapter.cost.getContractType(historyItem.idContractType).currency } });

                    if (item.prePayment) {
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idBackPayment}`, 'back payment', null, { ...sourceObj?.common as ioBroker.StateCommon, ...{ role: 'state', unit: this.adapter.cost.getContractType(historyItem.idContractType).currency } });
                    }

                    await this.updateState(item, historyItem, datapointItem);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }

    private async updateState(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateState]:`

        try {
            if (datapointItem.enable) {
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
            } else {

            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack} `);
        }
    }

    public async onStateChange(item: ioBroker.AdapterConfigTypes.billingItem, historyItem: ioBroker.AdapterConfigTypes.HistoryItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.onStateChange] - '${item.id as string}':`

        try {
            await this.updateState(item, historyItem, this.adapter.datapoints.getByIdTarget(item.id));

            this.log.warn(`${logPrefix} ${item.id} - state changed, billing data updated`);
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}