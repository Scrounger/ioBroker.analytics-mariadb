export function zeroPad(source, places) {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}
/**
 * Id without last part
 *
 * @param id
 * @returns
 */
export function getIdWithoutLastPart(id) {
    const lastIndex = id.lastIndexOf('.');
    return id.substring(0, lastIndex);
}
/**
 * last part of id
 *
 * @param id
 * @returns
 */
export function getIdLastPart(id) {
    const result = id.split('.').pop();
    return result ? result : '';
}
