import moment from "moment";
import * as mathjs from 'mathjs'

import * as helper from './helper.js';


export interface CostResult {
    start?: moment.Moment;
    end?: moment.Moment;
    consumption?: number;
    variableCosts?: number;
    basicPrice?: number;
    bonusPrice?: number;
    days?: number
    sum?: number;
}

export class Costs {
    private logPrefix: string = 'Costs'

    private adapter: ioBroker.myAdapter;
    private log: ioBroker.Logger;

    // public idChannelCost = 'costs';

    public idSuffix = '_costs';

    private costList: ioBroker.AdapterConfigTypes.CostList = {};

    constructor(adapter: ioBroker.myAdapter) {
        this.adapter = adapter;
        this.log = adapter.log;
    }

    public init(): void {
        const logPrefix = `[${this.logPrefix}.init]:`

        try {
            this.prepareAndCheckCostList();

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType {
        return this.adapter.config.costsContractTypesList.find(
            item => item.id === idContractType
        );
    }

    private prepareAndCheckCostList(): void {
        const logPrefix = `[${this.logPrefix}.prepareAndCheckCostList]:`

        try {
            for (const type of this.adapter.config.costsContractTypesList) {
                const costItem: ioBroker.AdapterConfigTypes.CostItem = {
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
                }

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

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Kosten für einen Zeitraum ermitteln, dabei werden die Verträge berücksichtigt, die in diesem Zeitraum gültig waren, sowie die Verbrauchswerte aus der Datenbank. 
     * Es wird geprüft, ob der Zeitraum vollständig von den Vertragsdaten abgedeckt ist, da sonst keine Kostenberechnung möglich ist.
     * 
     * @param historyItem 
     * @param datapointItem 
     * @param rangeStart 
     * @param rangeEnd 
     * @param interval 
     * @returns 
     */
    public async getCostOfRange(historyItem: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, rangeStart: moment.Moment, rangeEnd: moment.Moment, interval: string = undefined): Promise<CostResult> {
        const logPrefixAppend = `[${helper.getIdWithoutLastPart(historyItem.id as string)}]${interval ? ` [${interval}] ` : ' [manual] '}[${historyItem.idContractType}]`
        const logPrefix = `[${this.logPrefix}.getCostOfRange] ${logPrefixAppend}:`

        try {
            rangeStart = rangeStart.startOf('day');
            rangeEnd = rangeEnd.endOf('day');

            const result: CostResult = {};

            // alle Verträge des Vertragstyps filtern, die in dem Zeitraum gültig sind 
            // (start oder end liegt in dem Zeitraum oder der Zeitraum liegt komplett innerhalb von start und end)
            const contractDataOfRange = this.costList[historyItem.idContractType].data.filter((x) => {
                const contractStart = moment(x.start, this.adapter.dateFormat, true);
                const contractEnd = moment(x.end, this.adapter.dateFormat, true);

                return rangeStart.isSameOrBefore(contractEnd) && rangeEnd.isSameOrAfter(contractStart)
            });

            if (contractDataOfRange && contractDataOfRange.length > 0) {
                this.adapter.itemDebug(historyItem, `${logPrefix} time period from ${rangeStart.format(this.adapter.dateFormat)} to ${rangeEnd.format(this.adapter.dateFormat)} - contract data: ${JSON.stringify(contractDataOfRange)}`);

                // für jeden Vertrag, der in dem Zeitraum gültig ist, die Kosten berechnen und aufsummieren
                for (const data of contractDataOfRange) {
                    const cStart = moment(data.start, this.adapter.dateFormat, true);
                    const cEnd = moment(data.end, this.adapter.dateFormat, true);

                    let start = cStart;
                    let end = cEnd;

                    if (rangeStart.isAfter(cStart)) {
                        // Wenn der Zeitraum nach dem Start des Vertrags beginnt, wird der Zeitraum als Startzeitpunkt genommen
                        start = rangeStart;
                    }

                    if (rangeEnd.isBefore(cEnd)) {
                        // Wenn der Zeitraum vor dem Ende des Vertrags endet, wird der Zeitraum als Endzeitpunkt genommen
                        end = rangeEnd;
                    }

                    this.adapter.itemDebug(historyItem, `${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} - contract data: ${JSON.stringify(data)}`);

                    const consumption = await this.adapter.sql.getTotal(historyItem, datapointItem, interval, start.startOf('day').valueOf(), end.endOf('day').valueOf(), logPrefixAppend);

                    result.start = result.start ? start.isBefore(result.start) ? start : result.start : start;
                    result.end = result.end ? end.isAfter(result.start) ? end : result.end : end;

                    if (consumption && consumption.delta !== null) {
                        const daysOfRange = end.diff(start, 'days') + 1;
                        let delta = consumption.delta;

                        if (end.isAfter(moment()) || end.isSame(moment(), 'day')) {
                            // Wenn das Ende des Zeitraums in der Zukunft liegt, wird der aktuelle Verbrauchswert (state) als Endwert genommen
                            const state = await this.adapter.getStateAsync(historyItem.id as string);
                            delta = (state.val as number) - consumption.min;

                            this.log.silly(`${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} using state, not database value (delta: ${mathjs.round(delta, historyItem.decimals)}, database delta: ${mathjs.round(consumption.delta, 3)})`);
                        }

                        this.calculationOfRange(this.costList[historyItem.idContractType].calculation, data, delta, daysOfRange, result, logPrefixAppend);

                        this.adapter.itemDebug(historyItem, `${logPrefix} time period from ${start.format(this.adapter.dateFormat)} to ${end.format(this.adapter.dateFormat)} - calculation result: ${JSON.stringify(result)}`);
                    }
                }

                // Prüfen, ob der Zeitraum vollständig von den Vertragsdaten abgedeckt ist, da sonst keine Kostenberechnung möglich ist
                if ((rangeStart.isSame(result.start) || rangeStart.isBetween(result.start, result.end)) && (rangeEnd.isSame(result.end) || rangeEnd.isBetween(result.start, result.end))) {
                    if (result.consumption) {
                        if (historyItem.costSumOptions?.length > 0) {

                            result.consumption = mathjs.round(result.consumption, historyItem.decimals);
                            result.sum = mathjs.round(
                                (historyItem.costSumOptions?.includes('variableCosts') ? result.variableCosts : 0)
                                + (historyItem.costSumOptions?.includes('basicPrice') ? result.basicPrice : 0)
                                - (historyItem.costSumOptions?.includes('bonusPrice') ? result.bonusPrice : 0)
                                , 2);

                            this.adapter.itemDebug(historyItem, `${logPrefix} start: ${rangeStart.format('DD.MM.YYYY - HH:mm')}, end: ${rangeEnd.format('DD.MM.YYYY - HH:mm')}, sum: ${result.sum}`);

                            return result;

                        } else {
                            this.log.warn(`${logPrefix} no cost sum options in the adapter settings defined`);
                        }
                    } else {
                        this.adapter.itemDebug(historyItem, `${logPrefix} no cosumption available in the result: ${JSON.stringify(result)}`);
                    }
                } else {
                    this.log.error(`${logPrefix} costs can't be calculated because period (${result.start.format(this.adapter.dateFormat)} - ${result.end.format(this.adapter.dateFormat)}) is not between (${rangeStart.format(this.adapter.dateFormat)} - ${rangeEnd.format(this.adapter.dateFormat)}) -> Missing contract data!`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }

        return null;
    }

    /**
     * Kosten für einen Zeitraum berechnen auf Basis der hinterlegten Formel des Vertragtyps
     * 
     * @param formula 
     * @param data 
     * @param consumptionOfRange 
     * @param daysOfRange 
     * @param result 
     * @param logPrefixAppend 
     */
    private calculationOfRange(formula: string, data: ioBroker.AdapterConfigTypes.CostItemData, consumptionOfRange: number, daysOfRange: number, result: CostResult, logPrefixAppend: string): void {
        const logPrefix = `[${this.logPrefix}.calculationOfRange] ${logPrefixAppend}:`

        try {
            const calc = formula.replace(/#([a-zA-Z0-9_]+)/g, (_, key) => {
                if (key === 'val') {
                    return consumptionOfRange.toString();
                } else {
                    return data.variableCosts[key].toString();
                }
            });

            result.consumption = (result.consumption || 0) + consumptionOfRange;
            result.days = (result.days || 0) + daysOfRange;

            result.variableCosts = (result.variableCosts || 0) + mathjs.evaluate(calc);
            result.basicPrice = (result.basicPrice || 0) + (data.basicPrice / 365) * daysOfRange;
            result.bonusPrice = (result.bonusPrice || 0) + (data.bonusPrice / 365) * daysOfRange;

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}