import moment from "moment";
export interface CostResult {
    start?: moment.Moment;
    end?: moment.Moment;
    consumption?: number;
    variableCosts?: number;
    basicPrice?: number;
    bonusPrice?: number;
    days?: number;
    sum?: number;
}
export declare class Costs {
    private logPrefix;
    private adapter;
    private log;
    idSuffix: string;
    private costList;
    constructor(adapter: ioBroker.myAdapter);
    init(): void;
    getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType;
    private prepareAndCheckCostList;
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
    getCostOfRange(historyItem: ioBroker.AdapterConfigTypes.HistoryItem, datapointItem: ioBroker.AdapterConfigTypes.DatapointsItem, rangeStart: moment.Moment, rangeEnd: moment.Moment, interval?: string): Promise<CostResult>;
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
    private calculationOfRange;
}
