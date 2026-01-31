import moment from "moment";
import * as mathjs from 'mathjs';
import * as helper from './helper.js';
export class Cost {
    logPrefix = 'Cost';
    adapter;
    utils;
    log;
    idChannelCost = 'cost';
    costList = {};
    constructor(adapter, utils) {
        this.adapter = adapter;
        this.utils = utils;
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
                    if (consumption && consumption.delta !== null) {
                        const daysOfRange = end.diff(start, 'days') + 1;
                        this.calculationOfRange(this.costList[item.idContractType].calculation, data, consumption.delta, daysOfRange, result, logPrefixAppend);
                        this.adapter.itemDebug(item, `${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} - calculation result: ${JSON.stringify(result)}`);
                    }
                }
                if (item.costSumOptions?.length > 0) {
                    result.sum = mathjs.round((item.costSumOptions?.includes('variableCosts') ? result.variableCosts : 0)
                        + (item.costSumOptions?.includes('basicPrice') ? result.basicPrice : 0)
                        - (item.costSumOptions?.includes('bonusPrice') ? result.bonusPrice : 0), 2);
                }
                else {
                    this.log.warn(`${logPrefix} no cost sum options in the adapter settings defined`);
                    result.sum = null;
                }
                this.adapter.itemDebug(item, `${logPrefix} time period from ${rangeStart.format(this.adapter.dateFormat)} to ${rangeEnde.format(this.adapter.dateFormat)} - total calculation result: ${JSON.stringify(result)}`);
                return result;
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
