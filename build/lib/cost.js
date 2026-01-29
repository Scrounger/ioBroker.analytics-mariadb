import moment from "moment";
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
            for (const type of this.adapter.config.costsContractTypesList) {
                const costItem = {
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
                    })).sort((a, b) => {
                        const dateA = moment(a.start, 'DD.MM.YYYY');
                        const dateB = moment(b.start, 'DD.MM.YYYY');
                        return dateA.diff(dateB);
                    })
                };
                this.costList[type.id] = costItem;
            }
            this.log.warn(JSON.stringify(this.costList));
        }
        catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
    getContractType(idContractType) {
        return this.adapter.config.costsContractTypesList.find(item => item.id = idContractType);
    }
}
