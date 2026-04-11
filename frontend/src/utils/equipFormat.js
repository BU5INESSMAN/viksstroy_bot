export function formatEquipName(name, licensePlate) {
    const plate = licensePlate && licensePlate.trim() ? licensePlate : "нет г.н.";
    return `${name} [${plate}]`;
}
