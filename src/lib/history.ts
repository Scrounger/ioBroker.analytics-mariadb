import moment, { DurationInputArg2, unitOfTime } from 'moment';
import * as mathjs from 'mathjs'

import * as helper from './helper.js';
import * as objectHandler from './objectHandler.js';
import { Interval } from './sqlInterface.js';

export class History {
    private logPrefix: string = 'History'

    private adapter: ioBroker.myAdapter;
    private utils: typeof import("@iobroker/adapter-core")
    private log: ioBroker.Logger;

    private idChannelHistory = 'history';

    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core")) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }

    public async init(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.init]:`

        try {
            await this.createStates(true);
            await this.updateNameOfStates();
            await this._updateStates(true);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public getByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.HistoryItem {
        return this.adapter.config.historyList.find(
            item => item.id === idTarget
        );
    }

    public getCalculationByIdTarget(idTarget: string): ioBroker.AdapterConfigTypes.HistoryItem[] {
        return this.adapter.config.historyCalcList.filter(
            x => x.id.includes(idTarget)
        );
    }

    private async createStates(isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createStates]:`

        try {
            const list = [...this.adapter.config.historyList, ...this.adapter.config.historyCalcList];

            const commonHistory: ioBroker.StateCommon = {
                name: 'generic',
                type: 'number',
                role: 'state',
                read: true,
                write: false,
                def: 0,
            }

            const commonCost = { ...commonHistory }

            // all existings states needed to delete not needed states at the end
            const allExistingStates = await this.adapter.getStatesAsync(`*.${this.idChannelHistory}.*`);

            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id as string);

                await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}`, item.idChannel ? 'historical calculated values' : 'historical values');

                if (item.idContractType) {
                    if (typeof item.id === 'string') {
                        commonCost.unit = this.adapter.costs.getContractType(item.idContractType).currency;
                    } else {
                        // ToDo: handling für calculation items, könnte unterschiedliche Währungen haben, evtl. einfach drauf prüfen
                    }
                }

                if (typeof item.id === 'string') {
                    // history item
                    const itemObj = await this.adapter.getObjectAsync(item.id);
                    commonHistory.unit = itemObj?.common?.unit;
                } else {
                    // history calc item
                    commonHistory.unit = item.unit;

                    if (isAdapterStart) {
                        // creating the channel sturcture for calc items
                        const structure = item.idChannel.split('.');

                        let idTmp = '';
                        for (const id of structure) {
                            if (!idTmp) {
                                idTmp = id;
                            } else {
                                idTmp = `${idTmp}.${id}`;
                            }

                            await objectHandler.createChannel(this.adapter, this.utils, idTmp, id);
                        }
                    }
                }

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        // History of this year
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}.${interval}`, null, null, commonHistory, undefined, false, false);
                        delete allExistingStates[`${this.adapter.namespace}.${idChannel}.${this.idChannelHistory}.${interval}`];

                        if (item.idContractType) {
                            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}.${interval}${this.adapter.costs.idSuffix}`, null, null, commonCost, undefined, false, false);
                            delete allExistingStates[`${this.adapter.namespace}.${idChannel}.${this.idChannelHistory}.${interval}${this.adapter.costs.idSuffix}`];
                        }

                        // Past history
                        const idChannelPast = `${idChannel}.${this.idChannelHistory}._${interval}`

                        if (item[interval] > 0) {
                            await objectHandler.createChannel(this.adapter, this.utils, idChannelPast, `past ${interval}s`);

                            for (let i = 1; i <= item[interval]; i++) {
                                await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannelPast}.${interval}_${helper.zeroPad(i, 2)}`, null, null, commonHistory, undefined, false, false);
                                delete allExistingStates[`${this.adapter.namespace}.${idChannelPast}.${interval}_${helper.zeroPad(i, 2)}`];

                                if (item.idContractType) {
                                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannelPast}.${interval}_${helper.zeroPad(i, 2)}${this.adapter.costs.idSuffix}`, null, null, commonCost, undefined, false, false);
                                    delete allExistingStates[`${this.adapter.namespace}.${idChannelPast}.${interval}_${helper.zeroPad(i, 2)}${this.adapter.costs.idSuffix}`];
                                }
                            }
                        } else {
                            // delete not needed channels
                            if (await this.adapter.objectExists(idChannelPast)) {
                                await this.adapter.delObjectAsync(idChannelPast, { recursive: true });
                                this.log.info(`${logPrefix} deleted history channel '${idChannelPast}' because interval is set to ${item[interval]}`);
                            }
                        }
                    }
                }
            }

            if (allExistingStates && Object.keys(allExistingStates).length > 0) {
                // delete not needed states
                for (const id of Object.keys(allExistingStates)) {
                    if (await this.adapter.objectExists(id)) {
                        await this.adapter.delObjectAsync(id);
                        this.log.info(`${logPrefix} deleted history state '${id}' because it is not needed anymore`);
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async updateNameOfStates(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateNameOfStates]:`

        try {
            const list = [...this.adapter.config.historyList, ... this.adapter.config.historyCalcList];

            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id as string);

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        let name = '';

                        if (interval === Interval.day) {
                            name = `${this.utils.I18n.translate('today')} ${moment().format('DD.MM.')}`
                        } else if (interval === Interval.week) {
                            name = `${this.utils.I18n.translate('this week')} (${moment().startOf('week').format('DD.MM.')} - ${moment().format('DD.MM.')})`
                        } else if (interval === Interval.month) {
                            name = moment().format('MMMM YYYY');
                        } else if (interval === Interval.year) {
                            name = moment().format('YYYY');
                        } else {
                            continue;
                        }

                        await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}.${interval}`, `${name} - ${this.utils.I18n.getTranslatedObject('consumption')[this.adapter.language] || 'consumption'}`, logPrefix);

                        if (item.idContractType) {
                            await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}.${interval}${this.adapter.costs.idSuffix}`, `${name} - ${this.utils.I18n.getTranslatedObject('Costs')[this.adapter.language] || 'Costs'}`, logPrefix);
                        }

                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                if (interval === Interval.day) {
                                    if (i === 1) {
                                        name = `Gestern ${moment().add(-i, 'days').format('DD.MM.')}`
                                    } else {
                                        name = moment().add(-i, 'days').format('dddd DD.MM.');
                                    }
                                } else if (interval === Interval.week) {
                                    if (i === 1) {
                                        name = `letzte Woche (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`
                                    } else {
                                        name = `vor ${i} Wochen (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`
                                    }
                                } else if (interval === Interval.month) {
                                    name = moment().add(-i, 'month').format('MMMM YYYY');
                                } else if (interval === Interval.year) {
                                    name = moment().add(-i, 'year').format('YYYY');
                                } else {
                                    continue;
                                }

                                await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, `${name} - ${this.utils.I18n.getTranslatedObject('consumption')[this.adapter.language] || 'consumption'}`, logPrefix);

                                if (item.idContractType) {
                                    await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}${this.adapter.costs.idSuffix}`, `${name} - ${this.utils.I18n.getTranslatedObject('Costs')[this.adapter.language] || 'Costs'}`, logPrefix);
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async _updateNameOfStates(id: string, name: string, logPrefix: string): Promise<void> {
        try {
            const obj: any = await this.adapter.getObjectAsync(id);

            if (obj && obj.common && obj.common.name !== name) {
                obj.common.name = name;
                await this.adapter.setObject(id, obj);

                this.log.debug(`${logPrefix} update name of '${id}' to '${name}'`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public async updateStates(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateStates]:`

        try {
            await this._updateStates(false);
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async _updateStates(isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[${this.logPrefix}._updateStates]:`

        try {
            for (const item of this.adapter.config.historyList) {
                const currentState = await this.adapter.getStateAsync(item.id as string);

                if (!this.adapter.config.fastStart) {
                    await this.updateThisYear(item, currentState, isAdapterStart);
                    await this.updateThePast(item, isAdapterStart);
                } else {
                    void this.updateThisYear(item, currentState, isAdapterStart);
                    void this.updateThePast(item, isAdapterStart);
                }

            }

            for (const item of this.adapter.config.historyCalcList) {
                if (!this.adapter.config.fastStart) {
                    await this.updateCalculatedThisYear(item, isAdapterStart);
                    await this.updateCalculatedThePast(item);
                } else {
                    void this.updateCalculatedThisYear(item, isAdapterStart);
                    void this.updateCalculatedThePast(item);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateThisYear(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State, isAdapterStart: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateThisYear] [${helper.getIdWithoutLastPart(item.id as string)}]:`

        try {
            const datapointItem = this.adapter.datapoints.getByIdTarget(item.id as string);

            if (datapointItem && datapointItem.enable) {
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        const id = `${helper.getIdWithoutLastPart(item.id as string)}.${this.idChannelHistory}.${interval}`

                        await this.updateHistory(id, item, datapointItem, interval, null, currentState);
                    }
                }

                if (isAdapterStart) {
                    this.log.info(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
                }
            } else {
                this.log.debug(`${logPrefix} is disabled, no history processing available`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateThePast(item: ioBroker.AdapterConfigTypes.HistoryItem, isAdapterStart: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateThePast] [${helper.getIdWithoutLastPart(item.id as string)}]:`

        try {
            const datapointItem = this.adapter.datapoints.getByIdTarget(item.id as string);

            if (datapointItem && datapointItem.enable) {
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {

                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                const id = `${helper.getIdWithoutLastPart(item.id as string)}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`;

                                await this.updateHistory(id, item, datapointItem, interval, i, null);
                            }
                        } else {
                            this.adapter.log.debug(`${logPrefix} history for interval '${interval}' is disabled`);
                        }

                        this.log.debug(`${logPrefix} [_${interval}] history ${item.idContractType ? ' and costs ' : ' '} for interval updated`);
                    }
                }

                this.log.info(`${logPrefix} history states of the past updated`);

            } else {
                this.log.debug(`${logPrefix} is disabled, no history processing available`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateHistory(id: string, item: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, interval: string, i: number | null, currentState: ioBroker.State | null): Promise<void> {
        const logPrefixAppend = `[${datapointItem.idChannelTarget}] [${helper.getIdLastPart(id)}]`
        const logPrefix = `[${this.logPrefix}.updateHistory] ${logPrefixAppend}:`

        try {
            const range = this.getDatesFromInterval(interval, i);

            let result: number = null;
            let costsResult: number = null;

            if (datapointItem.type === 'number') {
                if (item.idContractType) {
                    // Wenn Kosten aktiviert sind, nehmen wir den Verbrauch aus der Kostenberechnung um Abfragen auf die Datenbank zu minimieren
                    const data = await this.adapter.costs.getCostOfRange(item, datapointItem, range.start, range.end, helper.getIdLastPart(id));

                    if (data) {
                        result = data.consumption;
                        costsResult = data.sum;
                    }
                }

                if (result === null) {
                    // Kosten nicht aktiviert oder Kosten sind aktiviert, aber für Zeitraum konnte kein Verbrauch ermittelt werden
                    const data = await this.adapter.sql.getTotal(item, datapointItem, interval, range.start.valueOf(), range.end.valueOf(), logPrefixAppend);

                    if (data && data.start && data.end && data.delta !== null) {
                        if (i === null) {
                            // values of this year -> taking current state value for delta calculation
                            result = mathjs.round((currentState.val as number) - data.min, item.decimals);
                        } else {
                            result = mathjs.round(data.delta, item.decimals);
                        }
                    }
                }
            } else if (datapointItem.type === 'boolean') {
                const data = await this.adapter.sql.getCounter(datapointItem, interval, logPrefixAppend, range.start.valueOf(), range.end.valueOf(), item);

                if (data && ((data.start && data.end) || range.start.isSame(moment(), 'day'))) {
                    result = data.count;
                }

            } else {
                this.log.error(`${logPrefix} state '${item.id as string}' has unsupported type '${datapointItem.type}', cannot processing functions'`);
            }

            await this.adapter.setStateChangedAsync(id, result, true);

            if (item.idContractType) {
                await this.adapter.setStateChangedAsync(`${id}${this.adapter.costs.idSuffix}`, costsResult, true);
            }

            this.adapter.itemDebug(item, `${logPrefix} start: ${moment(range.start).format('DD.MM.YYYY - HH:mm')}, end: ${moment(range.end).format('DD.MM.YYYY - HH:mm')}, result: ${result}`);

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private checkCalculationConditions(item: ioBroker.AdapterConfigTypes.HistoryItem): boolean {
        const logPrefix = `[${this.logPrefix}.checkCalculationConditions] [${item.idChannel}]:`

        try {
            for (const id of item.id) {
                // first check if all datapoints are enabled, because all are needed for the calculation
                const datapointItem = this.adapter.datapoints.getByIdTarget(id);

                if (!datapointItem) {
                    this.log.error(`${logPrefix} datapoint '${id}' not found, but it's mandatory for the calculation -> abort!`);
                    return false;
                }

                if (!datapointItem.enable) {
                    this.log.error(`${logPrefix} datapoint '${id}' is not enabled, but it's mandatory for the calculation -> abort!`);
                    return false;
                }

                const historyItem = this.adapter.history.getByIdTarget(id);
                if (!historyItem) {
                    this.log.error(`${logPrefix} history item for '${id}' not found, but it's mandatory for the calculation -> abort!`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
            return false;
        }
    }

    private async updateCalculatedThisYear(item: ioBroker.AdapterConfigTypes.HistoryItem, isAdapterStart: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateCalculatedThisYear] [${item.idChannel}]:`

        try {
            if (this.checkCalculationConditions(item)) {
                const debugFormula = item.formula.replace(/\[(\d+)\]/g, (_, index: string) => {
                    return helper.getIdWithoutLastPart(item.id[Number(index)]);
                });

                this.adapter.itemDebug(item, `${logPrefix} calculation formula: ${debugFormula}`);

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {

                        const calculation = await this.getCalculation(item, interval);

                        if (calculation) {
                            this.adapter.itemDebug(item, `${logPrefix} [_${interval}] consumption calculation: ${debugFormula} => ${calculation.formula} = ${calculation.consumption}`);

                            await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}.${interval}`, calculation.consumption, true);

                            if (item.idContractType === 'fromCalculation') {
                                this.adapter.itemDebug(item, `${logPrefix} [_${interval}] cost calculation: ${debugFormula} => ${calculation.formulaCosts} = ${calculation.costs}`);

                                await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}.${interval}${this.adapter.costs.idSuffix}`, calculation.costs, true);
                            }
                        }
                    }
                }

                if (isAdapterStart) {
                    this.log.info(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateCalculatedThePast(item: ioBroker.AdapterConfigTypes.HistoryItem): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateCalculatedThePast] [${item.idChannel}]:`

        try {
            if (this.checkCalculationConditions(item)) {
                const debugFormula = item.formula.replace(/\[(\d+)\]/g, (_, index: string) => {
                    return helper.getIdWithoutLastPart(item.id[Number(index)]);
                });

                this.adapter.itemDebug(item, `${logPrefix} calculation formula: ${debugFormula}`);

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {

                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                const calculation = await this.getCalculation(item, interval, i);

                                if (calculation) {
                                    this.adapter.itemDebug(item, `${logPrefix} [${interval}_${helper.zeroPad(i, 2)}] consuption calculation: ${debugFormula} => ${calculation.formula} = ${calculation.consumption}`);

                                    await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, calculation.consumption, true);

                                    if (item.idContractType === 'fromCalculation') {
                                        this.adapter.itemDebug(item, `${logPrefix} [${interval}_${helper.zeroPad(i, 2)}] cost calculation: ${debugFormula} => ${calculation.formulaCosts} = ${calculation.costs}`);

                                        await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}${this.adapter.costs.idSuffix}`, calculation.costs, true);
                                    }
                                }
                            }
                        } else {
                            this.adapter.log.debug(`${logPrefix} [${interval}] history for interval '${interval}' is disabled`);
                        }
                    }
                }

                this.log.info(`${logPrefix} history states of the past updated`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async getCalculation(item: ioBroker.AdapterConfigTypes.HistoryItem, interval: string, i: number | null = null): Promise<{ consumption: number, formula: string, costs: number, formulaCosts: string } | null> {
        const logPrefix = `[${this.logPrefix}.getCalculation] [${item.idChannel}] [${interval}]:`

        try {
            const calcArray = [];
            const calcCostsArray = [];

            for (const id of item.id) {
                const datapointItem = this.adapter.datapoints.getByIdTarget(id);

                if (datapointItem && datapointItem.enable) {

                    const state = await this.adapter.getStateAsync(`${helper.getIdWithoutLastPart(id)}.${this.idChannelHistory}.${i === null ? interval : `_${interval}.${interval}_${helper.zeroPad(i, 2)}`}`);

                    if (state && (state.val || state.val === 0)) {
                        calcArray.push(state.val);
                    } else {
                        this.adapter.itemDebug(item, `${logPrefix} [${i === null ? interval : `${interval}_${helper.zeroPad(i, 2)}`}] '${id}' no consuption data available, using 0 instead`);
                        calcArray.push(0);
                    }

                    if (item.idContractType === 'fromCalculation') {
                        const state = await this.adapter.getStateAsync(`${helper.getIdWithoutLastPart(id)}.${this.idChannelHistory}.${i === null ? interval : `_${interval}.${interval}_${helper.zeroPad(i, 2)}`}${this.adapter.costs.idSuffix}`);

                        if (state && (state.val || state.val === 0)) {
                            calcCostsArray.push(state.val);
                        } else {
                            this.adapter.itemDebug(item, `${logPrefix} [${i === null ? interval : `${interval}_${helper.zeroPad(i, 2)}`}] '${id}' no cost data available, using 0 instead`);
                            calcCostsArray.push(0);
                        }
                    }
                } else {
                    this.log.error(`${logPrefix} source '${id}' is disabled, no history processing is possible -> abort!`);
                    return null;
                }
            }

            const consumption = item.formula.replace(/\[(\d+)\]/g, (_, index: string) => {
                return calcArray[Number(index)];
            });

            const costs = item.formula.replace(/\[(\d+)\]/g, (_, index: string) => {
                return calcCostsArray[Number(index)];
            });

            return {
                consumption: mathjs.round(mathjs.evaluate(consumption), 3),
                formula: consumption,
                costs: item.idContractType === 'fromCalculation' ? mathjs.round(mathjs.evaluate(costs), 2) : null,
                formulaCosts: item.idContractType === 'fromCalculation' ? costs : null
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    public async onStateChange(item: ioBroker.AdapterConfigTypes.HistoryItem, currentState: ioBroker.State, isCalculation: boolean, force: boolean = false): Promise<void> {
        const logPrefix = `[${this.logPrefix}.onStateChange] [${helper.getIdWithoutLastPart(typeof item.id === 'string' ? item.id : item.idChannel)}]:`

        try {
            const idChannel = item.idChannel ? item.idChannel : helper.getIdWithoutLastPart(item.id as string);

            if (this.adapter.timeoutDebounceList[idChannel]) {
                this.adapter.clearTimeout(this.adapter.timeoutDebounceList[idChannel]);
                delete this.adapter.timeoutDebounceList[idChannel];
            }

            const total = await this.adapter.getStateAsync(`${idChannel}.${this.idChannelHistory}.${Interval.day}`);

            if ((currentState.lc - total.lc > ((item.debounce || 15)) * 1000) || item.debounce === 0 || force) {
                if (isCalculation) {
                    await this.updateCalculatedThisYear(item);
                } else {
                    await this.updateThisYear(item, currentState);

                    if (item.idContractType) {
                        const billingList = this.adapter.billing.getListByIdTarget(item.id, true);

                        if (billingList && billingList.length > 0) {
                            for (const billingItem of billingList) {
                                await this.adapter.billing.onStateChange(billingItem, item);
                            }
                        }
                    }
                }
            } else {
                this.adapter.timeoutDebounceList[idChannel] = this.adapter.setTimeout(async () => {
                    await this.onStateChange(item, currentState, isCalculation, true);
                    this.adapter.itemDebug(item, `${logPrefix} no new value after debounce time -> recheck after timeout done`);
                }, (item.debounce || 15) * 1000);
            }

            this.log.silly(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private getDatesFromInterval(interval: string, intervalDelta: number | null = null): { start: moment.Moment; end: moment.Moment; } | undefined {
        const logPrefix = `[${this.logPrefix}.getDatesFromInterval]:`

        try {
            const start = moment().startOf(interval as unitOfTime.StartOf).add(intervalDelta === null ? 0 : -intervalDelta, interval as DurationInputArg2);

            return {
                start: start,
                end: intervalDelta === null ? moment() : start.clone().endOf(interval as unitOfTime.StartOf)
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return undefined;
    }
}