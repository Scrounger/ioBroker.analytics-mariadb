// This file extends the AdapterConfig type from "@iobroker/types"
import { Interval, SqlInterface } from './sqlInterface.js';
import { Datapoints } from './datapoints.js';
import { Cost } from './cost.js';

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            sqlInstance: string;
            totalDebounceTime: number;
            historyDefaultDays: number;
            historyDefaultWeeks: number;
            historyDefaultMonths: number;
            historyDefaultYears: number;
            historyDefaultUpdateDeBounce: number;
            datapointsNumberList: AdapterConfigTypes.DatapointsItem[];
            datapointsBooleanList: AdapterConfigTypes.DatapointsItem[];
            datapointsSqlPresetsList: AdapterConfigTypes.DatapointsSqlPresetsItem[];
            historyList: AdapterConfigTypes.HistoryItem[];
            historyCalcList: AdapterConfigTypes.HistoryItem[];
            costsContractTypesList: AdapterConfigTypes.CostContractType[];
            costsContractDataList: AdapterConfigTypes.CostContractData[];
            sqlWriteTimeout: number;
            cronUpdateHistoryAtDayChange: string;
        }

        namespace AdapterConfigTypes {
            interface DatapointsItem {
                enable: boolean;
                idSource: string;
                idChannelTarget: string;
                idSql: string;
                name: string;
                idPreset: string;
                maxDelta?: number;
                ignoreReset?: boolean;
                sqlWhereAppend?: string;
                debug: boolean;
                type?: ioBroker.CommonType;        // not used in AdapterConfig
            }

            interface DatapointsSqlPresetsItem {
                idPreset: string;
                type: ioBroker.CommonType;
                name: string;
                debounceTime: number;
                changesRelogInterval: number;
                changesMinDelta: number;
                retention: number;
            }

            interface HistoryItem {
                id: string | string[];
                idChannel?: string;
                formula?: string;
                decimals: number;
                unit?: string;
                day: number;
                week: number;
                month: number;
                year: number;
                debounce: number;
                idContractType: string;
                debug: boolean;
            }

            interface CostContractType {
                id: string;
                calcFormula: string;
                currency: string;
                debug: boolean;
            }

            interface CostContractData {
                idContractType: string;
                provider: string;
                start: string;
                end: string;
                variableCosts: string[];
                basicPrice: number;
                bonusPrice: number;
            }

            interface CostList {
                [key: string]: CostItem
            }

            interface CostItem {
                calculation: string,
                data: {
                    provider: string;
                    start: string;
                    end: string;
                    variableCosts: { [key: string]: number };
                    basicPrice: number;
                    bonusPrice: number;
                }[];
            }
        }

        interface myAdapter extends ioBroker.Adapter {
            sql: SqlInterface;
            datapoints: Datapoints;
            cost: Cost;

            sourceToDatapoint: Record<string, ioBroker.AdapterConfigTypes.DatapointsItem>;
            timeoutBoolean: Record<string, ioBroker.Timeout>;

            itemDebug(item: ioBroker.AdapterConfigTypes.DatapointsItem | ioBroker.AdapterConfigTypes.HistoryItem, message: string): void
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };