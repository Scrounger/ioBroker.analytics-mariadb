import _ from 'lodash';
import * as helper from './helper.js';

export async function createChannel(adapter: ioBroker.Adapter, utils: typeof import("@iobroker/adapter-core"), idChannel: string, name: string | ioBroker.Translated): Promise<void> {
    const logPrefix = '[objectHandler.createChannel]:';

    try {
        if (typeof name === 'string') {
            const translation = utils.I18n.getTranslatedObject(name);
            name = translation && Object.keys(translation).length > 1 ? translation : name
        }

        const common = {
            name: name
        };

        if (!(await adapter.objectExists(idChannel))) {
            await adapter.setObject(idChannel, {
                type: 'channel',
                common: common,
                native: {},
            });
        } else {
            const obj = await adapter.getObjectAsync(idChannel);

            if (obj && obj.common) {
                if (!isChannelCommonEqual(obj.common as ioBroker.ChannelCommon, common)) {
                    await adapter.extendObject(idChannel, { common: common });

                    const diff = deepDiffBetweenObjects(common, obj.common, adapter);
                    if (diff && diff.icon) {
                        diff.icon = _.truncate(diff.icon);
                    } // reduce base64 image string for logging

                    adapter.log.debug(`${logPrefix} channel updated '${idChannel}' (updated properties: ${JSON.stringify(diff)})`);
                }
            }
        }
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}

export async function createOrUpdateState(adapter: ioBroker.Adapter, utils: typeof import("@iobroker/adapter-core"), id: string, name: string | ioBroker.Translated, initVal: ioBroker.StateValue, sourceCommon: ioBroker.StateCommon, item: ioBroker.AdapterConfigTypes.DatapointsItem | undefined = undefined, sql: boolean = false, expert: boolean = false): Promise<void> {
    const logPrefix = '[objectHandler.createOrUpdateState]:';

    try {

        if (typeof name === 'string') {
            const translation = utils.I18n.getTranslatedObject(name);
            name = translation && Object.keys(translation).length > 1 ? translation : name;
        }

        const common: ioBroker.StateCommon = {
            name: name,
            type: sourceCommon.type,
            role: sourceCommon.role,
            read: true,
            write: false,
        }

        if (sourceCommon.unit) {
            common.unit = sourceCommon.unit;
        }

        if (expert) {
            common.expert = true;
        }

        common.role = sourceCommon.role && sourceCommon.role !== 'state' && sourceCommon.role !== 'value' ? sourceCommon.role : assignPredefinedRoles(common, id, adapter);

        if (item && sql) {
            const sqlPreset = getSqlPreset(item.idPreset, item.type, adapter);

            if (sqlPreset) {
                common.custom = common.custom || {};
                common.custom[adapter.config.sqlInstance] = sqlPreset;
            } else {
                adapter.log.error(`${logPrefix} SQL preset with '${item.idPreset}' not found for state '${id}' -> abort creating state`);
                return;
            }
        }

        if (!(await adapter.objectExists(id))) {
            adapter.log.debug(`${logPrefix} Creating state ${id}`);

            await adapter.setObjectNotExistsAsync(id, {
                type: 'state',
                common: common,
                native: {},
            });

            await adapter.setStateChangedAsync(id, { val: initVal, ack: true });
        } else {
            const obj = await adapter.getObjectAsync(id);

            if (!isStateCommonEqual(obj.common as ioBroker.StateCommon, common, sql, adapter)) {
                adapter.log.debug(`${logPrefix} Updating common properties of state '${id}' (updated properties: ${JSON.stringify(deepDiffBetweenObjects(common, obj.common, adapter))})`);

                await adapter.extendObject(id, { common: common });
            }
        }

    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}

/**
 * Compare common properties of channel
 *
 * @param objCommon
 * @param myCommon
 * @returns
 */
function isChannelCommonEqual(objCommon: ioBroker.ChannelCommon, myCommon: ioBroker.ChannelCommon): boolean {
    return (!myCommon.name || _.isEqual(objCommon.name, myCommon.name)) && (!myCommon.icon || objCommon.icon === myCommon.icon) && objCommon.desc === myCommon.desc && objCommon.role === myCommon.role;
}


/**
 * Compare common properties of state
 *
 * @param objCommon
 * @param myCommon
 * @returns
 */
function isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon, sql: boolean, adapter: ioBroker.Adapter): boolean {
    return (_.isEqual(objCommon.name, myCommon.name) || myCommon.name === null) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.unit, myCommon.unit) && _.isEqual(objCommon.expert, myCommon.expert) && (!sql || (objCommon.custom && objCommon.custom[adapter.config.sqlInstance] && _.isEqual(objCommon.custom[adapter.config.sqlInstance], myCommon.custom[adapter.config.sqlInstance])));
}

function assignPredefinedRoles(common: ioBroker.StateCommon, id: string, adapter: ioBroker.Adapter): string {
    //https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/dev/stateroles.md

    const logPrefix = '[myIob.assignPredefinedRoles]:';

    try {
        id = helper.getIdLastPart(id);

        if (common.type === 'boolean') {
            if (common.read === true && common.write === true) {
                if (id.toLocaleLowerCase().includes('enable')) {
                    return 'switch.enable'
                }
                if (id.toLocaleLowerCase().includes('light') || id.toLocaleLowerCase().includes('led')) {
                    return 'switch.light'
                }
                if (id.toLocaleLowerCase().includes('power') || id.toLocaleLowerCase().includes('poe')) {
                    return 'switch.power'
                }

                return 'switch';
            }

            if (common.read === true && common.write === false) {
                if (id.toLocaleLowerCase().includes('connected') || id.toLocaleLowerCase().includes('reachable') || id.toLocaleLowerCase().includes('isonline')) {
                    return 'indicator.reachable'
                }
                if (id.toLocaleLowerCase().includes('error')) {
                    return 'indicator.error'
                }
                if (id.toLocaleLowerCase().includes('alarm')) {
                    return 'indicator.alarm'
                }
                if (id.toLocaleLowerCase().includes('maintenance')) {
                    return 'indicator.maintenance'
                }

                return 'sensor'
            }
        }

        if (common.type === 'number') {
            let suffix = '';

            if (common.unit === '°C' || common.unit === '°F' || common.unit === 'K' || id.toLowerCase().includes('temperatur')) {
                suffix = '.temperature';
            }
            if (common.unit === 'lux') {
                suffix = '.brightness';
            }
            if (common.unit === 'ppm') {
                suffix = '.co2';
            }
            if (common.unit === 'mbar') {
                suffix = '.pressure';
            }
            if (common.unit === 'Wh' || common.unit === 'kWh') {
                suffix = '.energy';
            }
            if (common.unit === 'W' || common.unit === 'kW') {
                suffix = '.power';
            }
            if (common.unit === 'A') {
                suffix = '.current';
            }
            if (common.unit === 'V') {
                suffix = '.voltage';
            }
            if (common.unit === 'Hz') {
                suffix = '.frequency';
            }
            if (id.toLocaleLowerCase().includes('longitude')) {
                suffix = '.gps.longitude'
            }
            if (id.toLocaleLowerCase().includes('latitude')) {
                suffix = '.gps.latitude'
            }
            if (id.toLowerCase().includes('humidity') && common.unit !== '') {
                suffix = '.humidity';
            }
            if (id.toLowerCase().includes('battery') && common.unit === '%') {
                suffix = '.battery';
            }
            if (id.toLowerCase().includes('volume') && common.unit === '%') {
                suffix = '.volume';
            }

            if (common.read === true && common.write === true) {
                return `level${suffix}`;
            }

            if (common.read === false && common.write === true) {
                return `level${suffix}`;
            }

            if (common.read === true && common.write === false) {
                return `value${suffix}`;
            }
        }

        if (common.type === 'string') {
            if (common.read === true && common.write === false) {
                if (id.toLocaleLowerCase().includes('firmware') || id.toLocaleLowerCase().includes('version')) {
                    return 'info.firmware';
                } else if (id.toLocaleLowerCase().includes('status')) {
                    return 'info.status';
                } else if (id.toLocaleLowerCase().includes('model')) {
                    return 'info.model';
                } else if (id.toLocaleLowerCase().includes('mac')) {
                    return 'info.mac';
                } else if (id.toLocaleLowerCase().includes('name')) {
                    return 'info.name';
                } else if (id.toLocaleLowerCase().includes('hardware')) {
                    return 'info.hardware';
                } else if (id.toLocaleLowerCase().includes('serial')) {
                    return 'info.serial';
                } else {
                    return 'text';
                }
            } else {
                return 'text';
            }
        }
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }

    return 'state';
}

/**
     * Compare two objects and return properties that are diffrent
     *
     * @param object
     * @param base
     * @param adapter
     * @param allowedKeys
     * @param prefix
     * @returns
     */
function deepDiffBetweenObjects(object: any, base: any, adapter: ioBroker.Adapter, allowedKeys: any = undefined, prefix: string = ''): any {
    const logPrefix = '[myIob.deepDiffBetweenObjects]:';

    try {
        const changes = (object, base, prefixInner = ''): any => {
            return _.transform(object, (result, value, key) => {
                const fullKey: string = prefixInner ? `${prefixInner}.${key as string}` : (key as string);

                try {
                    if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                        if (_.isArray(value)) {

                            if (_.some(value, (item: any) => _.isObject(item))) {
                                // objects in array exists
                                const tmp = [];
                                let empty = true;

                                for (let i = 0; i <= value.length - 1; i++) {
                                    const res = deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);

                                    if (!_.isEmpty(res) || res === 0 || res === false) {
                                        // if (!_.has(result, key)) result[key] = [];
                                        tmp.push(res);
                                        empty = false;
                                    } else {
                                        tmp.push(null);
                                    }
                                }

                                if (!empty) {
                                    result[key] = tmp;
                                }
                            } else {
                                // is pure array
                                if (!_.isEqual(value, base[key])) {
                                    result[key] = value;
                                }
                            }
                        } else if (_.isObject(value) && _.isObject(base[key])) {
                            const res = changes(value, base[key] ? base[key] : {}, fullKey);
                            if (!_.isEmpty(res) || res === 0 || res === false) {
                                result[key] = res;
                            }
                        } else {
                            result[key] = value;
                        }
                    }
                } catch (error) {
                    adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                }
            });
        };

        return changes(object, base, prefix);
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
    }

    return object;
};

function getSqlPreset(idPreset: string, type: 'number' | 'boolean', adapter: ioBroker.Adapter): { enabled: boolean; storageType: string; counter: boolean; aliasId: string; debounceTime: number; blockTime: number; changesOnly: boolean; changesRelogInterval: number; changesMinDelta: number; ignoreBelowNumber: string; disableSkippedValueLogging: boolean; retention: number; customRetentionDuration: number; maxLength: number; enableDebugLogs: boolean; debounce: number; ignoreZero: boolean; } {
    const logPrefix = '[objectHandler.getSqlPreset]:';

    try {
        const preset: ioBroker.AdapterConfigTypes.DatapointsSqlPresetsItem = adapter.config.datapointsSqlPresetsList.find(p => p.idPreset === idPreset);

        if (preset) {
            return {
                enabled: true,
                storageType: "",
                counter: false,
                aliasId: "",
                debounceTime: preset.debounceTime,
                blockTime: 0,
                changesOnly: true,
                changesRelogInterval: preset.changesRelogInterval,
                changesMinDelta: type === 'number' ? preset.changesMinDelta : 0,
                ignoreBelowNumber: "",
                disableSkippedValueLogging: true,
                retention: preset.retention,
                customRetentionDuration: 365,
                maxLength: 0,
                enableDebugLogs: false,
                debounce: 0,
                ignoreZero: true
            }
        }

    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }

    return null;
}