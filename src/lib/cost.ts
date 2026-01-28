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

            for (const type of this.adapter.config.costsContractTypesList) {
                const costItem: ioBroker.AdapterConfigTypes.CostItem = {
                    calculation: type.calcFormula,
                    data: this.adapter.config.costsContractDataList.filter(x => x.idContractType === type.id).map(c => ({
                        provider: c.provider,
                        start: moment(c.start).format('DD.MM.YYYY'),
                        end: moment(c.end).format('DD.MM.YYYY'),
                        variableCosts: Object.fromEntries(c.variableCosts.map(entry => {
                            const [key, value] = entry.split(":");
                            return [key, parseFloat(value.replace(",", "."))];
                        })),
                        basicPrice: c.basicPrice,
                        bonusPrice: c.bonusPrice,
                    }))
                }

                this.costList[type.id] = costItem;
            }

            this.log.warn(JSON.stringify(this.costList));

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    public getContractType(idContractType: string) {
        return this.adapter.config.costsContractTypesList.find(item => item.id = idContractType);
    }
}