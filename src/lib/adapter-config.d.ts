// This file extends the AdapterConfig type from "@iobroker/types"
import { Interval, SqlInterface } from './sqlInterface.js';

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
            datapointsNumberList: AdapterConfigTypes.DatapointsItem[];
            datapointsBooleanList: AdapterConfigTypes.DatapointsItem[];
            datapointsSqlPresetsList: AdapterConfigTypes.DatapointsSqlPresetsItem[];
            historyList: AdapterConfigTypes.HistoryItem[];
            historyCalcList: AdapterConfigTypes.HistoryItem[];
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
                type?: 'number' | 'boolean';        // not used in AdapterConfig
            }

            interface DatapointsSqlPresetsItem {
                idPreset: string;
                type: 'number' | 'boolean';
                name: string;
                debounceTime: number;
                changesRelogInterval: number;
                changesMinDelta: number;
                retention: number;
            }

            interface HistoryItem {
                id: string;
                formula?: string;
                decimals: number;
                days: number;
                weeks: number;
                months: number;
                years: number;
                debug: boolean;
            }
        }

        interface myAdapter extends ioBroker.Adapter {
            sql: SqlInterface;

            itemDebug(item: ioBroker.AdapterConfigTypes.DatapointsItem, message: string): void
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };