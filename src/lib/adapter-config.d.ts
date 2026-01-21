// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            sqlInstance: string;
            datapointsList: AdapterTypes.DatapointsList[];
            datapointsSqlPresetsList: {
                idPreset: string;
                name: string;
                debounceTime: number;
                changesMinDelta: number;
                retention: number;
            }[];
        }

        namespace AdapterTypes {
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
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };