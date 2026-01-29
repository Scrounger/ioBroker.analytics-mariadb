import moment from "moment";


export class Cost {
    private logPrefix: string = 'Cost'

    private adapter: ioBroker.myAdapter;
    private utils: typeof import("@iobroker/adapter-core")
    private log: ioBroker.Logger;

    public idChannelCost = 'cost';

    private costList: ioBroker.AdapterConfigTypes.CostList = {};

    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core")) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }

    public async init(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.init]:`

        try {
            this.prepareAndCheckCostList();

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
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

    public getContractType(idContractType: string): ioBroker.AdapterConfigTypes.CostContractType {
        return this.adapter.config.costsContractTypesList.find(item => item.id = idContractType);
    }
}