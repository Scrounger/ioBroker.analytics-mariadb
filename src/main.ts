/*
 * Created with @iobroker/create-adapter v3.1.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import url from 'node:url';
import moment from 'moment';

// Load your modules here, e.g.:
// import * as fs from 'fs';
import * as objectHandler from './lib/objectHandler.js';

class AnalyticsMariadb extends utils.Adapter {

    sourceToTarget: Record<string, ioBroker.AdapterConfigTypes.DatapointsList> = {};

    idTotal = 'total';
    idOld = 'old';

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'analytics-mariadb',
            useFormatDate: true
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        const logPrefix = '[onReady]:';

        try {
            if (this.config.sqlInstance) {
                moment.locale(this.language);
                await utils.I18n.init(`${utils.getAbsoluteDefaultDataDir().replace('iobroker-data/', '')}node_modules/iobroker.${this.name}/admin`, this);

                await this.createDatapointsTotal();


            } else {
                this.log.error(`${logPrefix} No SQL instance configured in adapter configuration!`);
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - Callback function
     */
    private onUnload(callback: () => void): void {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${(error as Error).message}`);
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  */
    private async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        const logPrefix = '[onObjectChange]:';

        try {
            if (obj && !obj.from.includes(this.namespace)) {
                // if objects changed outside of this adapter

                if (id.endsWith(`.${this.idTotal}`) || id.endsWith(`.${this.idOld}`)) {
                    this.log.error(`${logPrefix} changing object '${id}' is not allowed, please use the adapter configuration! Changes will be undone !`);

                    const idChannel = id.replace(`${this.namespace}.`, '').replace(`.${this.idTotal}`, '').replace(`.${this.idOld}`, '');
                    const item = this.config.datapointsList.find(i => i.idChannelTarget === idChannel);

                    await this.createDatapointsTotalSingle(idChannel, item);

                } else {
                    // The object was changed
                    this.log.warn(`object ${id} changed: ${JSON.stringify(obj)}`);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id - State ID
     * @param state - State object
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

            if (state.ack === false) {
                // This is a command from the user (e.g., from the UI or other adapter)
                // and should be processed by the adapter
                this.log.info(`User command received for ${id}: ${state.val}`);

                // TODO: Add your control logic here
            }
        } else {
            // The object was deleted or the state value has expired
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    //
    private onMessage(obj: ioBroker.Message): void {
        const logPrefix = '[onMessage]:';

        try {
            if (typeof obj === 'object') {
                if (obj.command === 'getDatapointsSqlPresetsList') {
                    const result = this.config.datapointsSqlPresetsList.map(item => item.idPreset);

                    if (obj.callback) this.sendTo(obj.from, obj.command, result, obj.callback);
                } else {
                    this.log.warn(`${logPrefix} Unknown command: ${JSON.stringify(obj)}`);
                }
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createDatapointsTotal() {
        const logPrefix = '[createDatapointsTotal]:';

        try {

            if (this.config.datapointsList && this.config.datapointsList.length > 0) {
                for (const item of this.config.datapointsList) {
                    const structure = item.idChannelTarget.split('.');

                    let idChannel = '';
                    for (const id of structure) {
                        if (!idChannel) {
                            idChannel = id;
                        } else {
                            idChannel = `${idChannel}.${id}`;
                        }

                        if (structure.indexOf(id) !== structure.length - 1) {
                            await objectHandler.createChannel(this, idChannel, id);
                        } else {
                            await objectHandler.createChannel(this, idChannel, item.name || id);
                        }
                    }

                    await this.createDatapointsTotalSingle(idChannel, item);
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createDatapointsTotalSingle(idChannel: string, item: ioBroker.AdapterConfigTypes.DatapointsList) {
        const logPrefix = '[createDatapointsTotalSingle]:';

        try {
            if (await this.foreignObjectExists(item.idSource)) {
                const sourceObj = await this.getForeignObjectAsync(item.idSource);
                const sourceState = await this.getForeignStateAsync(item.idSource);

                await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idTotal}`, 'cumulative total value', sourceState.val, sourceObj?.common as ioBroker.StateCommon, item, true, false);

                // old must have the same value as total at state creation
                const totalState = await this.getStateAsync(`${idChannel}.${this, this.idTotal}`);
                await objectHandler.createOrUpdateState(this, utils, `${idChannel}.${this, this.idOld}`, 'old cumulative total value', totalState.val, sourceObj?.common as ioBroker.StateCommon, item, false, true);

                if (item.enable) {
                    this.sourceToTarget[item.idSource] = item;

                    await this.subscribeForeignStatesAsync(item.idSource);

                    await this.subscribeObjectsAsync(`${idChannel}.${this, this.idTotal}`);
                    await this.subscribeObjectsAsync(`${idChannel}.${this, this.idOld}`);
                }
            } else {
                this.log.warn(`${logPrefix} source state '${item.idSource}' does not exist, cannot processing functions for '${item.name}' ('${idChannel}')`);
                item.enable = false;
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}

// replace only needed for dev system
const modulePath = url.fileURLToPath(import.meta.url).replace('/development/', '/node_modules/');

if (process.argv[1] === modulePath) {
    // start the instance directly
    new AnalyticsMariadb();
}

export default function startAdapter(options: Partial<utils.AdapterOptions> | undefined): AnalyticsMariadb {
    // compact mode
    return new AnalyticsMariadb(options);
}
