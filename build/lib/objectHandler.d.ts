export declare function createChannel(adapter: ioBroker.Adapter, idChannel: string, name: string): Promise<void>;
export declare function createOrUpdateState(adapter: ioBroker.Adapter, id: string, initVal: ioBroker.StateValue, sourceCommon: ioBroker.StateCommon, datapointsList: ioBroker.AdapterConfigTypes.DatapointsList, sql?: boolean, expert?: boolean): Promise<void>;
