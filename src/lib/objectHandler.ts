import _ from 'lodash';

export async function createChannel(adapter: ioBroker.Adapter, idChannel: string, name: string): Promise<void> {
    const logPrefix = '[objectHandler.createChannel]:';

    try {
        await adapter.setObjectNotExistsAsync(idChannel, {
            type: 'channel',
            common: {
                name: name,
            },
            native: {},
        });
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}

export async function createOrUpdateState(adapter: ioBroker.Adapter, id: string, type: ioBroker.CommonType, role: string, initVal: ioBroker.StateValue = null, unit: string = null, write: boolean = false, expert: boolean | null = null): Promise<void> {
    const logPrefix = '[objectHandler.createOrUpdateState]:';

    try {
        const common: ioBroker.StateCommon = {
            name: id.split('.').pop(),
            type: type,
            role: role,
            read: true,
            write: write,
        }

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
        } else {
            const obj = await adapter.getObjectAsync(id);

            if (!isStateCommonEqual(obj.common as ioBroker.StateCommon, common)) {
                await adapter.extendObject(id, { common: common });
            }
        }

    } catch (error) {
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
function isStateCommonEqual(objCommon: ioBroker.StateCommon, myCommon: ioBroker.StateCommon): boolean {
    return _.isEqual(objCommon.name, myCommon.name) && _.isEqual(objCommon.role, myCommon.role) && _.isEqual(objCommon.unit, myCommon.unit);
}