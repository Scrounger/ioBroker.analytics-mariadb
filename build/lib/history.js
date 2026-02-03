import moment from 'moment';
import * as mathjs from 'mathjs';
import * as helper from './helper.js';
import * as objectHandler from './objectHandler.js';
import { Interval } from './sqlInterface.js';
export class History {
    logPrefix = 'History';
    adapter;
    utils;
    log;
    idChannelHistory = 'history';
    constructor(adapter, utils) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }
    async init() {
        const logPrefix = `[${this.logPrefix}.init]:`;
        try {
            await this.createStates(true);
            await this.updateNameOfStates();
            await this._updateStates(true);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getByIdTarget(idTarget) {
        return this.adapter.config.historyList.find(item => item.id === idTarget);
    }
    getCalculationByIdTarget(idTarget) {
        return this.adapter.config.historyCalcList.filter(x => x.id.includes(idTarget));
    }
    async createStates(isAdapterStart) {
        const logPrefix = `[${this.logPrefix}.createStates]:`;
        try {
            const list = [...this.adapter.config.historyList, ...this.adapter.config.historyCalcList];
            const commonHistory = {
                name: 'generic',
                type: 'number',
                role: 'state',
                read: true,
                write: false,
                def: 0,
            };
            const commonCost = { ...commonHistory };
            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id);
                await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}`, item.idChannel ? 'historical calculated values' : 'historical values');
                if (item.idContractType) {
                    await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.adapter.costs.idChannelCost}`, 'costs for historical values');
                    commonCost.unit = this.adapter.costs.getContractType(item.idContractType).currency;
                }
                if (typeof item.id === 'string') {
                    // history item
                    const itemObj = await this.adapter.getObjectAsync(item.id);
                    commonHistory.unit = itemObj?.common?.unit;
                }
                else {
                    // history calc item
                    commonHistory.unit = item.unit;
                    if (isAdapterStart) {
                        // creating the channel sturcture for calc items
                        const structure = item.idChannel.split('.');
                        let idTmp = '';
                        for (const id of structure) {
                            if (!idTmp) {
                                idTmp = id;
                            }
                            else {
                                idTmp = `${idTmp}.${id}`;
                            }
                            await objectHandler.createChannel(this.adapter, this.utils, idTmp, id);
                        }
                    }
                }
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}.${interval}`, null, null, commonHistory, undefined, false, false);
                        await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}._${interval}`, `past ${interval}s`);
                        if (item.idContractType) {
                            await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.adapter.costs.idChannelCost}.${interval}`, null, null, commonCost, undefined, false, false);
                            await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.adapter.costs.idChannelCost}._${interval}`, `past ${interval}s`);
                        }
                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, null, null, commonHistory, undefined, false, false);
                                if (item.idContractType) {
                                    await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.adapter.costs.idChannelCost}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, null, null, commonCost, undefined, false, false);
                                }
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
    async updateNameOfStates() {
        const logPrefix = `[${this.logPrefix}.updateNameOfStates]:`;
        try {
            const list = [...this.adapter.config.historyList, ...this.adapter.config.historyCalcList];
            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id);
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        let name = '';
                        if (interval === Interval.day) {
                            name = `${this.utils.I18n.translate('today')} ${moment().format('DD.MM.')}`;
                        }
                        else if (interval === Interval.week) {
                            name = `${this.utils.I18n.translate('this week')} (${moment().startOf('week').format('DD.MM.')} - ${moment().format('DD.MM.')})`;
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
                        await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}.${interval}`, name, logPrefix);
                        if (item.idContractType) {
                            await this._updateNameOfStates(`${idChannel}.${this.adapter.costs.idChannelCost}.${interval}`, name, logPrefix);
                        }
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
                                await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, name, logPrefix);
                                if (item.idContractType) {
                                    await this._updateNameOfStates(`${idChannel}.${this.adapter.costs.idChannelCost}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, name, logPrefix);
                                }
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
    async _updateNameOfStates(id, name, logPrefix) {
        try {
            const obj = await this.adapter.getObjectAsync(id);
            if (obj && obj.common && obj.common.name !== name) {
                obj.common.name = name;
                await this.adapter.setObject(id, obj);
                this.log.debug(`${logPrefix} update name of '${id}' to '${name}'`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateStates() {
        const logPrefix = `[${this.logPrefix}.updateStates]:`;
        try {
            await this._updateStates(false);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async _updateStates(isAdapterStart) {
        const logPrefix = `[${this.logPrefix}._updateStates]:`;
        try {
            for (const item of this.adapter.config.historyList) {
                const currentState = await this.adapter.getStateAsync(item.id);
                await this.updateThisYear(item, currentState, isAdapterStart);
                await this.updateThePast(item, isAdapterStart);
            }
            for (const item of this.adapter.config.historyCalcList) {
                for (const id of item.id) {
                    // first check if all datapoints are enabled, because all are needed for the calculation
                    const datapointItem = this.adapter.datapoints.getByIdTarget(id);
                    if (!datapointItem || !datapointItem.enable) {
                        this.log.error(`${logPrefix} datapoint '${helper.getIdWithoutLastPart(id)}' not enabled or exists, but it's mandatory for the calculation -> abort!`);
                        return;
                    }
                }
                await this.updateCalculatedThisYear(item, isAdapterStart);
                await this.updateCalculatedThePast(item);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateThisYear(item, currentState, isAdapterStart = false) {
        const logPrefix = `[${this.logPrefix}.updateThisYear] [${helper.getIdWithoutLastPart(item.id)}]:`;
        try {
            const datapointItem = this.adapter.datapoints.getByIdTarget(item.id);
            if (datapointItem && datapointItem.enable) {
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        const id = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelHistory}.${interval}`;
                        await this.updateHistory(id, item, datapointItem, interval, null, currentState);
                    }
                }
                if (isAdapterStart) {
                    this.log.info(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
                }
            }
            else {
                this.log.debug(`${logPrefix} is disabled, no history processing available`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateThePast(item, isAdapterStart = false) {
        const logPrefix = `[${this.logPrefix}.updateThePast] [${helper.getIdWithoutLastPart(item.id)}]:`;
        try {
            const datapointItem = this.adapter.datapoints.getByIdTarget(item.id);
            if (datapointItem && datapointItem.enable) {
                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                const id = `${helper.getIdWithoutLastPart(item.id)}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`;
                                await this.updateHistory(id, item, datapointItem, interval, i, null);
                            }
                        }
                        else {
                            this.adapter.log.debug(`${logPrefix} history for interval '${interval}' is disabled`);
                        }
                        this.log.debug(`${logPrefix} [${interval}] history ${item.idContractType ? ' and costs ' : ' '} for interval updated`);
                    }
                }
                this.log.info(`${logPrefix} history states of the past updated`);
            }
            else {
                this.log.debug(`${logPrefix} is disabled, no history processing available`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateHistory(id, item, datapointItem, interval, i, currentState) {
        const logPrefixAppend = `[${datapointItem.idChannelTarget}] [${helper.getIdLastPart(id)}]`;
        const logPrefix = `[${this.logPrefix}.updateStateHistory] ${logPrefixAppend}:`;
        try {
            const range = this.getDatesFromInterval(interval, i);
            let result = null;
            let costResult = null;
            if (datapointItem.type === 'number') {
                const data = await this.adapter.sql.getTotal(item, datapointItem, interval, range.start.valueOf(), range.end.valueOf(), logPrefixAppend);
                if (data && data.start && data.end && data.delta !== null) {
                    if (i === null) {
                        // values of this year -> taking current state value for delta calculation
                        result = mathjs.round(currentState.val - data.min, item.decimals);
                    }
                    else {
                        result = mathjs.round(data.delta, item.decimals);
                    }
                    if (item.idContractType) {
                        costResult = await this.adapter.costs.getCostOfRange(item, datapointItem, range.start, range.end, helper.getIdLastPart(id));
                    }
                }
            }
            else if (datapointItem.type === 'boolean') {
                const data = await this.adapter.sql.getCounter(datapointItem, interval, logPrefixAppend, range.start.valueOf(), range.end.valueOf());
                if (data && ((data.start && data.end) || range.start.isSame(moment(), 'day'))) {
                    result = data.count;
                }
            }
            else {
                this.log.error(`${logPrefix} state '${item.id}' has unsupported type '${datapointItem.type}', cannot processing functions'`);
            }
            await this.adapter.setStateChangedAsync(id, result, true);
            if (item.idContractType) {
                await this.adapter.setStateChangedAsync(`${id.replace(`.${this.idChannelHistory}.`, `.${this.adapter.costs.idChannelCost}.`)}`, costResult ? costResult.sum : null, true);
            }
            this.adapter.itemDebug(item, `${logPrefix} start: ${moment(range.start).format('DD.MM.YYYY - HH:mm')}, end: ${moment(range.end).format('DD.MM.YYYY - HH:mm')}, result: ${result}`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateCalculatedThisYear(item, isAdapterStart = false) {
        const logPrefix = `[${this.logPrefix}.updateCalculatedThisYear] [${item.idChannel}]:`;
        try {
            const debugFormula = item.formula.replace(/\[(\d+)\]/g, (_, index) => {
                return helper.getIdWithoutLastPart(item.id[Number(index)]);
            });
            this.adapter.itemDebug(item, `${logPrefix} calculation formula: ${debugFormula}`);
            for (const interval of Object.keys(Interval)) {
                if (interval !== Interval.ALL) {
                    const calculation = await this.getCalculation(item, interval);
                    if (calculation) {
                        this.adapter.itemDebug(item, `${logPrefix} [${interval}] calculation: ${debugFormula} => ${calculation.formula} = ${calculation.result}`);
                        await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}.${interval}`, calculation.result, true);
                    }
                }
            }
            if (isAdapterStart) {
                this.log.info(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async updateCalculatedThePast(item) {
        const logPrefix = `[${this.logPrefix}.updateCalculatedThePast] [${item.idChannel}]:`;
        try {
            const debugFormula = item.formula.replace(/\[(\d+)\]/g, (_, index) => {
                return helper.getIdWithoutLastPart(item.id[Number(index)]);
            });
            this.adapter.itemDebug(item, `${logPrefix} calculation formula: ${debugFormula}`);
            for (const interval of Object.keys(Interval)) {
                if (interval !== Interval.ALL) {
                    if (item[interval] > 0) {
                        for (let i = 1; i <= item[interval]; i++) {
                            const calculation = await this.getCalculation(item, interval, i);
                            if (calculation) {
                                this.adapter.itemDebug(item, `${logPrefix} [${interval}_${helper.zeroPad(i, 2)}] calculation: ${debugFormula} => ${calculation.formula} = ${calculation.result}`);
                                await this.adapter.setStateChangedAsync(`${item.idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, calculation.result, true);
                            }
                        }
                    }
                    else {
                        this.adapter.log.debug(`${logPrefix} [${interval}] history for interval '${interval}' is disabled`);
                    }
                }
            }
            this.log.info(`${logPrefix} history states of the past updated`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async getCalculation(item, interval, i = null) {
        const logPrefix = `[${this.logPrefix}.getCalculation] [${item.idChannel}] [${interval}]:`;
        try {
            const calcArray = [];
            for (const id of item.id) {
                const datapointItem = this.adapter.datapoints.getByIdTarget(id);
                if (datapointItem && datapointItem.enable) {
                    const state = await this.adapter.getStateAsync(`${helper.getIdWithoutLastPart(id)}.${this.idChannelHistory}.${i === null ? interval : `_${interval}.${interval}_${helper.zeroPad(i, 2)}`}`);
                    if (state && (state.val || state.val === 0)) {
                        calcArray.push(state.val);
                    }
                    else {
                        this.adapter.itemDebug(item, `${logPrefix} [${i === null ? interval : `${interval}_${helper.zeroPad(i, 2)}`}] '${id}' no data available, using 0 instead`);
                        calcArray.push(0);
                    }
                }
                else {
                    this.log.error(`${logPrefix} source '${id}' is disabled, no history processing is possible -> abort!`);
                    return null;
                }
            }
            const formula = item.formula.replace(/\[(\d+)\]/g, (_, index) => {
                return calcArray[Number(index)];
            });
            return {
                result: mathjs.round(mathjs.evaluate(formula), 3),
                formula: formula
            };
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
    async onStateChange(item, currentState, isCalculation) {
        const logPrefix = `[${this.logPrefix}.onStateChange] [${helper.getIdWithoutLastPart(typeof item.id === 'string' ? item.id : item.idChannel)}]:`;
        try {
            const idChannel = item.idChannel ? item.idChannel : helper.getIdWithoutLastPart(item.id);
            if (this.adapter.timeoutDebounceList[idChannel]) {
                this.adapter.clearTimeout(this.adapter.timeoutDebounceList[idChannel]);
                delete this.adapter.timeoutDebounceList[idChannel];
            }
            const total = await this.adapter.getStateAsync(`${idChannel}.${this.idChannelHistory}.${Interval.day}`);
            if (currentState.lc - total.lc > ((item.debounce || 15)) * 1000) {
                if (isCalculation) {
                    await this.updateCalculatedThisYear(item);
                }
                else {
                    await this.updateThisYear(item, currentState);
                }
            }
            else {
                this.adapter.timeoutDebounceList[idChannel] = this.adapter.setTimeout(async () => {
                    await this.onStateChange(item, currentState, isCalculation);
                    this.adapter.itemDebug(item, `${logPrefix} no new value after debounce time -> recheck after timeout done`);
                }, (item.debounce || 15) * 1000);
            }
            this.log.silly(`${logPrefix} history${item.idContractType ? ' and costs ' : ' '}states of this year updated`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getDatesFromInterval(interval, intervalDelta = null) {
        const logPrefix = `[${this.logPrefix}.getDatesFromInterval]:`;
        try {
            const start = moment().startOf(interval).add(intervalDelta === null ? 0 : -intervalDelta, interval);
            return {
                start: start,
                end: intervalDelta === null ? moment() : start.clone().endOf(interval)
            };
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return undefined;
    }
}
