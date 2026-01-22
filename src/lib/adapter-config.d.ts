// This file extends the AdapterConfig type from "@iobroker/types"

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
            datapointsList: AdapterConfigTypes.DatapointsItem[];
            datapointsSqlPresetsList: AdapterConfigTypes.DatapointsSqlPresetsItem[];
            historyList: AdapterConfigTypes.HistoryItem[];
        }

        namespace AdapterConfigTypes {
            interface DatapointsItem {
                enable: boolean;
                idSource: string;
                idChannelTarget: string;
                name: string;
                idPreset: string;
                maxDelta: number;
                unit: string;
                ignoreReset: boolean;
                debug: boolean;
            }

            interface DatapointsSqlPresetsItem {
                idPreset: string;
                name: string;
                debounceTime: number;
                changesRelogInterval: number;
                changesMinDelta: number;
                retention: number;
            }

            interface HistoryItem {
                id: string;
                decimals: number;
                days: number;
                weeks: number;
                months: number;
                years: number;
            }
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };