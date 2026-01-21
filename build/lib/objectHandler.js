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
export async function createOrUpdateState(adapter, id, type, role, initVal = null, unit = null, write = false, expert = null) {
    const logPrefix = '[objectHandler.createOrUpdateState]:';
    try {
        const common = {
            name: id.split('.').pop(),
            type: type,
            role: role,
            read: true,
            write: write,
        };
        if (unit) {
            common.unit = unit;
        }
        if (expert) {
            common.expert = true;
        }
        if (!(await adapter.objectExists(id))) {
            await adapter.setObjectNotExistsAsync(id, {
                type: 'state',
                common: common,
                native: {},
            });
            await adapter.setState(id, { val: initVal, ack: true });
        }
        else {
            const obj = await adapter.getObjectAsync(id);
            if (!isStateCommonEqual(obj.common, common)) {
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
function isStateCommonEqual(objCommon, myCommon) {
    return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.unit, myCommon.unit);
}
