export function zeroPad(source: any, places: number): string {
    const zero = places - source.toString().length + 1;
    return Array(+(zero > 0 && zero)).join('0') + source;
}

/**
 * Id without last part
 *
 * @param id
 * @returns
 */
export function getIdWithoutLastPart(id: string): string {
    const lastIndex = id.lastIndexOf('.');
    return id.substring(0, lastIndex);
}

/**
 * last part of id
 *
 * @param id
 * @returns
 */
export function getIdLastPart(id: string): string {
    const result = id.split('.').pop();
    return result ? result : '';
}