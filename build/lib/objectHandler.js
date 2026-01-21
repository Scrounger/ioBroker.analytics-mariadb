import _ from 'lodash';
export async function createChannel(adapter, idChannel, name) {
    const logPrefix = '[objectHandler.createChannel]:';
    try {
        await adapter.setObjectNotExistsAsync(idChannel, {
            type: 'channel',
            common: {
                name: name,
            },
            native: {},
        });
    }
    catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}
export async function createOrUpdateState(adapter, utils, id, name, initVal, sourceCommon, datapointsList, sql = false, expert = false) {
    const logPrefix = '[objectHandler.createOrUpdateState]:';
    try {
        if (typeof name === 'string') {
            const translation = utils.I18n.getTranslatedObject(name);
            name = translation && Object.keys(translation).length > 1 ? translation : name;
        }
        const common = {
            name: name,
            type: sourceCommon.type,
            role: sourceCommon.role,
            read: true,
            write: false,
        };
        if (sourceCommon.unit) {
            common.unit = sourceCommon.unit;
        }
        if (expert) {
            common.expert = true;
        }
        if (sql) {
            const sqlPreset = getSqlPreset(datapointsList.idPreset, adapter);
            if (sqlPreset) {
                common.custom = common.custom || {};
                common.custom[adapter.config.sqlInstance] = sqlPreset;
            }
            else {
                adapter.log.error(`${logPrefix} SQL preset with '${datapointsList.idPreset}' not found for state '${id}' -> abort creating state`);
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
            await adapter.setState(id, { val: initVal, ack: true });
        }
        else {
            let obj = await adapter.getObjectAsync(id);
            if (!isStateCommonEqual(obj.common, common, sql, adapter)) {
                adapter.log.debug(`${logPrefix} Updating common properties of state '${id}' (updated properties: ${JSON.stringify(deepDiffBetweenObjects(common, obj.common, adapter))})`);
                await adapter.extendObject(id, { common: common });
            }
        }
    }
    catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}
/**
 * Compare common properties of state
 *
 * @param objCommon
 * @param myCommon
 * @returns
 */
function isStateCommonEqual(objCommon, myCommon, sql, adapter) {
    return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.unit, myCommon.unit) && (!sql || (objCommon.custom && objCommon.custom[adapter.config.sqlInstance] && _.isEqual(objCommon.custom[adapter.config.sqlInstance], myCommon.custom[adapter.config.sqlInstance])));
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
function deepDiffBetweenObjects(object, base, adapter, allowedKeys = undefined, prefix = '') {
    const logPrefix = '[myIob.deepDiffBetweenObjects]:';
    try {
        const changes = (object, base, prefixInner = '') => {
            return _.transform(object, (result, value, key) => {
                const fullKey = prefixInner ? `${prefixInner}.${key}` : key;
                try {
                    if (!_.isEqual(value, base[key]) && ((allowedKeys && allowedKeys.includes(fullKey)) || allowedKeys === undefined)) {
                        if (_.isArray(value)) {
                            if (_.some(value, (item) => _.isObject(item))) {
                                // objects in array exists
                                const tmp = [];
                                let empty = true;
                                for (let i = 0; i <= value.length - 1; i++) {
                                    const res = deepDiffBetweenObjects(value[i], base[key] && base[key][i] ? base[key][i] : {}, adapter, allowedKeys, fullKey);
                                    if (!_.isEmpty(res) || res === 0 || res === false) {
                                        // if (!_.has(result, key)) result[key] = [];
                                        tmp.push(res);
                                        empty = false;
                                    }
                                    else {
                                        tmp.push(null);
                                    }
                                }
                                if (!empty) {
                                    result[key] = tmp;
                                }
                            }
                            else {
                                // is pure array
                                if (!_.isEqual(value, base[key])) {
                                    result[key] = value;
                                }
                            }
                        }
                        else if (_.isObject(value) && _.isObject(base[key])) {
                            const res = changes(value, base[key] ? base[key] : {}, fullKey);
                            if (!_.isEmpty(res) || res === 0 || res === false) {
                                result[key] = res;
                            }
                        }
                        else {
                            result[key] = value;
                        }
                    }
                }
                catch (error) {
                    adapter.log.error(`${logPrefix} transform error: ${error}, stack: ${error.stack}, fullKey: ${fullKey}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
                }
            });
        };
        return changes(object, base, prefix);
    }
    catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}, object: ${JSON.stringify(object)}, base: ${JSON.stringify(base)}`);
    }
    return object;
}
;
function getSqlPreset(idPreset, adapter) {
    const logPrefix = '[objectHandler.getSqlPreset]:';
    try {
        const preset = adapter.config.datapointsSqlPresetsList.find(p => p.idPreset === idPreset);
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
                changesMinDelta: preset.changesMinDelta,
                ignoreBelowNumber: "",
                disableSkippedValueLogging: true,
                retention: preset.retention,
                customRetentionDuration: 365,
                maxLength: 0,
                enableDebugLogs: false,
                debounce: 0,
                ignoreZero: true
            };
        }
    }
    catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return null;
}
