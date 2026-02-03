import moment from "moment";
import * as mathjs from 'mathjs';
import * as helper from './helper.js';
export class Costs {
    logPrefix = 'Costs';
    adapter;
    log;
    idChannelCost = 'costs';
    costList = {};
    constructor(adapter) {
        this.adapter = adapter;
        this.log = adapter.log;
    }
    async init() {
        const logPrefix = `[${this.logPrefix}.init]:`;
        try {
            this.prepareAndCheckCostList();
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getContractType(idContractType) {
        return this.adapter.config.costsContractTypesList.find(item => item.id === idContractType);
    }
    prepareAndCheckCostList() {
        const logPrefix = `[${this.logPrefix}.prepareAndCheckCostList]:`;
        try {
            for (const type of this.adapter.config.costsContractTypesList) {
                const costItem = {
                    calculation: type.calcFormula,
                    data: this.adapter.config.costsContractDataList.filter(x => x.idContractType === type.id).map(c => ({
                        provider: c.provider,
                        start: moment(c.start).format(this.adapter.dateFormat),
                        end: moment(c.end).format(this.adapter.dateFormat),
                        variableCosts: Object.fromEntries(c.variableCosts.map(entry => {
                            const [key, value] = entry.split(":");
                            return [key, parseFloat(value.replace(",", "."))];
                        })),
                        basicPrice: c.basicPrice,
                        bonusPrice: c.bonusPrice,
                    })).sort((a, b) => {
                        const dateA = moment(a.start, this.adapter.dateFormat);
                        const dateB = moment(b.start, this.adapter.dateFormat);
                        return dateA.diff(dateB);
                    })
                };
                this.costList[type.id] = costItem;
                for (let i = 0; i <= costItem.data.length - 1; i++) {
                    if (costItem.data[i + 1]) {
                        const item = costItem.data[i];
                        const nextItem = costItem.data[i + 1];
                        const diff = moment(nextItem.start, this.adapter.dateFormat).diff(moment(item.end, this.adapter.dateFormat), 'days');
                        if (diff !== 1) {
                            this.log.warn(`${logPrefix} contract type '${type.id}' has a gap in the contract data (provider: ${item.provider} end: ${item.end} - provider: ${nextItem.provider} start: ${nextItem.start} -> gap: ${diff} days)`);
                        }
                    }
                }
                this.adapter.itemDebug(type, `${logPrefix} contract type '${type.id}' data: ${JSON.stringify(this.costList[type.id])}`);
            }
            this.log.debug(`${logPrefix} contract types with data: ${JSON.stringify(this.costList)}`);
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    async getCostOfRange(item, datapointItem, rangeStart, rangeEnde, interval = undefined) {
        const logPrefixAppend = `[${helper.getIdWithoutLastPart(item.id)}]${interval ? ` [${interval}] ` : ' [manual] '}[${item.idContractType}]`;
        const logPrefix = `[${this.logPrefix}.getCostOfRange] ${logPrefixAppend}:`;
        try {
            const result = {};
            const contractDataOfRange = this.costList[item.idContractType].data.filter((x) => {
                const contractStart = moment(x.start, this.adapter.dateFormat, true);
                const contractEnd = moment(x.end, this.adapter.dateFormat, true);
                return rangeStart.isSameOrBefore(contractEnd) && rangeEnde.isSameOrAfter(contractStart);
            });
            if (contractDataOfRange && contractDataOfRange.length > 0) {
                this.adapter.itemDebug(item, `${logPrefix} time period from ${rangeStart.format(this.adapter.dateFormat)} to ${rangeEnde.format(this.adapter.dateFormat)} - contract data: ${JSON.stringify(contractDataOfRange)}`);
                for (const data of contractDataOfRange) {
                    const cStart = moment(data.start, this.adapter.dateFormat, true);
                    const cEnd = moment(data.end, this.adapter.dateFormat, true);
                    let start = cStart;
                    let end = cEnd;
                    if (rangeStart.isAfter(cStart)) {
                        start = rangeStart;
                    }
                    if (rangeEnde.isBefore(cEnd)) {
                        end = rangeEnde;
                    }
                    this.adapter.itemDebug(item, `${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} - contract data: ${JSON.stringify(data)}`);
                    const consumption = await this.adapter.sql.getTotal(item, datapointItem, interval, start.startOf('day').valueOf(), end.endOf('day').valueOf(), logPrefixAppend);
                    result.start = result.start ? start.isBefore(result.start) ? start : result.start : start;
                    result.end = result.end ? end.isAfter(result.start) ? end : result.end : end;
                    if (consumption && consumption.delta !== null) {
                        const daysOfRange = end.diff(start, 'days') + 1;
                        let delta = consumption.delta;
                        if (end.isAfter(moment()) || end.isSame(moment(), 'day')) {
                            const state = await this.adapter.getStateAsync(item.id);
                            delta = state.val - consumption.min;
                            this.log.silly(`${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} using state, not database value (delta: ${mathjs.round(delta, item.decimals)}, database delta: ${mathjs.round(consumption.delta, 3)})`);
                        }
                        this.calculationOfRange(this.costList[item.idContractType].calculation, data, delta, daysOfRange, result, logPrefixAppend);
                        this.adapter.itemDebug(item, `${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} - calculation result: ${JSON.stringify(result)}`);
                    }
                }
                if (result.start.isSame(rangeStart, 'day') && result.end.isSame(rangeEnde, 'day')) {
                    if (result.consumption && result.sum) {
                        if (item.costSumOptions?.length > 0) {
                            result.consumption = mathjs.round(result.consumption, item.decimals);
                            result.sum = mathjs.round((item.costSumOptions?.includes('variableCosts') ? result.variableCosts : 0)
                                + (item.costSumOptions?.includes('basicPrice') ? result.basicPrice : 0)
                                - (item.costSumOptions?.includes('bonusPrice') ? result.bonusPrice : 0), 2);
                        }
                        else {
                            this.log.warn(`${logPrefix} no cost sum options in the adapter settings defined`);
                            result.sum = null;
                        }
                        this.adapter.itemDebug(item, `${logPrefix} start: ${rangeStart.format('DD.MM.YYYY - HH:mm')}, end: ${rangeEnde.format('DD.MM.YYYY - HH:mm')}, sum: ${result.sum}`);
                        return result;
                    }
                    else {
                        this.adapter.itemDebug(item, `${logPrefix} no cosumption or sum property available in the result: ${JSON.stringify(result)}`);
                    }
                }
                else {
                    this.log.error(`${logPrefix} costs can't be calculated because period (${result.start.format(this.adapter.dateFormat)} - ${result.end.format(this.adapter.dateFormat)}) does not match requested period (${rangeStart.format(this.adapter.dateFormat)} - ${rangeEnde.format(this.adapter.dateFormat)}) -> Missing contract data!`);
                }
            }
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
        return null;
    }
    calculationOfRange(formula, data, consumptionOfRange, daysOfRange, result, logPrefixAppend) {
        const logPrefix = `[${this.logPrefix}.calculationOfRange] ${logPrefixAppend}:`;
        try {
            const calc = formula.replace(/#([a-zA-Z0-9_]+)/g, (_, key) => {
                if (key === 'val') {
                    return consumptionOfRange.toString();
                }
                else {
                    return data.variableCosts[key].toString();
                }
            });
            result.consumption = (result.consumption || 0) + consumptionOfRange;
            result.days = (result.days || 0) + daysOfRange;
            result.variableCosts = (result.variableCosts || 0) + mathjs.evaluate(calc);
            result.basicPrice = (result.basicPrice || 0) + (data.basicPrice / 365) * daysOfRange;
            result.bonusPrice = (result.bonusPrice || 0) + (data.bonusPrice / 365) * daysOfRange;
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}
