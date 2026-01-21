export declare function createChannel(adapter: ioBroker.Adapter, idChannel: string, name: string): Promise<void>;
export declare function createOrUpdateState(adapter: ioBroker.Adapter, id: string, type: ioBroker.CommonType, role: string, initVal?: ioBroker.StateValue, unit?: string, write?: boolean, expert?: boolean | null): Promise<void>;
