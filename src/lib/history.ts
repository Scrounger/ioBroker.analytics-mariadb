import moment from 'moment';

import * as helper from './helper.js';
import * as objectHandler from './objectHandler.js';
import { Interval } from './sqlInterface.js';

export class History {
    private logPrefix: string = 'History'

    private adapter: ioBroker.myAdapter;
    private utils: typeof import("@iobroker/adapter-core")
    private log: ioBroker.Logger;

    private idChannelHistory = 'history';

    constructor(adapter: ioBroker.myAdapter, utils: typeof import("@iobroker/adapter-core")) {
        this.adapter = adapter;
        this.utils = utils;
        this.log = adapter.log;
    }

    public async init(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.init]:`

        try {
            await this.createStates(true);
            await this.updateNameOfStates();

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async createStates(isAdapterStart: boolean): Promise<void> {
        const logPrefix = `[${this.logPrefix}.createStates]:`

        try {
            const list = [...this.adapter.config.historyList, ...this.adapter.config.historyCalcList];

            const commonHistory: ioBroker.StateCommon = {
                name: 'generic',
                type: 'number',
                role: 'state',
                read: true,
                write: false,
                def: 0,
            }

            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id);
                await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}`, 'historical values');

                if (typeof item.id === 'string') {
                    // history item
                    const itemObj = await this.adapter.getObjectAsync(item.id);
                    commonHistory.unit = itemObj?.common?.unit;
                } else {
                    // history calc item
                    commonHistory.unit = item.unit;

                    if (isAdapterStart) {
                        // creating the channel sturcture for calc items
                        const structure = item.idChannel.split('.');

                        let idTmp = '';
                        for (const id of structure) {
                            if (!idTmp) {
                                idTmp = id;
                            } else {
                                idTmp = `${idTmp}.${id}`;
                            }

                            await objectHandler.createChannel(this.adapter, this.utils, idTmp, id);
                        }
                    }
                }

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}.${interval}`, null, null, commonHistory, undefined, false, false);

                        await objectHandler.createChannel(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}._${interval}`, `past ${interval}s`);

                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                await objectHandler.createOrUpdateState(this.adapter, this.utils, `${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, null, null, commonHistory, undefined, false, false);
                            }
                        }
                    }
                }
            }

        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async updateNameOfStates(): Promise<void> {
        const logPrefix = `[${this.logPrefix}.updateNameOfStates]:`

        try {
            const list = [...this.adapter.config.historyList, ... this.adapter.config.historyCalcList];

            for (const item of list) {
                const idChannel = item.idChannel || helper.getIdWithoutLastPart(item.id);

                for (const interval of Object.keys(Interval)) {
                    if (interval !== Interval.ALL) {
                        let name = '';

                        if (interval === Interval.day) {
                            name = `${this.utils.I18n.translate('today')} ${moment().format('DD.MM.')}`
                        } else if (interval === Interval.week) {
                            name = `${this.utils.I18n.translate('this week')} (${moment().startOf('week').format('DD.MM.')} - ${moment().format('DD.MM.')})`
                        } else if (interval === Interval.month) {
                            name = moment().format('MMMM YYYY');
                        } else if (interval === Interval.year) {
                            name = moment().format('YYYY');
                        } else {
                            continue;
                        }

                        await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}.${interval}`, name, logPrefix);

                        if (item[interval] > 0) {
                            for (let i = 1; i <= item[interval]; i++) {
                                if (interval === Interval.day) {
                                    if (i === 1) {
                                        name = `Gestern ${moment().add(-i, 'days').format('DD.MM.')}`
                                    } else {
                                        name = moment().add(-i, 'days').format('dddd DD.MM.');
                                    }
                                } else if (interval === Interval.week) {
                                    if (i === 1) {
                                        name = `letzte Woche (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`
                                    } else {
                                        name = `vor ${i} Wochen (${moment().add(-i, 'week').startOf('week').format('DD.MM.')} - ${moment().add(-i, 'week').endOf('week').format('DD.MM.')})`
                                    }
                                } else if (interval === Interval.month) {
                                    name = moment().add(-i, 'month').format('MMMM YYYY');
                                } else if (interval === Interval.year) {
                                    name = moment().add(-i, 'year').format('YYYY');
                                } else {
                                    continue;
                                }

                                await this._updateNameOfStates(`${idChannel}.${this.idChannelHistory}._${interval}.${interval}_${helper.zeroPad(i, 2)}`, name, logPrefix);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }

    private async _updateNameOfStates(id: string, name: string, logPrefix: string): Promise<void> {
        try {
            const obj: any = await this.adapter.getObjectAsync(id);

            if (obj && obj.common && obj.common.name !== name) {
                obj.common.name = name;
                await this.adapter.setObject(id, obj);

                this.log.debug(`${logPrefix} update name of '${id}' to '${name}'`);
            }
        } catch (error) {
            this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
        }
    }
}