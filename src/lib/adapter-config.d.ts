// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            sqlInstance: string;
            datapointsList: AdapterConfigTypes.DatapointsList[];
            datapointsSqlPresetsList: AdapterConfigTypes.DatapointsSqlPresetsList[];
        }

        namespace AdapterConfigTypes {
            interface DatapointsList {
                enable: boolean;
                idSource: string;
                idTarget: string;
                name: string;
                idPreset: string;
                maxDelta: number;
                unit: string;
                ignoreReset: boolean;
            }

            interface DatapointsSqlPresetsList {
                idPreset: string;
                name: string;
                debounceTime: number;
                changesRelogInterval: number;
                changesMinDelta: number;
                retention: number;
            }
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };